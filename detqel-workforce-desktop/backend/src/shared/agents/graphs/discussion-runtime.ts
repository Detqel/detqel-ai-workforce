import { createScopedLogger } from "../../logging/logger.js";
import type { CallUsage, ChatMessage, LiteLlmClient, ReasoningEffort } from "../litellm.client.js";
import type { VirtualKeyRegistry } from "../virtual-key.registry.js";
import type { PomlLoader } from "../poml/loader.js";
import { AGENT_RUNTIME_PROCESSES } from "../../../constants/agentRuntimeConstants.js";
import { POML_DISCUSSION_IDS } from "../../../constants/pomlConstants.js";
import { DOCUMENT_LIMITS } from "../../../constants/documentConstants.js";
import {
    DISCUSSION_CAPABILITY_MODES,
    DISCUSSION_CAPABILITY_SHAPING,
    DISCUSSION_INTENTS,
    DISCUSSION_LIMITS,
    DISCUSSION_REASONING,
    DISCUSSION_RESPONSE_SHAPING,
    DISCUSSION_SOURCE_TYPES,
    DISCUSSION_SPEAKER_ROLES,
    DISCUSSION_TEMPERATURE,
    DISCUSSION_TRIAGE_KEYS,
    type DiscussionCapabilityMode,
    type DiscussionIntent,
    type DiscussionResponseMode,
    type DiscussionSpeakerRole,
} from "../../../constants/discussionConstants.js";

const logger = createScopedLogger("discussion-runtime");

/** An agent taking part in a discussion. Its persona is the POML prompt named by promptRef. */
export interface DiscussionParticipant {
    readonly agentId: string;
    readonly name: string;
    readonly role: string;
    readonly promptRef: string;
    readonly isLead: boolean;
}

export interface TeamContext {
    readonly name: string;
    readonly purpose: string | null;
    readonly members: ReadonlyArray<DiscussionParticipant>;
}

/** A message from the session transcript. speakerName is set for agent replies in team discussions. */
export interface TranscriptMessage {
    readonly role: "user" | "assistant";
    readonly content: string;
    readonly speakerName: string | null;
}

export interface DiscussionSource {
    readonly type: string;
    readonly title: string;
    readonly reference: string;
    readonly url?: string;
}

export interface RetrievedContext {
    readonly text: string;
    readonly source: string;
}

export interface WebContext {
    readonly title: string;
    readonly url: string;
    readonly snippet: string;
}

/** Retrieval collaborators the expert path draws on. Each is optional. */
export interface DiscussionCollaborators {
    retrieveKnowledge?(query: string): Promise<RetrievedContext[]>;
    searchWeb?(query: string): Promise<WebContext[]>;
}

/** A teammate the lead hands part of the request to. */
export interface PlannedHandoff {
    readonly name: string;
    readonly task: string;
}

export interface TurnContext {
    readonly workspaceId: string;
    readonly participant: DiscussionParticipant;
    readonly speakerRole: DiscussionSpeakerRole;
    /** Set for team discussions. */
    readonly team: TeamContext | null;
    /** Memory: summary of messages older than the transcript window. */
    readonly summary: string | null;
    /** Recent transcript, oldest first, excluding the user's latest message. */
    readonly transcript: ReadonlyArray<TranscriptMessage>;
    /** The user's latest message, which this turn answers. */
    readonly message: string;
    readonly responseMode: DiscussionResponseMode;
    readonly capabilityMode: DiscussionCapabilityMode;
    readonly webEnabled: boolean;
    readonly collaborators: DiscussionCollaborators;
    /** For a delegate: who assigned the work and what to contribute. */
    readonly assignment?: { readonly leadName: string; readonly task: string };
    /** For a lead: the teammates who will speak after this reply. */
    readonly handoffs?: ReadonlyArray<PlannedHandoff>;
    /** For a lead's wrap-up: the teammates whose contributions it brings together. */
    readonly contributors?: ReadonlyArray<string>;
    /** Set when this reply is the document the user asked for. */
    readonly document?: DocumentRequest;
}

/** A document the user asked for in this turn. */
export interface DocumentRequest {
    readonly title: string;
}

export interface TriageResult {
    readonly intent: DiscussionIntent;
    /** The complete reply for a conversational message; null for a task. */
    readonly reply: string | null;
    readonly handoffs: ReadonlyArray<PlannedHandoff>;
    /** Set when the user asked for a document to keep. */
    readonly document: DocumentRequest | null;
    readonly usage: CallUsage;
}

export interface CompletionOutput {
    readonly content: string;
    readonly usage: CallUsage;
}

/** What a knowledge or web search found: prompt blocks for grounding, and the sources to cite. */
export interface GroundingResult {
    readonly blocks: ReadonlyArray<string>;
    readonly sources: ReadonlyArray<DiscussionSource>;
}

export const ZERO_USAGE: CallUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 };

export function addUsage(...parts: ReadonlyArray<CallUsage>): CallUsage {
    return parts.reduce((total, part) => ({
        inputTokens: total.inputTokens + part.inputTokens,
        outputTokens: total.outputTokens + part.outputTokens,
        cachedTokens: total.cachedTokens + part.cachedTokens,
        costUsd: total.costUsd + part.costUsd,
    }), ZERO_USAGE);
}

/**
 * Runs the model side of a discussion through the gateway, using the workspace's orchestration virtual key.
 *
 * Every call is assembled with a stable prefix (persona with global guidance, team context, memory summary,
 * then the append-only transcript) and puts everything that varies per turn into the final user message. The
 * prefix is identical across turns of a session, which lets providers that cache prompts serve it from cache.
 *
 * Each method is one step of a reply; the discussion turn graph decides which steps run and in what order.
 * - triage: one cheap call that classifies the message and, for a conversational message, writes the reply.
 *   A lead also decides which teammates should contribute. Greetings and small talk end here.
 * - searchKnowledge / searchWeb: expert retrieval from the session knowledge base and the web.
 * - write: the fast reply, streamed, with light reasoning.
 * - draft then review: the expert reply, drafted with the provider's default reasoning, then checked against
 *   the sources while the corrected reply streams.
 * - summarize: folds older messages into the session's memory summary.
 */
export class DiscussionRuntime {
    constructor(
        private readonly gateway: LiteLlmClient,
        private readonly keys: VirtualKeyRegistry,
        private readonly poml: PomlLoader,
    ) {}

    async triage(context: TurnContext, signal?: AbortSignal): Promise<TriageResult> {
        const delegation = context.speakerRole === DISCUSSION_SPEAKER_ROLES.lead && context.team
            ? await this.render(POML_DISCUSSION_IDS.delegationLead, { maxDelegates: String(DISCUSSION_LIMITS.maxDelegates) })
            : await this.render(POML_DISCUSSION_IDS.delegationNone);
        const instructions = [await this.render(POML_DISCUSSION_IDS.triage), delegation, await this.roleInstructions(context)].filter(Boolean).join("\n\n");
        const completion = await this.complete(context, instructions, {
            reasoningEffort: DISCUSSION_REASONING.triage,
            responseFormatJson: true,
            maxTokens: DISCUSSION_LIMITS.triageMaxTokens,
        }, signal);
        return { ...this.parseTriage(completion.content), usage: completion.usage };
    }

    /** Searches the session's knowledge base for the request. Empty when no knowledge search is available. */
    async searchKnowledge(context: TurnContext): Promise<GroundingResult> {
        if (!context.collaborators.retrieveKnowledge) return { blocks: [], sources: [] };
        const chunks = await context.collaborators.retrieveKnowledge(this.searchQuery(context));
        return {
            blocks: chunks.map(chunk => `[knowledge: ${chunk.source}] ${chunk.text}`),
            sources: chunks.map(chunk => ({ type: DISCUSSION_SOURCE_TYPES.knowledge, title: chunk.source, reference: chunk.source })),
        };
    }

    /** Searches the web for the request. Empty when web search is off for the turn. */
    async searchWeb(context: TurnContext): Promise<GroundingResult> {
        if (!context.webEnabled || !context.collaborators.searchWeb) return { blocks: [], sources: [] };
        const results = await context.collaborators.searchWeb(this.searchQuery(context));
        return {
            blocks: results.map(result => `[web: ${result.title}] ${result.snippet} (${result.url})`),
            sources: results.map(result => ({ type: DISCUSSION_SOURCE_TYPES.web, title: result.title, reference: result.url, url: result.url })),
        };
    }

    /** The query an expert reply searches with: the user's message, plus the assignment for a delegate. */
    searchQuery(context: TurnContext): string {
        return context.assignment ? `${context.message}\n${context.assignment.task}` : context.message;
    }

    /** The grounding instructions for an expert reply, from what the searches found. */
    grounding(blocks: ReadonlyArray<string>): string {
        return blocks.length > 0
            ? `## Retrieved context\nGround your answer in these sources and cite them by title. If they do not answer the question, say so.\n${blocks.join("\n")}`
            : "## Retrieved context\nNothing relevant was retrieved. Answer from your own knowledge and say so plainly.";
    }

    /** Fast mode: writes the reply in one streamed call with light reasoning. */
    async write(context: TurnContext, onText: (text: string) => void, signal?: AbortSignal): Promise<CompletionOutput> {
        const instructions = [await this.roleInstructions(context), this.styleInstructions(context), await this.documentInstructions(context)].filter(Boolean).join("\n\n");
        return this.complete(context, instructions, { reasoningEffort: DISCUSSION_REASONING.fastAnswer }, signal, onText);
    }

    /** Expert mode: writes a grounded draft with the provider's default reasoning. It is checked before it is shown. */
    async draft(context: TurnContext, grounding: string, signal?: AbortSignal): Promise<CompletionOutput> {
        const instructions = [await this.roleInstructions(context), this.styleInstructions(context), await this.documentInstructions(context), grounding].filter(Boolean).join("\n\n");
        return this.complete(context, instructions, {}, signal);
    }

    /** Expert mode: checks the draft against the sources and streams the corrected final reply. */
    async review(context: TurnContext, grounding: string, draft: string, onText: (text: string) => void, signal?: AbortSignal): Promise<CompletionOutput> {
        const instructions = [await this.render(POML_DISCUSSION_IDS.selfCheck), await this.documentInstructions(context), grounding, `## Draft answer\n${draft}`].filter(Boolean).join("\n\n");
        return this.complete(context, instructions, { reasoningEffort: DISCUSSION_REASONING.selfCheck }, signal, onText);
    }

    async summarize(workspaceId: string, previousSummary: string | null, messages: ReadonlyArray<TranscriptMessage>, signal?: AbortSignal): Promise<{ summary: string; usage: CallUsage }> {
        const transcript = messages.map(message => `${message.role === "user" ? "User" : message.speakerName ?? "Agent"}: ${message.content}`).join("\n");
        const prompt = await this.render(POML_DISCUSSION_IDS.summary, { previousSummary: previousSummary ?? "(none yet)", transcript });
        const { virtualKey, modelAlias } = await this.keys.resolveProcessKey(workspaceId, AGENT_RUNTIME_PROCESSES.orchestration);
        const completion = await this.gateway.chatCompletion(virtualKey, {
            model: modelAlias,
            temperature: DISCUSSION_TEMPERATURE,
            reasoningEffort: DISCUSSION_REASONING.summary,
            maxTokens: DISCUSSION_LIMITS.summaryMaxTokens,
            messages: [{ role: "user", content: prompt }],
        }, signal);
        return { summary: completion.content.trim(), usage: completion.usage };
    }

    /**
     * Builds the stable prefix plus the per-turn final message, and runs one completion. With onText the reply
     * is streamed, each piece passed on as it arrives.
     */
    private async complete(
        context: TurnContext,
        turnInstructions: string,
        options: { reasoningEffort?: ReasoningEffort; responseFormatJson?: boolean; maxTokens?: number },
        signal?: AbortSignal,
        onText?: (text: string) => void,
    ): Promise<CompletionOutput> {
        const { virtualKey, modelAlias } = await this.keys.resolveProcessKey(context.workspaceId, AGENT_RUNTIME_PROCESSES.orchestration);
        const request = {
            model: modelAlias,
            temperature: DISCUSSION_TEMPERATURE,
            messages: await this.messages(context, turnInstructions),
            ...options,
        };
        const completion = onText
            ? await this.gateway.chatCompletionStream(virtualKey, request, onText, signal)
            : await this.gateway.chatCompletion(virtualKey, request, signal);
        return { content: completion.content, usage: completion.usage };
    }

    private async messages(context: TurnContext, turnInstructions: string): Promise<ChatMessage[]> {
        const persona = await this.poml.renderAgentPrompt(context.participant.promptRef, { includeGlobalGuidance: true });
        const system = [persona];
        if (context.team) system.push(await this.teamContext(context.team, context.participant));
        if (context.summary) system.push(`## Memory of earlier discussion\n${context.summary}`);

        const history: ChatMessage[] = context.transcript.map(message => ({
            role: message.role,
            // Labels let every agent see who said what at the discussion table.
            content: context.team && message.role === "assistant" && message.speakerName ? `[${message.speakerName}] ${message.content}` : message.content,
        }));
        const finalMessage = turnInstructions ? `${turnInstructions}\n\n## User's latest message\n${context.message}` : context.message;
        return [{ role: "system", content: system.join("\n\n") }, ...history, { role: "user", content: finalMessage }];
    }

    private async teamContext(team: TeamContext, self: DiscussionParticipant): Promise<string> {
        const roster = team.members
            .map(member => `- ${member.name}: ${member.role}${member.isLead ? " (team lead)" : ""}${member.agentId === self.agentId ? " (you)" : ""}`)
            .join("\n");
        return this.render(POML_DISCUSSION_IDS.team, { teamName: team.name, teamPurpose: team.purpose ?? "", roster });
    }

    private async roleInstructions(context: TurnContext): Promise<string> {
        if (context.speakerRole === DISCUSSION_SPEAKER_ROLES.wrapUp) {
            const contributors = context.contributors && context.contributors.length > 0 ? context.contributors.join(", ") : "Your teammates";
            return this.render(POML_DISCUSSION_IDS.leadWrapUp, { contributors });
        }
        if (context.assignment) return this.render(POML_DISCUSSION_IDS.assignment, { leadName: context.assignment.leadName, assignment: context.assignment.task });
        if (context.speakerRole === DISCUSSION_SPEAKER_ROLES.addressed) return this.render(POML_DISCUSSION_IDS.addressed);
        if (context.handoffs && context.handoffs.length > 0) {
            const handoffs = context.handoffs.map(handoff => `- ${handoff.name}: ${handoff.task}`).join("\n");
            return this.render(POML_DISCUSSION_IDS.leadHandoff, { handoffs });
        }
        return "";
    }

    private documentInstructions(context: TurnContext): Promise<string> | string {
        return context.document ? this.render(POML_DISCUSSION_IDS.document, { title: context.document.title }) : "";
    }

    private styleInstructions(context: TurnContext): string {
        return `## Response style\n${DISCUSSION_RESPONSE_SHAPING[context.responseMode]} ${DISCUSSION_CAPABILITY_SHAPING[context.capabilityMode]}`;
    }

    /**
     * Reads the triage JSON. A malformed object is treated as a task with no handoffs, so the full answer step
     * still produces a reply; the raw model output is never shown to the user as an answer.
     */
    private parseTriage(raw: string): Omit<TriageResult, "usage"> {
        let value: unknown;
        try {
            value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
        } catch {
            logger.warn({ length: raw.length }, "Triage returned unreadable JSON; answering as a task");
            return { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [], document: null };
        }
        const record = value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
        const reply = typeof record[DISCUSSION_TRIAGE_KEYS.reply] === "string" ? (record[DISCUSSION_TRIAGE_KEYS.reply] as string).trim() : "";
        // A conversational verdict without a reply would leave the user unanswered, so it is answered as a task.
        const intent = record[DISCUSSION_TRIAGE_KEYS.intent] === DISCUSSION_INTENTS.conversational && reply ? DISCUSSION_INTENTS.conversational : DISCUSSION_INTENTS.task;
        const rawHandoffs = Array.isArray(record[DISCUSSION_TRIAGE_KEYS.delegate]) ? record[DISCUSSION_TRIAGE_KEYS.delegate] as unknown[] : [];
        const handoffs = intent === DISCUSSION_INTENTS.task ? rawHandoffs.flatMap(entry => {
            if (entry === null || typeof entry !== "object") return [];
            const item = entry as Record<string, unknown>;
            const name = typeof item[DISCUSSION_TRIAGE_KEYS.name] === "string" ? (item[DISCUSSION_TRIAGE_KEYS.name] as string).trim() : "";
            const task = typeof item[DISCUSSION_TRIAGE_KEYS.task] === "string" ? (item[DISCUSSION_TRIAGE_KEYS.task] as string).trim().slice(0, DISCUSSION_LIMITS.maxAssignmentCharacters) : "";
            return name && task ? [{ name, task }] : [];
        }) : [];
        // A document is only written for a task; a conversational reply is never saved as one.
        const rawDocument = record[DISCUSSION_TRIAGE_KEYS.document];
        const title = rawDocument !== null && typeof rawDocument === "object" && typeof (rawDocument as Record<string, unknown>)[DISCUSSION_TRIAGE_KEYS.title] === "string"
            ? ((rawDocument as Record<string, unknown>)[DISCUSSION_TRIAGE_KEYS.title] as string).replace(/\s+/g, " ").trim().slice(0, DOCUMENT_LIMITS.maxTitleCharacters)
            : "";
        const document = intent === DISCUSSION_INTENTS.task && title ? { title } : null;
        return { intent, reply: intent === DISCUSSION_INTENTS.conversational ? reply : null, handoffs, document };
    }

    private render(id: string, variables?: Readonly<Record<string, string>>): Promise<string> {
        return this.poml.renderAgentPrompt(id, { variables });
    }
}
