import { randomUUID } from "node:crypto";
import { AppError } from "../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../shared/logging/logger.js";
import type { IUnitOfWork } from "../../../shared/contracts/unit-of-work.js";
import type { FileServer } from "../../../shared/rag/file-server.js";
import type { RagService } from "../../../shared/rag/rag.service.js";
import type {
    DiscussionCollaborators,
    DiscussionParticipant,
    DiscussionRuntime,
    TeamContext,
    TranscriptMessage,
} from "../../../shared/agents/graphs/discussion-runtime.js";
import {
    runDiscussionTurn,
    type SpeakerPlan,
    type SpokenReply,
    type TurnDocument,
    type TurnSettings,
    type TurnStreamEvent,
} from "../../../shared/agents/graphs/discussion-turn.graph.js";
import type { DocumentExporter, DocumentInfo } from "../../../shared/documents/document-exporter.js";
import { fileStem, numberedNames } from "../../../shared/documents/file-names.js";
import type { StoredFile } from "../../../shared/rag/file-server.js";
import { extname } from "node:path";
import {
    ARTIFACT_DEFAULT_MIME_TYPE,
    ARTIFACT_MIME_TYPES,
    DOCUMENT_ERRORS,
    DOCUMENT_FORMATS,
    DOCUMENT_LIMITS,
    DOCUMENT_MIME_TYPES,
    type DocumentFormat,
} from "../../../constants/documentConstants.js";
import type { IAgentModelProvisioner } from "../../../shared/agents/agent-model.provisioner.js";
import type { IWorkspaceWebSearch } from "../../../shared/agents/tools/workspace-web-search.js";
import {
    DISCUSSION_ACTIVITY_KINDS,
    DISCUSSION_CAPABILITY_MODES,
    DISCUSSION_ERRORS,
    DISCUSSION_LIMITS,
    DISCUSSION_MEMORY,
    DISCUSSION_MESSAGE_ROLES,
    DISCUSSION_SPEAKER_ROLES,
    DISCUSSION_STREAM_EVENTS,
    type DiscussionCapabilityMode,
    type DiscussionResponseMode,
} from "../../../constants/discussionConstants.js";
import { FILE_SERVER_SCOPES, type FileServerScope } from "../../../constants/fileServerConstants.js";
import type { ChatMessage, ChatSession, PendingResponder, PendingTurn } from "../repositories/discussion.repository.js";
import type { DiscussionParticipants } from "./discussion-participants.js";
import { addressedMembers } from "./discussion-addressing.js";

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

/** A file kept in a discussion's artifacts. */
export interface SessionArtifact {
    readonly fileName: string;
    readonly mimeType: string;
    readonly size: number;
    readonly modifiedAt: string;
}

/** A file handed to the client to download. Binary content travels as base64 so it survives the desktop bridge. */
export interface DownloadableFile {
    readonly fileName: string;
    readonly mimeType: string;
    readonly contentBase64: string;
}

/** An exported reply: the file to download, and the artifact it was saved as. */
export interface ExportedReply extends DownloadableFile {
    readonly artifact: SessionArtifact;
}

/** An agent still due to reply in the current turn. */
export interface PendingSpeaker {
    readonly agentId: string;
    readonly name: string;
    readonly role: string;
    readonly isLead: boolean;
}

/**
 * A turn that passed every check and is ready to stream. Checks that can fail with a message the user acts on
 * (an unconfigured model, web search without a key, an unknown session) run before it is returned, so they
 * answer as an ordinary error response instead of an interrupted stream.
 */
export interface PreparedTurn {
    run(emit: (event: TurnStreamEvent) => void, signal: AbortSignal): Promise<void>;
}

type Table =
    | { readonly kind: "solo"; readonly agent: DiscussionParticipant }
    | { readonly kind: "team"; readonly team: TeamContext; readonly lead: DiscussionParticipant };

/** A turn in progress for a session: stopped by a newer message, and awaited before that message is saved. */
interface RunningTurn {
    readonly controller: AbortController;
    readonly settled: Promise<void>;
    readonly settle: () => void;
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

function mimeTypeOf(fileName: string): string {
    return ARTIFACT_MIME_TYPES[extname(fileName).toLowerCase()] ?? ARTIFACT_DEFAULT_MIME_TYPE;
}

function toArtifact(file: StoredFile): SessionArtifact {
    return { fileName: file.name, mimeType: mimeTypeOf(file.name), size: file.size, modifiedAt: (file.modifiedAt ?? new Date()).toISOString() };
}

/** When a file was exported, shown on it. Fixed to UTC so the backend never depends on the machine's locale. */
function exportTimestamp(): string {
    return `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function toPendingSpeaker(plan: SpeakerPlan): PendingSpeaker {
    const { participant } = plan;
    return { agentId: participant.agentId, name: participant.name, role: participant.role, isLead: participant.isLead };
}

function toResponder(plan: SpeakerPlan): PendingResponder {
    const first = plan.speakerRole === DISCUSSION_SPEAKER_ROLES.lead || plan.speakerRole === DISCUSSION_SPEAKER_ROLES.solo;
    const wrapUp = plan.speakerRole === DISCUSSION_SPEAKER_ROLES.wrapUp;
    return { agentId: plan.participant.agentId, assignment: plan.assignment?.task ?? null, ...(first ? { first: true } : {}), ...(wrapUp ? { wrapUp: true } : {}) };
}

/**
 * Orchestrates discussions: sessions, messages, per-session connector attachment, knowledge-base ingestion,
 * and the discussion table itself.
 *
 * A one-to-one session is answered by its agent. A team session is a round-robin table: the lead answers first
 * and may hand parts of the request to teammates, who then speak in turn; when the user names teammates, they
 * answer instead, in the order named. A whole turn runs as one LangGraph run whose progress streams to the user:
 * who is speaking, each step they take, and their reply as it is written. Every reply is saved as soon as it is
 * done; if the user leaves mid-turn, the speakers still due are kept and pick up when the discussion reopens.
 *
 * Every session operation is scoped to its workspace, and deleting a session performs full cleanup (messages via
 * cascade, the vector collection, and the file-server folder). Connectors must belong to the session's workspace
 * before they can be attached.
 */
export class DiscussionService {
    /** The turn currently running for each session. */
    private readonly running = new Map<string, RunningTurn>();
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
        private readonly exporter: DocumentExporter,
    ) {}

    /** Renames a discussion. The title is what the discussion list shows. */
    async renameSession(workspaceId: string, sessionId: string, title: string): Promise<ChatSession> {
        await this.getSession(workspaceId, sessionId);
        const renamed = await this.unit.discussions.renameSession(sessionId, title.trim());
        if (!renamed) throw new AppError(404, DISCUSSION_ERRORS.sessionNotFound);
        return renamed;
    }

    /** The files kept in a discussion: documents agents wrote, exported replies, and files the user added. */
    async listArtifacts(workspaceId: string, sessionId: string): Promise<SessionArtifact[]> {
        const session = await this.getSession(workspaceId, sessionId);
        const files = await this.fileServer.listArtifacts(this.locationOf(session));
        return files.map(toArtifact).sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
    }

    async downloadArtifact(workspaceId: string, sessionId: string, fileName: string): Promise<DownloadableFile> {
        const session = await this.getSession(workspaceId, sessionId);
        const contents = await this.fileServer.readArtifact(this.locationOf(session), fileName);
        return { fileName, mimeType: mimeTypeOf(fileName), contentBase64: contents.toString("base64") };
    }

    async deleteArtifact(workspaceId: string, sessionId: string, fileName: string): Promise<boolean> {
        const session = await this.getSession(workspaceId, sessionId);
        return this.fileServer.deleteArtifact(this.locationOf(session), fileName);
    }

    /** Adds a file the user chose to the discussion's artifacts. Executable and script files are rejected. */
    async uploadArtifact(workspaceId: string, sessionId: string, fileName: string, mimeType: string, contents: Buffer): Promise<SessionArtifact> {
        const session = await this.getSession(workspaceId, sessionId);
        if (contents.byteLength > DOCUMENT_LIMITS.maxUploadBytes) throw new AppError(413, DOCUMENT_ERRORS.uploadTooLarge);
        return toArtifact(await this.fileServer.storeArtifact(this.locationOf(session), fileName, mimeType, contents));
    }

    /**
     * Exports one agent reply (a handoff, a document, or any answer) as Markdown, Word, or PDF. The file is saved
     * in the discussion's artifacts, replacing an earlier export of the same reply in that format, and returned
     * for download.
     */
    async exportMessage(workspaceId: string, sessionId: string, messageId: string, format: DocumentFormat): Promise<ExportedReply> {
        const session = await this.getSession(workspaceId, sessionId);
        const message = (await this.unit.discussions.listMessages(sessionId))
            .find(candidate => candidate.id === messageId && candidate.role === DISCUSSION_MESSAGE_ROLES.assistant);
        if (!message) throw new AppError(404, DOCUMENT_ERRORS.messageNotFound);
        const speaker = message.speakerName ?? session.title;
        const documentTitle = message.activity.find(step => step.kind === DISCUSSION_ACTIVITY_KINDS.savingDocument)?.detail?.title;
        const title = documentTitle
            ?? (message.turnRole === DISCUSSION_SPEAKER_ROLES.delegate ? `${speaker}'s handoff` : `${speaker}'s reply`);
        const info: DocumentInfo = {
            title,
            subtitle: [speaker, message.speakerRole, session.title].filter(Boolean).join(" · "),
            author: speaker,
            exportedAt: exportTimestamp(),
        };
        const file = await this.exporter.export(format, info, message.content);
        const stem = fileStem(title, speaker, session.title);
        if (!stem) throw new AppError(400, DOCUMENT_ERRORS.emptyDocument);
        // A short id keeps exports of different replies with the same title apart.
        const fileName = `${stem} - ${message.id.slice(0, 8)}.${file.extension}`;
        const stored = await this.fileServer.storeArtifact(this.locationOf(session), fileName, file.mimeType, file.contents);
        return { fileName, mimeType: file.mimeType, contentBase64: file.contents.toString("base64"), artifact: toArtifact(stored) };
    }

    /** Converts a Markdown artifact (a document an agent wrote) into Word or PDF, saved beside it. */
    async exportArtifact(workspaceId: string, sessionId: string, fileName: string, format: DocumentFormat): Promise<ExportedReply> {
        const session = await this.getSession(workspaceId, sessionId);
        if (extname(fileName).toLowerCase() !== `.${DOCUMENT_FORMATS.markdown}`) throw new AppError(400, DOCUMENT_ERRORS.unknownFormat);
        const location = this.locationOf(session);
        const markdown = (await this.fileServer.readArtifact(location, fileName)).toString("utf8");
        const stem = fileName.slice(0, -extname(fileName).length);
        const info: DocumentInfo = { title: stem, subtitle: session.title, author: session.title, exportedAt: exportTimestamp() };
        const file = await this.exporter.export(format, info, markdown);
        const target = `${stem}.${file.extension}`;
        const stored = await this.fileServer.storeArtifact(location, target, file.mimeType, file.contents);
        return { fileName: target, mimeType: file.mimeType, contentBase64: file.contents.toString("base64"), artifact: toArtifact(stored) };
    }

    private locationOf(session: ChatSession) {
        return { workspaceId: session.workspaceId, scope: scopeOf(session), sessionId: session.id };
    }

    /** Saves a document an agent wrote, under a name from its title that no other artifact in the discussion has. */
    private async saveDocument(session: ChatSession, title: string, content: string, plan: SpeakerPlan): Promise<{ fileName: string }> {
        const location = this.locationOf(session);
        const stem = fileStem(title, plan.participant.name);
        if (!stem) throw new AppError(400, DOCUMENT_ERRORS.emptyDocument);
        for (const fileName of numberedNames(stem, DOCUMENT_FORMATS.markdown)) {
            if (await this.fileServer.hasArtifact(location, fileName)) continue;
            await this.fileServer.storeArtifact(location, fileName, DOCUMENT_MIME_TYPES.md, Buffer.from(content.trim() + "\n", "utf8"));
            logger.info({ sessionId: session.id, agentId: plan.participant.agentId }, "Saved a document an agent wrote");
            return { fileName };
        }
        throw new AppError(409, DOCUMENT_ERRORS.namesExhausted);
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

    /** Full cleanup: stop any running turn, drop the vector collection and the file-server tree, then the row. */
    async deleteSession(workspaceId: string, sessionId: string): Promise<void> {
        const session = await this.getSession(workspaceId, sessionId);
        await this.stopRunningTurn(sessionId);
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
     * Saves the user's message and prepares the turn that answers it. A turn still running in the session is
     * stopped first: a new message starts a new turn, and teammates still due from the previous one do not reply.
     */
    async startMessage(input: PostMessageInput): Promise<PreparedTurn> {
        const trimmed = input.message.trim();
        if (trimmed.length === 0) throw new AppError(400, DISCUSSION_ERRORS.emptyMessage);
        if (trimmed.length > DISCUSSION_LIMITS.maxMessageCharacters) throw new AppError(400, DISCUSSION_ERRORS.messageTooLong);
        const session = await this.getSession(input.workspaceId, input.sessionId);
        const settings: TurnSettings = { responseMode: input.responseMode, capabilityMode: input.capabilityMode, webEnabled: input.webEnabled };
        // Provision, check web search, and resolve the speakers before saving the message, so a configuration
        // problem does not leave an unanswered message behind.
        await this.prepare(input.workspaceId, settings);
        const table = await this.resolveTable(session);

        await this.stopRunningTurn(session.id);
        const slot = this.claim(session.id);
        try {
            const turnId = randomUUID();
            const userMessage = await this.unit.discussions.appendMessage({ sessionId: session.id, role: DISCUSSION_MESSAGE_ROLES.user, content: trimmed, turnId });
            const queue = this.firstSpeakers(table, trimmed);
            await this.storeQueue(session.id, turnId, queue, settings);
            return {
                run: (emit, signal) => {
                    emit({ type: DISCUSSION_STREAM_EVENTS.turn, userMessage });
                    return this.runTurn(session, table, turnId, trimmed, settings, queue, null, slot, emit, signal);
                },
            };
        } catch (error) {
            this.release(session.id, slot);
            throw error;
        }
    }

    /** Prepares the rest of a turn the user left before every speaker replied. */
    async startContinue(workspaceId: string, sessionId: string): Promise<PreparedTurn> {
        const session = await this.getSession(workspaceId, sessionId);
        const pending = session.pendingTurn;
        if (!pending || pending.queue.length === 0) throw new AppError(409, DISCUSSION_ERRORS.nothingPending);
        if (this.running.has(sessionId)) throw new AppError(409, DISCUSSION_ERRORS.replyInProgress);
        const settings: TurnSettings = {
            responseMode: pending.responseMode as DiscussionResponseMode,
            capabilityMode: pending.capabilityMode as DiscussionCapabilityMode,
            webEnabled: pending.webEnabled,
        };
        await this.prepare(workspaceId, settings);
        const table = await this.resolveTable(session);
        const userMessage = (await this.unit.discussions.listMessages(sessionId))
            .find(message => message.turnId === pending.turnId && message.role === DISCUSSION_MESSAGE_ROLES.user);
        if (!userMessage) throw new AppError(409, DISCUSSION_ERRORS.nothingPending);
        // Agents removed from the team since the turn started are skipped.
        const queue = pending.queue.flatMap(entry => {
            const plan = this.planFor(table, entry, pending.leadName);
            return plan ? [plan] : [];
        });
        const slot = this.claim(sessionId);
        const document = pending.document ?? null;
        return { run: (emit, signal) => this.runTurn(session, table, pending.turnId, userMessage.content, settings, queue, document, slot, emit, signal) };
    }

    /** Expert turns with web enabled need the workspace's Tavily key; checked before anything is saved. */
    private async prepare(workspaceId: string, settings: TurnSettings): Promise<void> {
        await this.models.ensure(workspaceId);
        if (settings.capabilityMode === DISCUSSION_CAPABILITY_MODES.expert && settings.webEnabled) {
            await this.webSearch.assertConfigured(workspaceId);
        }
    }

    private async resolveTable(session: ChatSession): Promise<Table> {
        if (session.teamId) return { kind: "team", ...(await this.participants.team(session.workspaceId, session.teamId)) };
        if (session.agentId) return { kind: "solo", agent: await this.participants.soloAgent(session.workspaceId, session.agentId) };
        throw new AppError(409, DISCUSSION_ERRORS.sessionWithoutParticipants);
    }

    /** Who answers a new message: the solo agent; teammates the user named, in order; otherwise the lead. */
    private firstSpeakers(table: Table, message: string): SpeakerPlan[] {
        if (table.kind === "solo") return [{ participant: table.agent, speakerRole: DISCUSSION_SPEAKER_ROLES.solo }];
        const named = addressedMembers(message, table.team.members);
        // Naming only the lead is an ordinary lead turn, in which the lead may still delegate.
        if (named.some(member => !member.isLead)) {
            return named.map(member => ({ participant: member, speakerRole: DISCUSSION_SPEAKER_ROLES.addressed }));
        }
        return [{ participant: table.lead, speakerRole: DISCUSSION_SPEAKER_ROLES.lead }];
    }

    /** Rebuilds a queued speaker's part from the saved queue, or null when the agent left the team. */
    private planFor(table: Table, entry: PendingResponder, leadName: string): SpeakerPlan | null {
        if (table.kind === "solo") return table.agent.agentId === entry.agentId ? { participant: table.agent, speakerRole: DISCUSSION_SPEAKER_ROLES.solo } : null;
        const member = table.team.members.find(candidate => candidate.agentId === entry.agentId);
        if (!member) return null;
        if (entry.wrapUp) return { participant: member, speakerRole: DISCUSSION_SPEAKER_ROLES.wrapUp };
        if (entry.assignment) return { participant: member, speakerRole: DISCUSSION_SPEAKER_ROLES.delegate, assignment: { leadName, task: entry.assignment } };
        return { participant: member, speakerRole: entry.first ? DISCUSSION_SPEAKER_ROLES.lead : DISCUSSION_SPEAKER_ROLES.addressed };
    }

    private async runTurn(
        session: ChatSession,
        table: Table,
        turnId: string,
        message: string,
        settings: TurnSettings,
        queue: ReadonlyArray<SpeakerPlan>,
        document: TurnDocument | null,
        slot: RunningTurn,
        emit: (event: TurnStreamEvent) => void,
        signal: AbortSignal,
    ): Promise<void> {
        const stop = () => slot.controller.abort();
        signal.addEventListener("abort", stop, { once: true });
        const expert = settings.capabilityMode === DISCUSSION_CAPABILITY_MODES.expert;
        const collaborators: DiscussionCollaborators = {
            // Retrieval and web search only run on the expert path; fast stays tool-free.
            retrieveKnowledge: expert ? query => this.rag.retrieve(session.workspaceId, session.id, query, DISCUSSION_LIMITS.expertRetrievalTopK) : undefined,
            searchWeb: expert && settings.webEnabled ? query => this.webSearch.search(session.workspaceId, query, DISCUSSION_LIMITS.expertWebResults) : undefined,
        };
        let finished = false;
        try {
            await runDiscussionTurn(this.runtime, {
                workspaceId: session.workspaceId,
                team: table.kind === "team" ? table.team : null,
                message,
                settings,
                collaborators,
                document,
                ports: {
                    memory: () => this.memory(session),
                    saveReply: (reply, remaining, pendingDocument) => this.saveReply(session, turnId, settings, reply, remaining, pendingDocument),
                    saveDocument: (title, content, plan) => this.saveDocument(session, title, content, plan),
                },
            }, queue, emit, slot.controller.signal);
            finished = true;
            const current = await this.getSession(session.workspaceId, session.id);
            emit({ type: DISCUSSION_STREAM_EVENTS.done, usage: usageOf(current) });
        } catch (error) {
            // Leaving the discussion or sending a newer message stops the turn; the queue keeps who is still due.
            if (slot.controller.signal.aborted) return;
            // A failure ends the turn, so reopening the discussion does not retry it on its own.
            await this.unit.discussions.setPendingTurn(session.id, null).catch(() => undefined);
            logger.error({ sessionId: session.id, error: String(error) }, "Discussion turn failed");
            throw error;
        } finally {
            signal.removeEventListener("abort", stop);
            this.release(session.id, slot);
            if (finished) this.scheduleMemory(session.workspaceId, session.id);
        }
    }

    private async memory(session: ChatSession): Promise<{ summary: string | null; transcript: TranscriptMessage[] }> {
        const current = await this.getSession(session.workspaceId, session.id);
        const messages = await this.unit.discussions.listMessages(session.id);
        return { summary: current.summary, transcript: toTranscript(messages.slice(current.summarizedMessageCount)) };
    }

    /** Saves one reply with its activity and usage, then the speakers still due, and reports both to the client. */
    private async saveReply(
        session: ChatSession,
        turnId: string,
        settings: TurnSettings,
        reply: SpokenReply,
        remaining: ReadonlyArray<SpeakerPlan>,
        pendingDocument: TurnDocument | null,
    ): Promise<TurnStreamEvent[]> {
        const { participant } = reply.plan;
        const saved = await this.unit.discussions.appendMessageWithSources({
            message: {
                sessionId: session.id,
                role: DISCUSSION_MESSAGE_ROLES.assistant,
                content: reply.content,
                turnId,
                speakerAgentId: participant.agentId,
                speakerName: participant.name,
                speakerRole: participant.role,
                isLead: participant.isLead,
                turnRole: reply.plan.speakerRole,
                responseMode: settings.responseMode,
                capabilityMode: settings.capabilityMode,
                activity: [...reply.steps],
                tokensUsed: reply.usage.inputTokens + reply.usage.outputTokens,
                inputTokens: reply.usage.inputTokens,
                outputTokens: reply.usage.outputTokens,
                cachedTokens: reply.usage.cachedTokens,
                costUsd: reply.usage.costUsd,
            },
            sources: reply.sources.map(source => ({ sourceType: source.type, title: source.title, reference: source.reference, url: source.url })),
        });
        const totals = await this.unit.discussions.addUsage(session.id, reply.usage);
        await this.storeQueue(session.id, turnId, remaining, settings, pendingDocument);
        return [
            { type: DISCUSSION_STREAM_EVENTS.reply, agentId: participant.agentId, message: saved, sources: reply.sources, usage: usageOf(totals) },
            { type: DISCUSSION_STREAM_EVENTS.pending, speakers: remaining.map(toPendingSpeaker) },
        ];
    }

    /** Stores who is still due to reply, so a turn the user leaves resumes where it stopped; empty clears it. */
    private async storeQueue(sessionId: string, turnId: string, queue: ReadonlyArray<SpeakerPlan>, settings: TurnSettings, document: TurnDocument | null = null): Promise<void> {
        if (queue.length === 0) {
            await this.unit.discussions.setPendingTurn(sessionId, null);
            return;
        }
        const leadName = queue.find(plan => plan.assignment)?.assignment?.leadName ?? queue[0].participant.name;
        const pending: PendingTurn = { turnId, queue: queue.map(toResponder), leadName, ...settings, document };
        await this.unit.discussions.setPendingTurn(sessionId, pending);
    }

    private claim(sessionId: string): RunningTurn {
        let settle = () => {};
        const settled = new Promise<void>(resolve => { settle = resolve; });
        const slot: RunningTurn = { controller: new AbortController(), settled, settle };
        this.running.set(sessionId, slot);
        return slot;
    }

    private release(sessionId: string, slot: RunningTurn): void {
        if (this.running.get(sessionId) === slot) this.running.delete(sessionId);
        slot.settle();
    }

    /** Stops the session's running turn, if any, and waits until it has saved what it finished. */
    private async stopRunningTurn(sessionId: string): Promise<void> {
        const running = this.running.get(sessionId);
        if (!running) return;
        running.controller.abort();
        await running.settled;
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
