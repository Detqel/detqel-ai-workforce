import { randomUUID } from "node:crypto";
import { AppError } from "../../errors/app-error.js";
import type { TaskExecutionPlan, RepositorySnapshot } from "./task-plan.js";
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
import { AGENT_TOOL_LIMITS, AGENT_TOOL_NAMES } from "../../../constants/agentContextConstants.js";
import type { ToolCall } from "../litellm.client.js";
import {
    addUsage,
    ZERO_USAGE,
    type AgentToolResult,
    type AgentToolSession,
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
    /** Retain unfinished content privately so an interrupted attempt can be recovered without exporting it. */
    retainDraft(agentId: string, content: string): void;
    /** The session's memory for the next speaker, including the replies already given in this turn. */
    memory(): Promise<{ summary: string | null; transcript: TranscriptMessage[] }>;
    /**
     * Saves a reply, the speakers still due, and a document still to be written, and returns the events describing
     * what was saved.
     */
    saveReply(reply: SpokenReply, remaining: ReadonlyArray<SpeakerPlan>, pendingDocument: TurnDocument | null, taskPlan?: TaskExecutionPlan | null, snapshots?: ReadonlyArray<RepositorySnapshot>): Promise<ReadonlyArray<TurnStreamEvent>>;
    checkpoint(queue: ReadonlyArray<SpeakerPlan>, document: TurnDocument | null, taskPlan: TaskExecutionPlan, snapshots?: ReadonlyArray<RepositorySnapshot>): Promise<void>;
    /** Saves a document in the discussion's artifacts and returns the file name it was saved under. */
    saveDocument(title: string, content: string, plan: SpeakerPlan, document?: DocumentRequest, signal?: AbortSignal): Promise<{ fileName: string; content: string; usage: CallUsage }>;
}

export interface TurnSettings {
    readonly responseMode: DiscussionResponseMode;
    readonly capabilityMode: DiscussionCapabilityMode;
    readonly webEnabled: boolean;
}

export interface TurnEnvironment {
    readonly repositorySnapshots?: ReadonlyArray<RepositorySnapshot>;
    readonly taskPlan?: TaskExecutionPlan | null;
    readonly allowedAgentIds?: ReadonlyArray<string>;
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
    taskPlan: replace<TaskExecutionPlan | null>(() => null),
    dispatched: replace<boolean>(() => false),
    planningTrace: replace<DiscussionActivityStep[]>(() => []),
    evidenceBlocks: replace<string[]>(() => []),
    evidenceSources: replace<DiscussionSource[]>(() => []),
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

const NODES = { next: "next", triage: "triage", dispatch: "dispatch", research: "research", write: "write", draft: "draft", review: "review", save: "save" } as const;

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
    let toolSession: AgentToolSession | undefined;
    let checkpointedSnapshots = JSON.stringify(environment.repositorySnapshots ?? []);

    const emit = (config: LangGraphRunnableConfig, event: TurnStreamEvent) => config.writer?.(event);
    const speakerId = (state: State) => (state.current as SpeakerPlan).participant.agentId;

    const contextFor = (state: State): TurnContext => {
        const plan = state.current as SpeakerPlan;
        return {
            assessEvidence: toolSession ? content => toolSession!.completionIssues?.(content) ?? [] : undefined,
            taskPlan: state.taskPlan ?? undefined,
            allowedAgentIds: environment.allowedAgentIds,
            workspaceId: environment.workspaceId,
            participant: plan.participant,
            speakerRole: plan.speakerRole,
            team: environment.team,
            summary: state.summary,
            transcript: state.transcript,
            message: environment.message,
            responseMode: environment.settings.responseMode,
            capabilityMode: environment.settings.capabilityMode,
            webEnabled: environment.settings.webEnabled,
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
        const steps: DiscussionActivityStep[] = [...state.planningTrace];
        if (current.assignment) {
            const assigned = instant(DISCUSSION_ACTIVITY_KINDS.assigned, { leadName: current.assignment.leadName, task: current.assignment.task });
            emit(config, { type: DISCUSSION_STREAM_EVENTS.activity, agentId: participant.agentId, step: assigned });
            steps.push(assigned);
        }
        return {
            planningTrace: [],
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
            usage: state.planningTrace.length ? state.usage : ZERO_USAGE,
            steps,
        };
    }

    async function triage(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        if (state.taskPlan) return { intent: DISCUSSION_INTENTS.task };
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
        if (!result.plan) throw new AppError(502, "The planner did not return a task contract.", undefined, true);
        const requestedDocument = result.document ?? state.document;
        const document = requestedDocument ? { ...requestedDocument, ownerAgentId: result.plan.ownerAgentId } : null;
        return { intent: result.intent, taskPlan: result.plan, handoffs: [], usage: result.usage, steps, document };
    }

    async function dispatch(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        const taskPlan = state.taskPlan!;
        const roster = environment.team?.members ?? [(state.current as SpeakerPlan).participant];
        const contributors = taskPlan.assignments.filter(item => item.agentId !== taskPlan.ownerAgentId);
        const assignments = [...contributors, ...taskPlan.assignments.filter(item => item.agentId === taskPlan.ownerAgentId)];
        const queue: SpeakerPlan[] = assignments.map(assignment => {
            const participant = roster.find(member => member.agentId === assignment.agentId);
            if (!participant) throw new AppError(409, "A planned agent is no longer available.");
            const owner = participant.agentId === taskPlan.ownerAgentId;
            return { participant, speakerRole: owner ? contributors.length ? DISCUSSION_SPEAKER_ROLES.wrapUp : DISCUSSION_SPEAKER_ROLES.addressed : DISCUSSION_SPEAKER_ROLES.delegate,
                assignment: { leadName: (state.current as SpeakerPlan).participant.name, task: assignment.task },
                ...(owner && contributors.length ? { contributors: contributors.map(item => roster.find(member => member.agentId === item.agentId)!.name) } : {}) };
        });
        const step = instant(DISCUSSION_ACTIVITY_KINDS.coordinating, { names: queue.map(item => item.participant.name), task: taskPlan.objective, plan: taskPlan,
            decisions: assignments.map(assignment => ({ name: roster.find(member => member.agentId === assignment.agentId)!.name, task: assignment.task, reason: assignment.reason })) });
        await environment.ports.checkpoint(queue, state.document, taskPlan, environment.repositorySnapshots);
        emit(config, { type: DISCUSSION_STREAM_EVENTS.routed, agentId: (state.current as SpeakerPlan).participant.agentId });
        emit(config, { type: DISCUSSION_STREAM_EVENTS.pending, speakers: queue.map(item => ({ agentId: item.participant.agentId, name: item.participant.name, role: item.participant.role, isLead: item.participant.isLead })) });
        return { queue, current: null, dispatched: true, planningTrace: [...state.steps, step], steps: [], usage: state.usage };
    }

    /** Runs one tool call as an activity step: the trace shows what was read, never the data itself. */
    const toolRunner = (state: State, config: LangGraphRunnableConfig, session: AgentToolSession, steps: DiscussionActivityStep[]) =>
        async (call: ToolCall): Promise<AgentToolResult> => {
            const summary = session.describe(call);
            const knowledge = call.name === AGENT_TOOL_NAMES.searchKnowledge || call.name === AGENT_TOOL_NAMES.readKnowledgeDocument;
            const { result, step } = await track(state, config, knowledge ? DISCUSSION_ACTIVITY_KINDS.readingKnowledge : DISCUSSION_ACTIVITY_KINDS.readingConnector,
                { ...summary }, () => session.execute(call, config.signal));
            steps.push(step);
            const snapshots = session.repositorySnapshots?.() ?? [];
            const snapshotKey = JSON.stringify(snapshots);
            if (state.taskPlan && snapshotKey !== checkpointedSnapshots) {
                await environment.ports.checkpoint([state.current as SpeakerPlan, ...state.queue], state.document, state.taskPlan, snapshots);
                checkpointedSnapshots = snapshotKey;
            }
            return result;
        };

    async function research(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        const context = contextFor(state);
        const steps = [...state.steps];
        const blocks: string[] = [...state.evidenceBlocks];
        const sources: DiscussionSource[] = [...state.evidenceSources];
        let usage = state.usage;
        if (context.taskPlan?.repository && context.collaborators.toolbox?.repositoryCount === 0) throw new AppError(422, "Attach an accessible repository connector to this discussion before requesting repository analysis.");
        const deep = context.taskPlan?.depth === "deep";
        if (!expert && !deep) {
            // Fast replies only investigate the attached connectors and documents, briefly.
            const found = await investigate(state, config, context, AGENT_TOOL_LIMITS.maxRoundsFast, blocks, steps);
            blocks.push(...found.blocks);
            sources.push(...found.sources);
            return { grounding: blocks.length ? runtime.grounding(blocks) : "", sources, evidenceBlocks: blocks, evidenceSources: sources, steps, usage: addUsage(usage, found.usage) };
        }
        if (context.collaborators.retrieveKnowledge) {
            const { result, step } = await track(state, config, DISCUSSION_ACTIVITY_KINDS.searchingKnowledge, undefined,
                () => runtime.searchKnowledge(context), found => ({ count: found.sources.length }));
            blocks.push(...result.blocks);
            sources.push(...result.sources);
            steps.push(step);
        }
        if (context.webEnabled && context.collaborators.searchWeb && context.taskPlan?.webQueries.length) {
            const { result, step } = await track(state, config, DISCUSSION_ACTIVITY_KINDS.searchingWeb, { query: runtime.searchQuery(context) },
                () => runtime.searchWeb(context), found => ({ count: found.sources.length }));
            blocks.push(...result.blocks);
            sources.push(...result.sources);
            steps.push(step);
        }
        // With what retrieval found in hand, the agent reads whatever else it needs from connectors and documents.
        const found = await investigate(state, config, context, deep ? AGENT_TOOL_LIMITS.maxRoundsDeep : AGENT_TOOL_LIMITS.maxRounds, blocks, steps);
        blocks.push(...found.blocks);
        for (const source of found.sources) if (!sources.some(existing => existing.reference === source.reference)) sources.push(source);
        usage = addUsage(usage, found.usage);
        return { grounding: runtime.grounding(blocks), sources, evidenceBlocks: blocks, evidenceSources: sources, steps, usage };
    }

    async function investigate(state: State, config: LangGraphRunnableConfig, context: TurnContext, rounds: number, prior: ReadonlyArray<string>, steps: DiscussionActivityStep[]) {
        const toolbox = context.collaborators.toolbox;
        if (!toolbox?.hasTools) return { blocks: [] as string[], sources: [] as DiscussionSource[], usage: ZERO_USAGE };
        const session = toolSession ??= toolbox.start(context.taskPlan?.depth ?? "focused", environment.repositorySnapshots);
        if (!session.definitions.length) return { blocks: [] as string[], sources: [] as DiscussionSource[], usage: ZERO_USAGE };
        return runtime.investigate(context, session, rounds, prior, toolRunner(state, config, session, steps), config.signal);
    }

    async function write(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        const plan = state.current as SpeakerPlan;
        const wrappingUp = plan.speakerRole === DISCUSSION_SPEAKER_ROLES.wrapUp;
        const document = documentFor(state);
        const names = wrappingUp && plan.contributors ? { names: plan.contributors } : {};
        const { result, step } = await track(state, config,
            document ? DISCUSSION_ACTIVITY_KINDS.writingDocument : wrappingUp ? DISCUSSION_ACTIVITY_KINDS.consolidating : DISCUSSION_ACTIVITY_KINDS.writing,
            document ? { ...names, title: document.title } : wrappingUp ? names : undefined,
            () => runtime.write(contextFor(state), document || state.taskPlan ? () => {} : streamText(state, config), config.signal, state.grounding));
        environment.ports.retainDraft(plan.participant.agentId, result.content);
        return { content: result.content, draftText: document || state.taskPlan ? result.content : "", usage: addUsage(state.usage, result.usage), steps: [...state.steps, step] };
    }

    async function draft(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        const { result, step } = await track(state, config, DISCUSSION_ACTIVITY_KINDS.drafting, undefined,
            () => runtime.draft(contextFor(state), state.grounding, config.signal));
        environment.ports.retainDraft(speakerId(state), result.content);
        return { draftText: result.content, usage: addUsage(state.usage, result.usage), steps: [...state.steps, step] };
    }

    async function review(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        const { result, step } = await track(state, config, DISCUSSION_ACTIVITY_KINDS.reviewing, { count: state.sources.length },
            () => runtime.review(contextFor(state), state.grounding, state.draftText, documentFor(state) ? () => {} : streamText(state, config), config.signal));
        if (!result.content.trim()) throw new AppError(502, "The document review did not produce a complete answer. The unchecked draft was not handed over.");
        environment.ports.retainDraft(speakerId(state), result.content);
        return { content: result.content, usage: addUsage(state.usage, result.usage), steps: [...state.steps, step] };
    }

    async function save(state: State, config: LangGraphRunnableConfig): Promise<Partial<State>> {
        // A lead that handed work out speaks again after its teammates, to give the user one complete answer.
        const closing = state.handoffs.length > 0 ? [wrapUpPlan((state.current as SpeakerPlan).participant, state.handoffs)] : [];
        const remaining = [...state.queue, ...state.handoffs, ...closing];
        const plan = state.current as SpeakerPlan;
        const document = documentFor(state);
        let steps = state.steps;
        let content = state.content;
        if (state.taskPlan?.repository && plan.participant.agentId === state.taskPlan.ownerAgentId) content += toolSession?.coverageReport?.() ?? "";
        let usage = state.usage;
        if (document) {
            const { result, step } = await track(state, config, DISCUSSION_ACTIVITY_KINDS.savingDocument, { title: document.title, count: document.imageCount },
                () => environment.ports.saveDocument(document.title, content, plan, document, config.signal), saved => ({ fileName: saved.fileName }));
            steps = [...steps, step];
            content = result.content;
            usage = addUsage(usage, result.usage);
        }
        // A document asked for but not written yet (its owner is still due) is kept for the rest of the turn.
        const pendingDocument = document ? null : state.document;
        const events = await environment.ports.saveReply({
            plan,
            content,
            sources: state.sources,
            usage,
            steps,
        }, remaining, pendingDocument, state.taskPlan, toolSession?.repositorySnapshots?.() ?? environment.repositorySnapshots);
        // Saved records go out through the same stream as the activity, so the client sees them in order.
        for (const event of events) emit(config, event);
        return { queue: remaining, current: null, document: pendingDocument };
    }

    // Delegates were handed concrete work, so they skip triage. The wrap-up works from the replies already given,
    // so it neither triages nor searches again.
    // Fast replies research only when there is something attached to read; expert replies always research.
    const researches = expert || Boolean(environment.collaborators.toolbox?.hasTools);
    const afterSpeakerStarts = (state: State) => {
        if (state.taskPlan && state.dispatched) return researches || state.taskPlan.repository || state.taskPlan.webQueries.length ? NODES.research : expert || state.taskPlan.depth === "deep" || documentFor(state) ? NODES.draft : NODES.write;
        const role = state.current?.speakerRole;
        if (role === DISCUSSION_SPEAKER_ROLES.wrapUp) return NODES.write;
        if (role === DISCUSSION_SPEAKER_ROLES.delegate) return researches ? NODES.research : NODES.write;
        return NODES.triage;
    };
    const afterTriage = (state: State) => state.intent === DISCUSSION_INTENTS.conversational ? NODES.save : !state.dispatched ? NODES.dispatch : researches ? NODES.research : NODES.write;
    const afterResearch = (state: State) => (expert || state.taskPlan?.depth === "deep" || documentFor(state) ? NODES.draft : NODES.write);
    const whileSpeakersRemain = (state: State) => (state.queue.length > 0 ? NODES.next : END);

    return new StateGraph(TurnState)
        .addNode(NODES.next, next)
        .addNode(NODES.triage, triage)
        .addNode(NODES.dispatch, dispatch)
        .addNode(NODES.research, research)
        .addNode(NODES.write, write)
        .addNode(NODES.draft, draft)
        .addNode(NODES.review, review)
        .addNode(NODES.save, save)
        .addConditionalEdges(START, whileSpeakersRemain, [NODES.next, END])
        .addConditionalEdges(NODES.next, afterSpeakerStarts, [NODES.triage, NODES.research, NODES.write, NODES.draft])
        .addConditionalEdges(NODES.triage, afterTriage, [NODES.save, NODES.dispatch, NODES.research, NODES.write])
        .addEdge(NODES.dispatch, NODES.next)
        .addConditionalEdges(NODES.research, afterResearch, [NODES.draft, NODES.write])
        .addEdge(NODES.draft, NODES.review)
        .addEdge(NODES.review, NODES.save)
        .addConditionalEdges(NODES.write, state => documentFor(state) || state.taskPlan ? NODES.review : NODES.save, [NODES.review, NODES.save])
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
    const speakers = Math.max(queue.length + 1, DISCUSSION_LIMITS.maxDelegates + 2);
    const stream = await graph.stream({ queue: [...queue], document: environment.document, taskPlan: environment.taskPlan ?? null, dispatched: Boolean(environment.taskPlan) }, {
        streamMode: "custom",
        signal,
        recursionLimit: speakers * DISCUSSION_STREAM.graphStepsPerSpeaker + 1,
    });
    for await (const event of stream) emit(event as TurnStreamEvent);
}
