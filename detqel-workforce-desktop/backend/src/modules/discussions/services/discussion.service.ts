import { randomUUID } from "node:crypto";
import { AppError } from "../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../shared/logging/logger.js";
import type { IUnitOfWork } from "../../../shared/contracts/unit-of-work.js";
import type { FileServer } from "../../../shared/rag/file-server.js";
import type { RagService } from "../../../shared/rag/rag.service.js";
import type {
    DiscussionParticipant,
    DiscussionRuntime,
    DiscussionSource,
    PlannedHandoff,
    TeamContext,
    TranscriptMessage,
    TurnContext,
} from "../../../shared/agents/graphs/discussion-runtime.js";
import { addUsage } from "../../../shared/agents/graphs/discussion-runtime.js";
import type { CallUsage } from "../../../shared/agents/litellm.client.js";
import type { IAgentModelProvisioner } from "../../../shared/agents/agent-model.provisioner.js";
import {
    DISCUSSION_CAPABILITY_MODES,
    DISCUSSION_ERRORS,
    DISCUSSION_INTENTS,
    DISCUSSION_LIMITS,
    DISCUSSION_MEMORY,
    DISCUSSION_MESSAGE_ROLES,
    DISCUSSION_SPEAKER_ROLES,
    type DiscussionCapabilityMode,
    type DiscussionResponseMode,
    type DiscussionSpeakerRole,
} from "../../../constants/discussionConstants.js";
import { FILE_SERVER_SCOPES, type FileServerScope } from "../../../constants/fileServerConstants.js";
import type { ChatMessage, ChatSession, PendingResponder, PendingTurn } from "../repositories/discussion.repository.js";
import type { DiscussionParticipants } from "./discussion-participants.js";
import { addressedMembers } from "./discussion-addressing.js";
import type { IWorkspaceWebSearch } from "../../../shared/agents/tools/workspace-web-search.js";

const logger = createScopedLogger("discussion-service");

export interface CreateSessionInput {
    readonly workspaceId: string;
    readonly title?: string;
    /** The recruited agent of a one-to-one discussion. */
    readonly agentId?: string;
    /** The team of a team discussion. */
    readonly teamId?: string;
    readonly createdBy: string;
}

export interface PostMessageInput {
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly message: string;
    readonly responseMode: DiscussionResponseMode;
    readonly capabilityMode: DiscussionCapabilityMode;
    readonly webEnabled: boolean;
}

/** Running gateway totals for a session. */
export interface SessionUsage {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cachedTokens: number;
    readonly costUsd: number;
}

export interface AgentReply {
    readonly message: ChatMessage;
    readonly sources: ReadonlyArray<DiscussionSource>;
}

/** A teammate still due to reply in the current turn. */
export interface PendingSpeaker {
    readonly agentId: string;
    readonly name: string;
    readonly role: string;
    readonly isLead: boolean;
}

export interface PostedTurn {
    readonly userMessage: ChatMessage;
    readonly replies: ReadonlyArray<AgentReply>;
    readonly pending: ReadonlyArray<PendingSpeaker>;
    readonly usage: SessionUsage;
}

export interface ContinuedTurn {
    /** Null when every queued teammate has left the team since the turn started. */
    readonly reply: AgentReply | null;
    readonly pending: ReadonlyArray<PendingSpeaker>;
    readonly usage: SessionUsage;
}

/** Turn settings that every reply of one turn shares. */
interface TurnSettings {
    readonly responseMode: DiscussionResponseMode;
    readonly capabilityMode: DiscussionCapabilityMode;
    readonly webEnabled: boolean;
}

/** One speaker's part in a turn. */
interface SpeakerPlan {
    readonly participant: DiscussionParticipant;
    readonly speakerRole: DiscussionSpeakerRole;
    readonly assignment?: { readonly leadName: string; readonly task: string };
}

interface SpokenReply {
    readonly reply: AgentReply;
    readonly usage: SessionUsage;
    readonly handoffs: ReadonlyArray<DiscussionParticipantHandoff>;
}

interface DiscussionParticipantHandoff {
    readonly member: DiscussionParticipant;
    readonly task: string;
}

/** Resolves the file-server scope location for a session. */
function scopeOf(session: ChatSession): FileServerScope {
    return session.scope === FILE_SERVER_SCOPES.teams ? FILE_SERVER_SCOPES.teams : FILE_SERVER_SCOPES.conversations;
}

function usageOf(session: ChatSession): SessionUsage {
    return { inputTokens: session.inputTokens, outputTokens: session.outputTokens, cachedTokens: session.cachedTokens, costUsd: session.costUsd };
}

function toTranscript(messages: ReadonlyArray<ChatMessage>): TranscriptMessage[] {
    return messages.map(message => ({
        role: message.role === DISCUSSION_MESSAGE_ROLES.assistant ? "assistant" as const : "user" as const,
        content: message.content,
        speakerName: message.speakerName ?? null,
    }));
}

function pendingSpeakers(queue: ReadonlyArray<PendingResponder>, team: TeamContext): PendingSpeaker[] {
    return queue.flatMap(entry => {
        const member = team.members.find(candidate => candidate.agentId === entry.agentId);
        return member ? [{ agentId: member.agentId, name: member.name, role: member.role, isLead: member.isLead }] : [];
    });
}

/**
 * Orchestrates discussions: sessions, messages, per-session connector attachment, knowledge-base ingestion,
 * and the discussion table itself.
 *
 * A one-to-one session is answered by its agent. A team session is a round-robin table: the lead answers first
 * and may hand parts of the request to teammates, who then speak in turn; when the user names teammates, they
 * answer instead, in the order named. The first reply comes back with the posted message, and each queued
 * teammate replies through continueTurn, so the user sees every voice as soon as it is ready. Each speaker
 * first triages the message in one cheap call, so greetings and small talk are answered without a full turn.
 *
 * Every session operation is scoped to its workspace, and deleting a session performs full cleanup (messages via
 * cascade, the vector collection, and the file-server folder). Connectors must belong to the session's workspace
 * before they can be attached.
 */
export class DiscussionService {
    /** Sessions with a queued reply running, so one queued teammate never answers twice. */
    private readonly repliesInFlight = new Set<string>();
    /** Sessions whose memory summary is being refreshed. */
    private readonly memoryInFlight = new Set<string>();

    constructor(
        private readonly unit: IUnitOfWork,
        private readonly runtime: DiscussionRuntime,
        private readonly fileServer: FileServer,
        private readonly rag: RagService,
        private readonly models: IAgentModelProvisioner,
        private readonly participants: DiscussionParticipants,
        private readonly webSearch: IWorkspaceWebSearch,
    ) {}

    /** Expert turns with web enabled need the workspace's Tavily key; checked before anything is saved. */
    private async prepareTurn(workspaceId: string, settings: TurnSettings): Promise<void> {
        await this.models.ensure(workspaceId);
        if (settings.capabilityMode === DISCUSSION_CAPABILITY_MODES.expert && settings.webEnabled) {
            await this.webSearch.assertConfigured(workspaceId);
        }
    }

    async createSession(input: CreateSessionInput): Promise<ChatSession> {
        if (input.agentId && input.teamId) throw new AppError(400, DISCUSSION_ERRORS.targetConflict);
        let scope: FileServerScope;
        let defaultTitle: string;
        if (input.teamId) {
            const { team } = await this.participants.team(input.workspaceId, input.teamId);
            scope = FILE_SERVER_SCOPES.teams;
            defaultTitle = team.name;
        } else if (input.agentId) {
            const agent = await this.participants.soloAgent(input.workspaceId, input.agentId);
            scope = FILE_SERVER_SCOPES.conversations;
            defaultTitle = agent.name;
        } else {
            throw new AppError(400, DISCUSSION_ERRORS.targetRequired);
        }
        const session = await this.unit.discussions.createSession({
            workspaceId: input.workspaceId,
            scope,
            title: input.title?.trim() || defaultTitle,
            agentId: input.agentId ?? null,
            teamId: input.teamId ?? null,
            createdBy: input.createdBy,
        });
        await this.fileServer.ensureSession({ workspaceId: input.workspaceId, scope: scopeOf(session), sessionId: session.id });
        return session;
    }

    listSessions(workspaceId: string): Promise<ChatSession[]> {
        return this.unit.discussions.listSessions(workspaceId);
    }

    async getSession(workspaceId: string, sessionId: string): Promise<ChatSession> {
        const session = await this.unit.discussions.findSessionInWorkspace(sessionId, workspaceId);
        if (!session) throw new AppError(404, DISCUSSION_ERRORS.sessionNotFound);
        return session;
    }

    async listMessages(workspaceId: string, sessionId: string): Promise<ChatMessage[]> {
        await this.getSession(workspaceId, sessionId);
        return this.unit.discussions.listMessages(sessionId);
    }

    /** Full cleanup: drop the vector collection and the session's file-server tree, then delete the row. */
    async deleteSession(workspaceId: string, sessionId: string): Promise<void> {
        const session = await this.getSession(workspaceId, sessionId);
        await this.rag.deleteSession(sessionId).catch(error => logger.warn({ sessionId, error: String(error) }, "Vector collection cleanup did not confirm"));
        await this.fileServer.deleteSession({ workspaceId, scope: scopeOf(session), sessionId }).catch(error => logger.warn({ sessionId, error: String(error) }, "File-server cleanup did not confirm"));
        await this.unit.discussions.deleteSession(sessionId);
        logger.info({ workspaceId, sessionId }, "Deleted discussion session with full cleanup");
    }

    /** Attaches a connector to a session after confirming it belongs to the session's workspace. */
    async attachConnector(workspaceId: string, sessionId: string, connectionId: string): Promise<void> {
        await this.getSession(workspaceId, sessionId);
        const connection = await this.unit.connections.findInWorkspace(connectionId, workspaceId);
        if (!connection) throw new AppError(403, DISCUSSION_ERRORS.connectionNotInWorkspace);
        await this.unit.discussions.attachConnection(sessionId, connectionId);
    }

    async detachConnector(workspaceId: string, sessionId: string, connectionId: string): Promise<boolean> {
        await this.getSession(workspaceId, sessionId);
        return this.unit.discussions.detachConnection(sessionId, connectionId);
    }

    async listAttachedConnectors(workspaceId: string, sessionId: string): Promise<string[]> {
        await this.getSession(workspaceId, sessionId);
        return (await this.unit.discussions.listAttachedConnections(sessionId)).map(row => row.connectionId);
    }

    /** Stores an uploaded knowledge file for the session and ingests it into the session's vector collection. */
    async addKnowledge(workspaceId: string, sessionId: string, fileName: string, mimeType: string, contents: Buffer): Promise<{ chunks: number }> {
        const session = await this.getSession(workspaceId, sessionId);
        // Embedding the document needs the workspace's gateway models, so make sure they are provisioned first.
        await this.models.ensure(workspaceId);
        const stored = await this.fileServer.storeKnowledgeFile({ workspaceId, scope: scopeOf(session), sessionId }, fileName, mimeType, contents);
        const chunks = await this.rag.ingestDocument({ workspaceId, sessionId, source: stored.name, text: contents.toString("utf8") });
        logger.info({ workspaceId, sessionId, fileName, chunks }, "Ingested session knowledge file");
        return { chunks };
    }

    /**
     * Posts the user's message and returns the first reply. In a team session, the teammates still due to reply
     * are queued on the session and returned as pending; each one replies through continueTurn.
     */
    async postMessage(input: PostMessageInput): Promise<PostedTurn> {
        const trimmed = input.message.trim();
        if (trimmed.length === 0) throw new AppError(400, DISCUSSION_ERRORS.emptyMessage);
        if (trimmed.length > DISCUSSION_LIMITS.maxMessageCharacters) throw new AppError(400, DISCUSSION_ERRORS.messageTooLong);
        const session = await this.getSession(input.workspaceId, input.sessionId);
        const settings: TurnSettings = { responseMode: input.responseMode, capabilityMode: input.capabilityMode, webEnabled: input.webEnabled };
        // Provision, check web search, and resolve the speakers before saving the message, so a configuration
        // problem does not leave an unanswered message behind.
        await this.prepareTurn(input.workspaceId, settings);
        const table = await this.resolveTable(session);

        // A new message starts a new turn; teammates still queued from the previous turn no longer speak.
        if (session.pendingTurn) await this.unit.discussions.setPendingTurn(session.id, null);
        const earlier = await this.unit.discussions.listMessages(session.id);
        const turnId = randomUUID();
        const userMessage = await this.unit.discussions.appendMessage({ sessionId: session.id, role: DISCUSSION_MESSAGE_ROLES.user, content: trimmed, turnId });

        const memory = { summary: session.summary, transcript: toTranscript(earlier.slice(session.summarizedMessageCount)) };

        if (table.kind === "solo") {
            const spoken = await this.speak(session, turnId, trimmed, settings, memory, { participant: table.agent, speakerRole: DISCUSSION_SPEAKER_ROLES.solo }, null);
            this.scheduleMemory(session.workspaceId, session.id);
            return { userMessage, replies: [spoken.reply], pending: [], usage: spoken.usage };
        }

        const named = addressedMembers(trimmed, table.team.members);
        const addressed = named.some(member => !member.isLead) ? named : [];
        const first: SpeakerPlan = addressed.length > 0
            ? { participant: addressed[0], speakerRole: DISCUSSION_SPEAKER_ROLES.addressed }
            : { participant: table.lead, speakerRole: DISCUSSION_SPEAKER_ROLES.lead };
        const spoken = await this.speak(session, turnId, trimmed, settings, memory, first, table.team);

        const queue: PendingResponder[] = addressed.length > 0
            ? addressed.slice(1).map(member => ({ agentId: member.agentId, assignment: null }))
            : spoken.handoffs.map(handoff => ({ agentId: handoff.member.agentId, assignment: handoff.task }));
        await this.storeQueue(session, turnId, queue, first.participant.name, settings);
        return { userMessage, replies: [spoken.reply], pending: pendingSpeakers(queue, table.team), usage: spoken.usage };
    }

    /** Lets the next queued teammate reply in the current turn of a team session. */
    async continueTurn(workspaceId: string, sessionId: string): Promise<ContinuedTurn> {
        const session = await this.getSession(workspaceId, sessionId);
        const pending = session.pendingTurn;
        if (!pending || pending.queue.length === 0) throw new AppError(409, DISCUSSION_ERRORS.nothingPending);
        if (this.repliesInFlight.has(sessionId)) throw new AppError(409, DISCUSSION_ERRORS.replyInProgress);
        this.repliesInFlight.add(sessionId);
        try {
            const settings: TurnSettings = {
                responseMode: pending.responseMode as DiscussionResponseMode,
                capabilityMode: pending.capabilityMode as DiscussionCapabilityMode,
                webEnabled: pending.webEnabled,
            };
            await this.prepareTurn(workspaceId, settings);
            const table = await this.resolveTable(session);
            if (table.kind !== "team") throw new AppError(409, DISCUSSION_ERRORS.nothingPending);

            // Teammates removed from the team since the turn started are skipped.
            const remaining = [...pending.queue];
            let next: { entry: PendingResponder; member: DiscussionParticipant } | null = null;
            while (remaining.length > 0 && !next) {
                const entry = remaining.shift() as PendingResponder;
                const member = table.team.members.find(candidate => candidate.agentId === entry.agentId);
                if (member) next = { entry, member };
            }
            if (!next) {
                await this.storeQueue(session, pending.turnId, [], pending.leadName, settings);
                return { reply: null, pending: [], usage: usageOf(session) };
            }

            const messages = await this.unit.discussions.listMessages(sessionId);
            const userMessage = messages.find(message => message.turnId === pending.turnId && message.role === DISCUSSION_MESSAGE_ROLES.user);
            if (!userMessage) throw new AppError(409, DISCUSSION_ERRORS.nothingPending);
            // This turn's user message and earlier replies stay in the transcript, so every teammate sees the
            // table so far and the prompt prefix stays identical for the next speaker.
            const memory = { summary: session.summary, transcript: toTranscript(messages.slice(session.summarizedMessageCount)) };
            const plan: SpeakerPlan = next.entry.assignment
                ? { participant: next.member, speakerRole: DISCUSSION_SPEAKER_ROLES.delegate, assignment: { leadName: pending.leadName, task: next.entry.assignment } }
                : { participant: next.member, speakerRole: DISCUSSION_SPEAKER_ROLES.addressed };
            const spoken = await this.speak(session, pending.turnId, userMessage.content, settings, memory, plan, table.team);

            const stillCurrent = (await this.unit.discussions.findSessionInWorkspace(sessionId, workspaceId))?.pendingTurn?.turnId === pending.turnId;
            // A newer message may have started a new turn while this teammate was replying; its queue is kept.
            if (stillCurrent) await this.storeQueue(session, pending.turnId, remaining, pending.leadName, settings);
            return { reply: spoken.reply, pending: stillCurrent ? pendingSpeakers(remaining, table.team) : [], usage: spoken.usage };
        } finally {
            this.repliesInFlight.delete(sessionId);
        }
    }

    private async resolveTable(session: ChatSession): Promise<
        | { kind: "solo"; agent: DiscussionParticipant }
        | { kind: "team"; team: TeamContext; lead: DiscussionParticipant }
    > {
        if (session.teamId) return { kind: "team", ...(await this.participants.team(session.workspaceId, session.teamId)) };
        if (session.agentId) return { kind: "solo", agent: await this.participants.soloAgent(session.workspaceId, session.agentId) };
        throw new AppError(409, DISCUSSION_ERRORS.sessionWithoutParticipants);
    }

    /**
     * One speaker's reply: triage first (conversational messages end there), then the full answer. A delegate
     * was handed concrete work and answers directly. The reply and its usage are persisted together.
     */
    private async speak(
        session: ChatSession,
        turnId: string,
        message: string,
        settings: TurnSettings,
        memory: { summary: string | null; transcript: TranscriptMessage[] },
        plan: SpeakerPlan,
        team: TeamContext | null,
    ): Promise<SpokenReply> {
        const expert = settings.capabilityMode === DISCUSSION_CAPABILITY_MODES.expert;
        const context: TurnContext = {
            workspaceId: session.workspaceId,
            participant: plan.participant,
            speakerRole: plan.speakerRole,
            team,
            summary: memory.summary,
            transcript: memory.transcript,
            message,
            responseMode: settings.responseMode,
            capabilityMode: settings.capabilityMode,
            webEnabled: expert && settings.webEnabled,
            collaborators: {
                // Retrieval and web search only run on the expert path; fast stays tool-free.
                retrieveKnowledge: expert ? query => this.rag.retrieve(session.workspaceId, session.id, query, DISCUSSION_LIMITS.expertRetrievalTopK) : undefined,
                searchWeb: expert && settings.webEnabled ? query => this.webSearch.search(session.workspaceId, query, DISCUSSION_LIMITS.expertWebResults) : undefined,
            },
            assignment: plan.assignment,
        };

        let content: string;
        let sources: ReadonlyArray<DiscussionSource> = [];
        let usage: CallUsage;
        let handoffs: DiscussionParticipantHandoff[] = [];
        if (plan.speakerRole === DISCUSSION_SPEAKER_ROLES.delegate) {
            const answer = await this.runtime.answer(context);
            ({ content, sources, usage } = answer);
        } else {
            const triage = await this.runtime.triage(context);
            if (triage.intent === DISCUSSION_INTENTS.conversational && triage.reply) {
                content = triage.reply;
                usage = triage.usage;
            } else {
                handoffs = plan.speakerRole === DISCUSSION_SPEAKER_ROLES.lead && team ? this.resolveHandoffs(triage.handoffs, team) : [];
                const answer = await this.runtime.answer({ ...context, handoffs: handoffs.map(handoff => ({ name: handoff.member.name, task: handoff.task })) });
                content = answer.content;
                sources = answer.sources;
                usage = addUsage(triage.usage, answer.usage);
            }
        }

        const saved = await this.unit.discussions.appendMessageWithSources({
            message: {
                sessionId: session.id,
                role: DISCUSSION_MESSAGE_ROLES.assistant,
                content,
                turnId,
                speakerAgentId: plan.participant.agentId,
                speakerName: plan.participant.name,
                speakerRole: plan.participant.role,
                isLead: plan.participant.isLead,
                responseMode: settings.responseMode,
                capabilityMode: settings.capabilityMode,
                tokensUsed: usage.inputTokens + usage.outputTokens,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                cachedTokens: usage.cachedTokens,
                costUsd: usage.costUsd,
            },
            sources: sources.map(source => ({ sourceType: source.type, title: source.title, reference: source.reference, url: source.url })),
        });
        const totals = await this.unit.discussions.addUsage(session.id, usage);
        return { reply: { message: saved, sources }, usage: usageOf(totals), handoffs };
    }

    /** Maps the lead's handoffs onto the roster: known teammates only, never the lead, each once, capped. */
    private resolveHandoffs(planned: ReadonlyArray<PlannedHandoff>, team: TeamContext): DiscussionParticipantHandoff[] {
        const chosen: DiscussionParticipantHandoff[] = [];
        for (const handoff of planned) {
            const wanted = handoff.name.trim().toLocaleLowerCase();
            const member = team.members.find(candidate => !candidate.isLead && candidate.name.trim().toLocaleLowerCase() === wanted);
            if (!member || chosen.some(entry => entry.member.agentId === member.agentId)) continue;
            chosen.push({ member, task: handoff.task });
            if (chosen.length === DISCUSSION_LIMITS.maxDelegates) break;
        }
        return chosen;
    }

    /** Stores the teammates still due to reply; once nobody is left, the turn is over and memory is refreshed. */
    private async storeQueue(session: ChatSession, turnId: string, queue: ReadonlyArray<PendingResponder>, leadName: string, settings: TurnSettings): Promise<void> {
        if (queue.length === 0) {
            await this.unit.discussions.setPendingTurn(session.id, null);
            this.scheduleMemory(session.workspaceId, session.id);
            return;
        }
        const pending: PendingTurn = { turnId, queue, leadName, ...settings };
        await this.unit.discussions.setPendingTurn(session.id, pending);
    }

    /** Refreshes the memory summary in the background, so the user never waits on it. */
    private scheduleMemory(workspaceId: string, sessionId: string): void {
        if (this.memoryInFlight.has(sessionId)) return;
        this.memoryInFlight.add(sessionId);
        void this.refreshMemory(workspaceId, sessionId)
            .catch(error => logger.warn({ sessionId, error: String(error) }, "Memory summary refresh failed; the next turn retries"))
            .finally(() => this.memoryInFlight.delete(sessionId));
    }

    /** Folds all but the most recent messages into the summary once enough of them sit outside it. */
    private async refreshMemory(workspaceId: string, sessionId: string): Promise<void> {
        const session = await this.unit.discussions.findSessionInWorkspace(sessionId, workspaceId);
        if (!session) return;
        const messages = await this.unit.discussions.listMessages(sessionId);
        if (messages.length - session.summarizedMessageCount <= DISCUSSION_MEMORY.triggerAfter) return;
        const coverUntil = messages.length - DISCUSSION_MEMORY.keepRecent;
        const folded = toTranscript(messages.slice(session.summarizedMessageCount, coverUntil));
        const { summary, usage } = await this.runtime.summarize(workspaceId, session.summary, folded);
        if (!summary) return;
        await this.unit.discussions.updateMemory(sessionId, summary, coverUntil);
        await this.unit.discussions.addUsage(sessionId, usage);
        logger.info({ sessionId, summarizedMessageCount: coverUntil }, "Refreshed discussion memory summary");
    }
}
