import { randomUUID } from "node:crypto";
import { Annotation, END, START, StateGraph, type LangGraphRunnableConfig } from "@langchain/langgraph";
import type { CallUsage } from "../litellm.client.js";
import {
    DISCUSSION_ACTIVITY_KINDS,
    DISCUSSION_ACTIVITY_STATUSES,
    DISCUSSION_CAPABILITY_MODES,
    DISCUSSION_INTENTS,
    DISCUSSION_LIMITS,
    DISCUSSION_SPEAKER_ROLES,
    DISCUSSION_STREAM,
    DISCUSSION_STREAM_EVENTS,
    type DiscussionActivityKind,
    type DiscussionCapabilityMode,
    type DiscussionIntent,
    type DiscussionResponseMode,
    type DiscussionSpeakerRole,
} from "../../../constants/discussionConstants.js";
import type { DiscussionActivityDetail, DiscussionActivityStep } from "../../types/discussion-activity.js";
import {
    addUsage,
    ZERO_USAGE,
    type DiscussionCollaborators,
    type DiscussionParticipant,
    type DocumentRequest,
    type DiscussionRuntime,
    type DiscussionSource,
    type PlannedHandoff,
    type TeamContext,
    type TranscriptMessage,
    type TurnContext,
} from "./discussion-runtime.js";

/** One agent's part in a turn. */
export interface SpeakerPlan {
    readonly participant: DiscussionParticipant;
    readonly speakerRole: DiscussionSpeakerRole;
    readonly assignment?: { readonly leadName: string; readonly task: string };
    /** For the lead's wrap-up: the teammates it handed work to. */
    readonly contributors?: ReadonlyArray<string>;
}

/** The lead's closing reply after its teammates: one answer built from their contributions. */
export function wrapUpPlan(lead: DiscussionParticipant, handoffs: ReadonlyArray<SpeakerPlan>): SpeakerPlan {
    return { participant: lead, speakerRole: DISCUSSION_SPEAKER_ROLES.wrapUp, contributors: handoffs.map(handoff => handoff.participant.name) };
}

/** A document requested in this turn, and the agent whose reply completes it. */
export interface TurnDocument extends DocumentRequest {
    readonly ownerAgentId: string;
}

/** A document requested in this turn, and the agent whose reply completes it. */
export interface TurnDocument extends DocumentRequest {
    readonly ownerAgentId: string;
}

/** A finished reply, ready to be saved. */
export interface SpokenReply {
    readonly plan: SpeakerPlan;
    readonly content: string;
    readonly sources: ReadonlyArray<DiscussionSource>;
    readonly usage: CallUsage;
    readonly steps: ReadonlyArray<DiscussionActivityStep>;
}

/** An event streamed to the client. The graph emits agent activity; saving a reply adds the stored records. */
export interface TurnStreamEvent {
    readonly type: string;
    readonly [field: string]: unknown;
}

/** What the graph needs from the application: session memory, and saving each reply as soon as it is done. */
export interface TurnPorts {
    /** The session's memory for the next speaker, including the replies already given in this turn. */
    memory(): Promise<{ summary: string | null; transcript: TranscriptMessage[] }>;
    /**
     * Saves a reply, the speakers still due, and a document still to be written, and returns the events describing
     * what was saved.
     */
    saveReply(reply: SpokenReply, remaining: ReadonlyArray<SpeakerPlan>, pendingDocument: TurnDocument | null): Promise<ReadonlyArray<TurnStreamEvent>>;
    /** Saves a document in the discussion's artifacts and returns the file name it was saved under. */
    saveDocument(title: string, content: string, plan: SpeakerPlan): Promise<{ fileName: string }>;
}

export interface TurnSettings {
    readonly responseMode: DiscussionResponseMode;
    readonly capabilityMode: DiscussionCapabilityMode;
    readonly webEnabled: boolean;
}

export interface TurnEnvironment {
    readonly workspaceId: string;
    readonly team: TeamContext | null;
    /** The user's message this turn answers. */
    readonly message: string;
    readonly settings: TurnSettings;
    readonly collaborators: DiscussionCollaborators;
    readonly ports: TurnPorts;
    /** A document still to be written from an earlier part of this turn. */
    readonly document: TurnDocument | null;
}

const replace = <T>(initial: () => T) => Annotation<T>({ reducer: (_current, next) => next, default: initial });

/** Graph state. Per-speaker fields are reset when the next speaker starts. */
const TurnState = Annotation.Root({
    /** Speakers still due in this turn, in speaking order. */
    queue: replace<SpeakerPlan[]>(() => []),
    current: replace<SpeakerPlan | null>(() => null),
    summary: replace<string | null>(() => null),
    transcript: replace<TranscriptMessage[]>(() => []),
    intent: replace<DiscussionIntent | null>(() => null),
    /** Teammates the current lead handed work to, resolved against the roster. */
    handoffs: replace<SpeakerPlan[]>(() => []),
    grounding: replace<string>(() => ""),
    sources: replace<DiscussionSource[]>(() => []),
    /** Expert mode: the draft the review checks. */
    draftText: replace<string>(() => ""),
    content: replace<string>(() => ""),
    usage: replace<CallUsage>(() => ZERO_USAGE),
    steps: replace<DiscussionActivityStep[]>(() => []),
    /** The document requested in this turn, until the reply that completes it is saved. Kept across speakers. */
    document: replace<TurnDocument | null>(() => null),
});
type State = typeof TurnState.State;

const NODES = { next: "next", triage: "triage", research: "research", write: "write", draft: "draft", review: "review", save: "save" } as const;

/** Maps the lead's handoffs onto the roster: known teammates only, never the lead, each once, capped. */
export function resolveHandoffs(planned: ReadonlyArray<PlannedHandoff>, team: TeamContext, lead: DiscussionParticipant): SpeakerPlan[] {
    const chosen: SpeakerPlan[] = [];
    for (const handoff of planned) {
        const wanted = handoff.name.trim().toLocaleLowerCase();
        const member = team.members.find(candidate => candidate.agentId !== lead.agentId && candidate.name.trim().toLocaleLowerCase() === wanted);
        if (!member || chosen.some(entry => entry.participant.agentId === member.agentId)) continue;
        chosen.push({ participant: member, speakerRole: DISCUSSION_SPEAKER_ROLES.delegate, assignment: { leadName: lead.name, task: handoff.task } });
        if (chosen.length === DISCUSSION_LIMITS.maxDelegates) break;
    }
    return chosen;
}

/**
 * The discussion table as a LangGraph state graph. One run is one turn: every queued speaker replies in order.
 * When a lead hands work out, its teammates join the queue as it finishes, followed by the lead's wrap-up, which
 * brings their contributions into one answer. Each speaker triages the message (greetings end there), researches
 * in expert mode, then writes; expert drafts and then streams a reviewed reply. Every reply is saved the moment
 * it is done, so leaving mid-turn keeps what was said and the speakers still due.
 *
 * Progress streams through LangGraph's custom stream mode: who is speaking, each activity step as it starts and
 * finishes, and the reply text as it is written.
 */
export function buildDiscussionTurnGraph(runtime: DiscussionRuntime, environment: TurnEnvironment) {
    const expert = environment.settings.capabilityMode === DISCUSSION_CAPABILITY_MODES.expert;

    const emit = (config: LangGraphRunnableConfig, event: TurnStreamEvent) => config.writer?.(event);
    const speakerId = (state: State) => (state.current as SpeakerPlan).participant.agentId;

    const contextFor = (state: State): TurnContext => {
        const plan = state.current as SpeakerPlan;
        return {
            workspaceId: environment.workspaceId,
            participant: plan.participant,
            speakerRole: plan.speakerRole,
            team: environment.team,
            summary: state.summary,
            transcript: state.transcript,
            message: environment.message,
            responseMode: environment.settings.responseMode,
            capabilityMode: environment.settings.capabilityMode,
            webEnabled: expert && environment.settings.webEnabled,
            collaborators: environment.collaborators,
            assignment: plan.assignment,
            handoffs: state.handoffs.map(handoff => ({ name: handoff.participant.name, task: handoff.assignment?.task ?? "" })),
            contributors: plan.contributors,
            document: documentFor(state) ?? undefined,
        };
    };

    /**
     * The document this speaker's reply is, if any: the agent that was asked for it writes it, unless it handed
     * work to teammates, in which case its wrap-up after them is the document.
     */
    function documentFor(state: State): TurnDocument | null {
        const plan = state.current;
        if (!state.document || !plan || plan.participant.agentId !== state.document.ownerAgentId) return null;
        if (plan.speakerRole === DISCUSSION_SPEAKER_ROLES.delegate) return null;
        return plan.speakerRole === DISCUSSION_SPEAKER_ROLES.wrapUp || state.handoffs.length === 0 ? state.document : null;
    }

    const instant = (kind: DiscussionActivityKind, detail: DiscussionActivityDetail): DiscussionActivityStep =>
        ({ id: randomUUID(), kind, status: DISCUSSION_ACTIVITY_STATUSES.done, detail, startedAt: new Date().toISOString(), durationMs: 0 });

    /** Runs one activity step: reports it as running, then done (with what it found) or failed. */
    async function track<T>(
        state: State,
        config: LangGraphRunnableConfig,
        kind: DiscussionActivityKind,
        detail: DiscussionActivityDetail | undefined,
        work: () => Promise<T>,
        outcome?: (result: T) => DiscussionActivityDetail,
    ): Promise<{ result: T; step: DiscussionActivityStep }> {
        const startedAt = Date.now();
        const running: DiscussionActivityStep = { id: randomUUID(), kind, status: DISCUSSION_ACTIVITY_STATUSES.running, detail, startedAt: new Date(startedAt).toISOString() };
        emit(config, { type: DISCUSSION_STREAM_EVENTS.activity, agentId: speakerId(state), step: running });
        try {
            const result = await work();
            const step: DiscussionActivityStep = { ...running, status: DISCUSSION_ACTIVITY_STATUSES.done, detail: { ...detail, ...outcome?.(result) }, durationMs: Date.now() - startedAt };
            emit(config, { type: DISCUSSION_STREAM_EVENTS.activity, agentId: speakerId(state), step });
            return { result, step };
        } catch (error) {
            const step: DiscussionActivityStep = { ...running, status: DISCUSSION_ACTIVITY_STATUSES.failed, durationMs: Date.now() - startedAt };
            if (!config.signal?.aborted) emit(config, { type: DISCUSSION_STREAM_EVENTS.activity, agentId: speakerId(state), step });
            throw error;
        }
    }

    const streamText = (state: State, config: LangGraphRunnableConfig) => (text: string) =>
        emit(config, { type: DISCUSSION_STREAM_EVENTS.token, agentId: speakerId(state), text });

    async function next(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        const [current, ...rest] = state.queue;
        const memory = await environment.ports.memory();
        const { participant } = current;
        emit(config, {
            type: DISCUSSION_STREAM_EVENTS.speaker,
            agentId: participant.agentId,
            name: participant.name,
            role: participant.role,
            isLead: participant.isLead,
            turnRole: current.speakerRole,
        });
        const steps: DiscussionActivityStep[] = [];
        if (current.assignment) {
            const assigned = instant(DISCUSSION_ACTIVITY_KINDS.assigned, { leadName: current.assignment.leadName, task: current.assignment.task });
            emit(config, { type: DISCUSSION_STREAM_EVENTS.activity, agentId: participant.agentId, step: assigned });
            steps.push(assigned);
        }
        return {
            current,
            queue: rest,
            summary: memory.summary,
            transcript: memory.transcript,
            intent: null,
            handoffs: [],
            grounding: "",
            sources: [],
            draftText: "",
            content: "",
            usage: ZERO_USAGE,
            steps,
        };
    }

    async function triage(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        const plan = state.current as SpeakerPlan;
        const { result, step } = await track(state, config, DISCUSSION_ACTIVITY_KINDS.understanding, undefined,
            () => runtime.triage(contextFor(state), config.signal),
            verdict => ({ conversational: verdict.intent === DISCUSSION_INTENTS.conversational }));
        const steps = [...state.steps, step];
        if (result.intent === DISCUSSION_INTENTS.conversational && result.reply) {
            emit(config, { type: DISCUSSION_STREAM_EVENTS.token, agentId: plan.participant.agentId, text: result.reply });
            return { intent: result.intent, content: result.reply, usage: result.usage, steps };
        }
        // The first document asked for in a turn is the one kept; a later speaker cannot replace it.
        const document = state.document ?? (result.document ? { ...result.document, ownerAgentId: plan.participant.agentId } : null);
        const handoffs = plan.speakerRole === DISCUSSION_SPEAKER_ROLES.lead && environment.team
            ? resolveHandoffs(result.handoffs, environment.team, plan.participant)
            : [];
        if (handoffs.length > 0) {
            const coordinating = instant(DISCUSSION_ACTIVITY_KINDS.coordinating, { names: handoffs.map(handoff => handoff.participant.name) });
            emit(config, { type: DISCUSSION_STREAM_EVENTS.activity, agentId: plan.participant.agentId, step: coordinating });
            steps.push(coordinating);
        }
        return { intent: result.intent, handoffs, usage: result.usage, steps, document };
    }

    async function research(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        const context = contextFor(state);
        const steps = [...state.steps];
        const blocks: string[] = [];
        const sources: DiscussionSource[] = [];
        if (context.collaborators.retrieveKnowledge) {
            const { result, step } = await track(state, config, DISCUSSION_ACTIVITY_KINDS.searchingKnowledge, undefined,
                () => runtime.searchKnowledge(context), found => ({ count: found.sources.length }));
            blocks.push(...result.blocks);
            sources.push(...result.sources);
            steps.push(step);
        }
        if (context.webEnabled && context.collaborators.searchWeb) {
            const { result, step } = await track(state, config, DISCUSSION_ACTIVITY_KINDS.searchingWeb, { query: runtime.searchQuery(context) },
                () => runtime.searchWeb(context), found => ({ count: found.sources.length }));
            blocks.push(...result.blocks);
            sources.push(...result.sources);
            steps.push(step);
        }
        return { grounding: runtime.grounding(blocks), sources, steps };
    }

    async function write(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        const plan = state.current as SpeakerPlan;
        const wrappingUp = plan.speakerRole === DISCUSSION_SPEAKER_ROLES.wrapUp;
        const document = documentFor(state);
        const names = wrappingUp && plan.contributors ? { names: plan.contributors } : {};
        const { result, step } = await track(state, config,
            document ? DISCUSSION_ACTIVITY_KINDS.writingDocument : wrappingUp ? DISCUSSION_ACTIVITY_KINDS.consolidating : DISCUSSION_ACTIVITY_KINDS.writing,
            document ? { ...names, title: document.title } : wrappingUp ? names : undefined,
            () => runtime.write(contextFor(state), streamText(state, config), config.signal));
        return { content: result.content, usage: addUsage(state.usage, result.usage), steps: [...state.steps, step] };
    }

    async function draft(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        const { result, step } = await track(state, config, DISCUSSION_ACTIVITY_KINDS.drafting, undefined,
            () => runtime.draft(contextFor(state), state.grounding, config.signal));
        return { draftText: result.content, usage: addUsage(state.usage, result.usage), steps: [...state.steps, step] };
    }

    async function review(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        const { result, step } = await track(state, config, DISCUSSION_ACTIVITY_KINDS.reviewing, { count: state.sources.length },
            () => runtime.review(contextFor(state), state.grounding, state.draftText, streamText(state, config), config.signal));
        // An empty review keeps the draft rather than leaving the user without a reply.
        return { content: result.content.trim() ? result.content : state.draftText, usage: addUsage(state.usage, result.usage), steps: [...state.steps, step] };
    }

    async function save(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        // A lead that handed work out speaks again after its teammates, to give the user one complete answer.
        const closing = state.handoffs.length > 0 ? [wrapUpPlan((state.current as SpeakerPlan).participant, state.handoffs)] : [];
        const remaining = [...state.queue, ...state.handoffs, ...closing];
        const plan = state.current as SpeakerPlan;
        const document = documentFor(state);
        let steps = state.steps;
        if (document) {
            const { step } = await track(state, config, DISCUSSION_ACTIVITY_KINDS.savingDocument, { title: document.title },
                () => environment.ports.saveDocument(document.title, state.content, plan), saved => ({ fileName: saved.fileName }));
            steps = [...steps, step];
        }
        // A document asked for but not written yet (its owner is still due) is kept for the rest of the turn.
        const pendingDocument = document ? null : state.document;
        const events = await environment.ports.saveReply({
            plan,
            content: state.content,
            sources: state.sources,
            usage: state.usage,
            steps,
        }, remaining, pendingDocument);
        // Saved records go out through the same stream as the activity, so the client sees them in order.
        for (const event of events) emit(config, event);
        return { queue: remaining, current: null, document: pendingDocument };
    }

    // Delegates were handed concrete work, so they skip triage. The wrap-up works from the replies already given,
    // so it neither triages nor searches again.
    const afterSpeakerStarts = (state: State) => {
        const role = state.current?.speakerRole;
        if (role === DISCUSSION_SPEAKER_ROLES.wrapUp) return NODES.write;
        if (role === DISCUSSION_SPEAKER_ROLES.delegate) return expert ? NODES.research : NODES.write;
        return NODES.triage;
    };
    const afterTriage = (state: State) =>
        state.intent === DISCUSSION_INTENTS.conversational ? NODES.save : (expert ? NODES.research : NODES.write);
    const whileSpeakersRemain = (state: State) => (state.queue.length > 0 ? NODES.next : END);

    return new StateGraph(TurnState)
        .addNode(NODES.next, next)
        .addNode(NODES.triage, triage)
        .addNode(NODES.research, research)
        .addNode(NODES.write, write)
        .addNode(NODES.draft, draft)
        .addNode(NODES.review, review)
        .addNode(NODES.save, save)
        .addConditionalEdges(START, whileSpeakersRemain, [NODES.next, END])
        .addConditionalEdges(NODES.next, afterSpeakerStarts, [NODES.triage, NODES.research, NODES.write])
        .addConditionalEdges(NODES.triage, afterTriage, [NODES.save, NODES.research, NODES.write])
        .addEdge(NODES.research, NODES.draft)
        .addEdge(NODES.draft, NODES.review)
        .addEdge(NODES.review, NODES.save)
        .addEdge(NODES.write, NODES.save)
        .addConditionalEdges(NODES.save, whileSpeakersRemain, [NODES.next, END])
        .compile();
}

/**
 * Runs one turn and forwards every streamed event. The step budget covers every speaker who can reply in the
 * turn: those queued now, plus the most a lead can hand work to.
 */
export async function runDiscussionTurn(
    runtime: DiscussionRuntime,
    environment: TurnEnvironment,
    queue: ReadonlyArray<SpeakerPlan>,
    emit: (event: TurnStreamEvent) => void,
    signal: AbortSignal,
): Promise<void> {
    const graph = buildDiscussionTurnGraph(runtime, environment);
    // Each lead can add its delegates plus its own wrap-up.
    const speakers = queue.length + (DISCUSSION_LIMITS.maxDelegates + 1) * queue.filter(plan => plan.speakerRole === DISCUSSION_SPEAKER_ROLES.lead).length;
    const stream = await graph.stream({ queue: [...queue], document: environment.document }, {
        streamMode: "custom",
        signal,
        recursionLimit: speakers * DISCUSSION_STREAM.graphStepsPerSpeaker + 1,
    });
    for await (const event of stream) emit(event as TurnStreamEvent);
}
