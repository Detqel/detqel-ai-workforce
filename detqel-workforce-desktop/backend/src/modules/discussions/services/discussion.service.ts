import { createHash } from "node:crypto";
import { attachmentConversion, existingDocumentDelivery } from "../../../shared/documents/delivery-intent.js";
import { documentImageAssets, documentImageRequests, documentRequirementIssues } from "../../../shared/documents/document-requirements.js";
import { explicitDeliverableRequirements } from "../../../shared/agents/graphs/task-plan.js";
import { ZERO_USAGE } from "../../../shared/agents/graphs/discussion-runtime.js";
import { storageFolderName } from "../../../shared/rag/named-directories.js";
import { CONTEXT_COMPACTION, type ConversationContext } from "../../../shared/agents/context/conversation-context.js";
import type { DiscussionActivityStep } from "../../../shared/types/discussion-activity.js";
import { randomUUID } from "node:crypto";
import { answeredQuestionRequest } from "../../../shared/agents/graphs/clarification.js";
import { AppError } from "../../../shared/errors/app-error.js";
import type { TaskExecutionPlan, RepositorySnapshot } from "../../../shared/agents/graphs/task-plan.js";
import type { TurnCheckpoint } from "../../../shared/agents/graphs/turn-checkpoint.js";
import { createScopedLogger } from "../../../shared/logging/logger.js";
import type { IUnitOfWork } from "../../../shared/contracts/unit-of-work.js";
import type { FileServer } from "../../../shared/rag/file-server.js";
import type { RagService } from "../../../shared/rag/rag.service.js";
import type {
    AgentToolbox,
    DiscussionCollaborators,
    DiscussionParticipant,
    DiscussionRuntime,
    DocumentRequest,
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
import type { SessionLocation, StoredFile } from "../../../shared/rag/file-server.js";
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
    DISCUSSION_MESSAGE_ROLES,
    DISCUSSION_SPEAKER_ROLES,
    DISCUSSION_STREAM_EVENTS,
    type DiscussionCapabilityMode,
    type DiscussionResponseMode,
} from "../../../constants/discussionConstants.js";
import { FILE_SERVER_SCOPES, type FileServerScope } from "../../../constants/fileServerConstants.js";
import type { ChatMessage, ChatSession, PendingResponder, PendingTurn, RestoredCheckpoint } from "../repositories/discussion.repository.js";
import type { DiscussionParticipants } from "./discussion-participants.js";
import type { DiscussionToolboxFactory } from "./discussion-toolbox.js";
import { workspaceBrief } from "./workspace-brief.js";
import { uploadedText, type KnowledgeDocument, type SessionKnowledge } from "../../../shared/rag/session-knowledge.js";

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
    readonly actorUserId?: string;
    readonly answerToQuestionId?: string;
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly message: string;
    readonly responseMode: DiscussionResponseMode;
    readonly capabilityMode: DiscussionCapabilityMode;
    readonly webEnabled: boolean;
    /** Knowledge file names the user attached to this message. */
    readonly attachments?: ReadonlyArray<string>;
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
interface ReplyProgress {
    readonly agentId: string;
    readonly name: string;
    readonly role: string;
    readonly isLead: boolean;
    readonly turnRole: SpeakerPlan["speakerRole"];
    content: string;
    draft: string;
    readonly steps: Map<string, DiscussionActivityStep>;
}

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
    const previousContent = new Set<string>();
    return messages.filter(message => !message.activity?.some(step => step.detail?.interruption)).map(message => ({
        role: message.role === DISCUSSION_MESSAGE_ROLES.assistant ? "assistant" as const : "user" as const,
        content: (() => {
            const delivery = message.activity?.find(step => step.detail?.sourceMessageId);
            const duplicate = Boolean(delivery && previousContent.has(message.content));
            previousContent.add(message.content);
            if (duplicate) return `The completed document "${delivery?.detail?.title ?? "Document"}" was packaged without content changes. Its full content appears earlier in this conversation.`;
            return message.attachments?.length ? `${message.content}\n[Attached: ${message.attachments.map(file => file.name).join(", ")}]` : message.content;
        })(),
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
 * A one-to-one session is answered by its agent. A team session plans the requested work once, selects the smallest sufficient set of specialists, and runs
 * their assignments with the final owner last. Explicit agent requests and exclusions are interpreted by the planner. A whole turn runs as one LangGraph run whose progress streams to the user:
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
    private readonly sessionMutations = new Map<string, Promise<unknown>>();

    constructor(
        private readonly unit: IUnitOfWork,
        private readonly runtime: DiscussionRuntime,
        private readonly fileServer: FileServer,
        private readonly rag: RagService,
        private readonly models: IAgentModelProvisioner,
        private readonly participants: DiscussionParticipants,
        private readonly webSearch: IWorkspaceWebSearch,
        private readonly exporter: DocumentExporter,
        private readonly knowledge: SessionKnowledge,
        private readonly toolboxes: DiscussionToolboxFactory,
    ) {}

    /** Renames a discussion. The title is what the discussion list shows. */
    async renameSession(workspaceId: string, sessionId: string, title: string): Promise<ChatSession> {
        storageFolderName(title);
        if (!await this.unit.discussions.findSessionInWorkspace(sessionId, workspaceId)) throw new AppError(404, DISCUSSION_ERRORS.sessionNotFound);
        await this.stopRunningTurn(sessionId);
        const renamed = await this.unit.discussions.renameSession(sessionId, title.trim());
        if (!renamed) throw new AppError(404, DISCUSSION_ERRORS.sessionNotFound);
        await this.fileServer.ensureSession(this.locationOf(renamed));
        return renamed;
    }

    /** The files kept in a discussion: documents agents wrote and files the user added. */
    async listArtifacts(workspaceId: string, sessionId: string): Promise<SessionArtifact[]> {
        const session = await this.getSession(workspaceId, sessionId);
        const files = await this.fileServer.listArtifacts(this.locationOf(session));
        return files.map(toArtifact).sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
    }

    async downloadArtifact(workspaceId: string, sessionId: string, fileName: string): Promise<DownloadableFile> {
        const session = await this.getSession(workspaceId, sessionId);
        const contents = await this.fileServer.readArtifact(this.locationOf(session), fileName);
        if (extname(fileName).toLowerCase() === ".md") {
            const info = { title: fileName.slice(0, -3), subtitle: session.title, author: session.title, exportedAt: exportTimestamp() };
            const file = await this.exporter.export("md", info, contents.toString("utf8"), source => this.fileServer.readDocumentAsset(this.locationOf(session), source));
            return { fileName, mimeType: file.mimeType, contentBase64: file.contents.toString("base64") };
        }
        return { fileName, mimeType: mimeTypeOf(fileName), contentBase64: contents.toString("base64") };
    }

    async downloadDocumentAsset(workspaceId: string, sessionId: string, assetName: string): Promise<DownloadableFile> {
        const session = await this.getSession(workspaceId, sessionId);
        const contents = await this.fileServer.readDocumentAsset(this.locationOf(session), "kin-asset:" + assetName);
        return { fileName: assetName, mimeType: "image/png", contentBase64: contents.toString("base64") };
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
     * Exports one agent reply (a handoff, a document, or any answer) for download as Markdown, Word, or PDF.
     * Exporting never adds another artifact to the discussion.
     */
    async exportMessage(workspaceId: string, sessionId: string, messageId: string, format: DocumentFormat): Promise<DownloadableFile> {
        const session = await this.getSession(workspaceId, sessionId);
        const message = (await this.unit.discussions.listMessages(sessionId))
            .find(candidate => candidate.id === messageId && candidate.role === DISCUSSION_MESSAGE_ROLES.assistant);
        if (!message) throw new AppError(404, DOCUMENT_ERRORS.messageNotFound);
        if (message.activity.some(step => step.detail?.interruption) || (message.turnRole !== DISCUSSION_SPEAKER_ROLES.delegate && !message.activity.some(step => step.kind === DISCUSSION_ACTIVITY_KINDS.savingDocument && step.status === "done"))) {
            throw new AppError(422, "Export is available for handoffs and completed document artifacts.");
        }
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
        const file = await this.exporter.export(format, info, message.content, source => this.fileServer.readDocumentAsset(this.locationOf(session), source));
        const stem = fileStem(title, speaker, session.title);
        if (!stem) throw new AppError(400, DOCUMENT_ERRORS.emptyDocument);
        // A short id keeps exports of different replies with the same title apart.
        const fileName = `${stem} - ${message.id.slice(0, 8)}.${file.extension}`;
        return { fileName, mimeType: file.mimeType, contentBase64: file.contents.toString("base64") };
    }

    /** Converts a Markdown artifact for download without saving a second artifact. */
    async exportArtifact(workspaceId: string, sessionId: string, fileName: string, format: DocumentFormat): Promise<DownloadableFile> {
        const session = await this.getSession(workspaceId, sessionId);
        if (extname(fileName).toLowerCase() !== `.${DOCUMENT_FORMATS.markdown}`) throw new AppError(400, DOCUMENT_ERRORS.unknownFormat);
        const location = this.locationOf(session);
        const markdown = (await this.fileServer.readArtifact(location, fileName)).toString("utf8");
        const stem = fileName.slice(0, -extname(fileName).length);
        const info: DocumentInfo = { title: stem, subtitle: session.title, author: session.title, exportedAt: exportTimestamp() };
        const file = await this.exporter.export(format, info, markdown, source => this.fileServer.readDocumentAsset(location, source));
        const target = `${stem}.${file.extension}`;
        return { fileName: target, mimeType: file.mimeType, contentBase64: file.contents.toString("base64") };
    }

    private locationOf(session: ChatSession) {
        return { workspaceId: session.workspaceId, scope: scopeOf(session), sessionId: session.id };
    }

    /** Saves a document an agent wrote, under a name from its title that no other artifact in the discussion has. */
    private async saveDocument(session: ChatSession, title: string, content: string, plan: SpeakerPlan, document: DocumentRequest | undefined, signal?: AbortSignal) {
        const location = this.locationOf(session);
        const stem = fileStem(title, plan.participant.name);
        if (!stem) throw new AppError(400, DOCUMENT_ERRORS.emptyDocument);
        const info: DocumentInfo = { title, subtitle: session.title, author: plan.participant.name, exportedAt: exportTimestamp() };
        const completed = await this.exporter.createDocument(info, content, {
            workspaceId: session.workspaceId, imageCount: document?.imageCount ?? 0, requiredSections: document?.requiredSections, signal,
            storeAsset: contents => this.fileServer.storeDocumentAsset(location, contents),
            resolveAsset: source => this.fileServer.readDocumentAsset(location, source),
        });
        for (const fileName of numberedNames(stem, DOCUMENT_FORMATS.markdown)) {
            if (await this.fileServer.hasArtifact(location, fileName)) continue;
            signal?.throwIfAborted();
            if (!await this.fileServer.storeArtifactIfAbsent(location, fileName, DOCUMENT_MIME_TYPES.md, Buffer.from(completed.markdown.trim() + "\n", "utf8"))) continue;
            logger.info({ sessionId: session.id, agentId: plan.participant.agentId }, "Saved a document an agent wrote");
            return { fileName, content: completed.markdown, usage: completed.usage };
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
        storageFolderName(input.title?.trim() || defaultTitle);
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

    async listSessions(workspaceId: string): Promise<ChatSession[]> {
        const sessions = await this.unit.discussions.listSessions(workspaceId);
        for (const session of sessions) await this.fileServer.ensureSession(this.locationOf(session));
        return sessions;
    }

    async getSession(workspaceId: string, sessionId: string): Promise<ChatSession> {
        const session = await this.unit.discussions.findSessionInWorkspace(sessionId, workspaceId);
        if (!session) throw new AppError(404, DISCUSSION_ERRORS.sessionNotFound);
        await this.fileServer.ensureSession(this.locationOf(session));
        return session;
    }

    async listMessages(workspaceId: string, sessionId: string): Promise<ChatMessage[]> {
        await this.getSession(workspaceId, sessionId);
        return this.unit.discussions.listMessages(sessionId);
    }

    async listPendingQuestions(workspaceId: string, options: { sessionId?: string; focusQuestionId?: string; limit: number; offset: number }) {
        if (options.sessionId) await this.getSession(workspaceId, options.sessionId);
        return this.unit.discussions.listPendingQuestions(workspaceId, options);
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

    /**
     * Stores an uploaded knowledge document for the session and indexes it for retrieval. Uploading a document with
     * the same name replaces it. Only text documents are accepted, so agents never read binary noise.
     */
    async addKnowledge(workspaceId: string, sessionId: string, fileName: string, mimeType: string, contents: Buffer): Promise<{ name: string; chunks: number; indexed: boolean; characters: number }> {
        const session = await this.getSession(workspaceId, sessionId);
        if (contents.byteLength > DOCUMENT_LIMITS.maxKnowledgeBytes) throw new AppError(413, DOCUMENT_ERRORS.knowledgeTooLarge);
        const upload = uploadedText(fileName, contents);
        const stored = await this.fileServer.storeKnowledgeFile({ workspaceId, scope: scopeOf(session), sessionId }, upload.fileName, mimeType, upload.contents);
        // Indexing for search needs the workspace's embedding model. The document is still stored and readable
        // by agents when that is not available, so a missing model does not reject the upload.
        let chunks = 0;
        let indexed = false;
        try {
            await this.models.ensure(workspaceId);
            chunks = await this.rag.ingestDocument({ workspaceId, sessionId, source: stored.name, text: upload.text });
            indexed = true;
        } catch (error) {
            logger.warn({ workspaceId, sessionId, error: String(error) }, "Session knowledge file stored but not indexed for search");
        }
        logger.info({ workspaceId, sessionId, chunks, indexed }, "Stored session knowledge file");
        return { name: stored.name, chunks, indexed, characters: upload.text.length };
    }

    async listKnowledge(workspaceId: string, sessionId: string): Promise<KnowledgeDocument[]> {
        const session = await this.getSession(workspaceId, sessionId);
        return this.knowledge.documents(this.locationOf(session));
    }

    async deleteKnowledge(workspaceId: string, sessionId: string, fileName: string): Promise<boolean> {
        const session = await this.getSession(workspaceId, sessionId);
        return this.knowledge.remove(this.locationOf(session), fileName);
    }

    /**
     * The agent's reading tools for a turn: the session's attached connectors, its knowledge documents and the
     * workspace's business brief. A failure here leaves the turn without tools rather than failing it.
     */
    private async toolboxFor(session: ChatSession): Promise<AgentToolbox | undefined> {
        try {
            const attached = await this.unit.discussions.listAttachedConnections(session.id);
            const attachedNames = await this.attachedNames(session.id);
            return await this.toolboxes.build({
                workspaceId: session.workspaceId,
                sessionId: session.id,
                location: this.locationOf(session),
                connectionIds: attached.map(row => row.connectionId),
                attachedNames,
                workspaceBrief: await workspaceBrief(this.unit.business, session.workspaceId),
            });
        } catch (error) {
            logger.warn({ sessionId: session.id, error: String(error) }, "Agent tools could not be prepared; replying without them");
            return undefined;
        }
    }

    /** File names attached to the discussion's messages, newest first and without repeats. */
    private async attachedNames(sessionId: string): Promise<string[]> {
        const messages = await this.unit.discussions.listMessages(sessionId);
        const names = new Set<string>();
        for (const message of [...messages].reverse()) for (const file of message.attachments ?? []) names.add(file.name);
        return [...names];
    }
    /**
     * Saves the user's message and prepares the turn that answers it. A turn still running in the session is
     * stopped first: a new message starts a new turn, and teammates still due from the previous one do not reply.
     */
    startMessage(input: PostMessageInput): Promise<PreparedTurn> {
        return this.mutateSession(input.sessionId, () => this.prepareMessage(input));
    }

    /** The named attachments with their sizes; each must still be a knowledge file of this discussion. */
    private async verifiedAttachments(session: ChatSession, names: ReadonlyArray<string>): Promise<Array<{ name: string; size: number }>> {
        if (!names.length) return [];
        const documents = new Map((await this.knowledge.documents(this.locationOf(session))).map(document => [document.name, document.size]));
        return [...new Set(names)].map(name => {
            const size = documents.get(name);
            if (size === undefined) throw new AppError(400, DISCUSSION_ERRORS.attachmentMissing);
            return { name, size };
        });
    }
    private async prepareMessage(input: PostMessageInput): Promise<PreparedTurn> {
        let message = input.message;
        if (message.trim().length === 0) throw new AppError(400, DISCUSSION_ERRORS.emptyMessage);
        if (message.length > DISCUSSION_LIMITS.maxMessageCharacters) throw new AppError(400, DISCUSSION_ERRORS.messageTooLong);
        const session = await this.getSession(input.workspaceId, input.sessionId);
        if (input.answerToQuestionId) {
            const question = await this.unit.discussions.findPendingQuestion(input.workspaceId, input.sessionId, input.answerToQuestionId);
            if (!question) throw new AppError(409, "This question was already answered or is no longer pending. Refresh the discussion.");
            message = answeredQuestionRequest(question, input.message);
        }
        const settings: TurnSettings = { responseMode: input.responseMode, capabilityMode: input.capabilityMode, webEnabled: input.webEnabled };
        const attachments = await this.verifiedAttachments(session, input.attachments ?? []);
        // Provision, check web search, and resolve the speakers before saving the message, so a configuration
        // problem does not leave an unanswered message behind.
        // Converting an attached document to PDF or Word needs no model: it is exported exactly as written.
        const attachmentDelivery = input.answerToQuestionId ? null : await this.attachmentDelivery(session.id, message, attachments);
        const deliveryIntent = input.answerToQuestionId || attachmentDelivery ? null : existingDocumentDelivery(message);
        if (!deliveryIntent && !attachmentDelivery) await this.prepare(input.workspaceId);
        const table = await this.resolveTable(session);
        await this.stopRunningTurn(session.id);
        const deliverySource = deliveryIntent ? await this.deliverySource(session.id) : null;
        const slot = this.claim(session.id);
        try {
            const turnId = randomUUID();
            const queue = deliverySource ? [this.deliverySpeaker(table, deliverySource)] : this.firstSpeakers(table);
            const userMessage = await this.unit.discussions.appendMessage({ sessionId: session.id, role: DISCUSSION_MESSAGE_ROLES.user, content: input.message, turnId, attachments }, input.answerToQuestionId, this.pendingQueue(turnId, queue, settings), input.actorUserId);
            const delivery = attachmentDelivery ?? (deliverySource && deliveryIntent ? { sourceMessageId: deliverySource.id, ...deliveryIntent } : null);
            if (delivery) {
                const current = await this.getSession(session.workspaceId, session.id);
                if (!current.pendingTurn || current.pendingTurn.turnId !== turnId) throw new AppError(409, "The discussion changed before document delivery started.");
                await this.unit.discussions.setPendingTurn(session.id, { ...current.pendingTurn, delivery }, turnId);
            }
            return {
                run: (emit, signal) => {
                    emit({ type: DISCUSSION_STREAM_EVENTS.turn, userMessage, answerToQuestionId: input.answerToQuestionId });
                    return this.runTurn(session, table, turnId, message, settings, queue, null, slot, emit, signal);
                },
            };
        } catch (error) {
            this.release(session.id, slot);
            throw error;
        }
    }

    /** Prepares the rest of a turn the user left before every speaker replied. */
    startContinue(workspaceId: string, sessionId: string): Promise<PreparedTurn> {
        return this.mutateSession(sessionId, () => this.prepareContinue(workspaceId, sessionId));
    }

    private async prepareContinue(workspaceId: string, sessionId: string): Promise<PreparedTurn> {
        const session = await this.getSession(workspaceId, sessionId);
        const pending = session.pendingTurn;
        if (!pending || pending.queue.length === 0) throw new AppError(409, DISCUSSION_ERRORS.nothingPending);
        if (this.running.has(sessionId)) throw new AppError(409, DISCUSSION_ERRORS.replyInProgress);
        const settings: TurnSettings = {
            responseMode: pending.responseMode as DiscussionResponseMode,
            capabilityMode: pending.capabilityMode as DiscussionCapabilityMode,
            webEnabled: pending.webEnabled,
        };
        const table = await this.resolveTable(session);
        const userMessage = (await this.unit.discussions.listMessages(sessionId))
            .find(message => message.turnId === pending.turnId && message.role === DISCUSSION_MESSAGE_ROLES.user);
        if (!userMessage) throw new AppError(409, DISCUSSION_ERRORS.nothingPending);
        const answeredQuestion = await this.unit.discussions.findQuestionForAnswer(sessionId, userMessage.id);
        const message = answeredQuestion ? answeredQuestionRequest(answeredQuestion, userMessage.content) : userMessage.content;
        if (pending.delivery?.attachment) {
            const queue = this.firstSpeakers(table);
            await this.unit.discussions.setPendingTurn(sessionId, { ...pending, checkpoint: undefined, queue: queue.map(toResponder), document: null, taskPlan: null, repositorySnapshots: [] }, pending.turnId);
            const slot = this.claim(sessionId);
            return { run: (emit, signal) => this.runTurn(session, table, pending.turnId, userMessage.content, settings, queue, null, slot, emit, signal) };
        }
        const deliveryIntent = pending.delivery ?? (answeredQuestion ? null : existingDocumentDelivery(message));
        if (deliveryIntent) {
            const source = await this.deliverySource(sessionId, pending.delivery?.sourceMessageId);
            const queue = [this.deliverySpeaker(table, source)];
            await this.unit.discussions.setPendingTurn(sessionId, { ...pending, checkpoint: undefined, queue: queue.map(toResponder), document: null, taskPlan: null, repositorySnapshots: [], delivery: { sourceMessageId: source.id, format: deliveryIntent.format, ...(deliveryIntent.font ? { font: deliveryIntent.font } : {}) } }, pending.turnId);
            const slot = this.claim(sessionId);
            return { run: (emit, signal) => this.runTurn(session, table, pending.turnId, userMessage.content, settings, queue, null, slot, emit, signal) };
        }
        await this.prepare(workspaceId);
        // Agents removed from the team since the turn started are skipped.
        const queue = pending.queue.flatMap(entry => {
            const plan = this.planFor(table, entry, pending.leadName);
            if (!plan) return [];
            if (!pending.taskPlan) return [plan];
            const assignment = pending.taskPlan.assignments.find(item => item.agentId === entry.agentId);
            if (!assignment) throw new AppError(409, "The queued agent is not assigned to the saved task plan.");
            const contributors = pending.taskPlan.assignments.filter(item => item.agentId !== pending.taskPlan!.ownerAgentId);
            const owner = entry.agentId === pending.taskPlan.ownerAgentId;
            // Assignment text alone cannot distinguish a document owner from a delegate on resume.
            return [{ ...plan,
                speakerRole: owner ? contributors.length ? DISCUSSION_SPEAKER_ROLES.wrapUp : DISCUSSION_SPEAKER_ROLES.addressed : DISCUSSION_SPEAKER_ROLES.delegate,
                assignment: { leadName: pending.leadName, task: assignment.task },
                ...(owner && contributors.length && table.kind === "team" ? { contributors: contributors.map(item => {
                    const member = table.team.members.find(candidate => candidate.agentId === item.agentId);
                    if (!member) throw new AppError(409, "A contributor assigned to this task is no longer in the team. Restore the agent or start a new turn.");
                    return member.name;
                }) } : {}),
            }];
        });
        if (pending.taskPlan && queue.length !== pending.queue.length) throw new AppError(409, "An agent assigned to this task is no longer in the team. Restore that agent or start a new turn so a new plan can be made.");
        const slot = this.claim(sessionId);
        const document = pending.document ?? null;
        return { run: (emit, signal) => this.runTurn(session, table, pending.turnId, message, settings, queue, document, slot, emit, signal, pending.taskPlan, pending.repositorySnapshots) };
    }

    /**
     * A request to convert one attached document into a file, as written. The document is the one attached to this
     * message, or, when the message names an attachment without adding one, the latest single attached document.
     */
    private async attachmentDelivery(sessionId: string, message: string, attachments: ReadonlyArray<{ name: string }>): Promise<NonNullable<PendingTurn["delivery"]> | null> {
        const intent = attachmentConversion(message);
        if (!intent) return null;
        let name = attachments.length === 1 ? attachments[0].name : null;
        if (!attachments.length && /\b(?:attached|uploaded|attachment)\b/i.test(message)) {
            const latest = [...await this.unit.discussions.listMessages(sessionId)].reverse().find(item => item.role === DISCUSSION_MESSAGE_ROLES.user && item.attachments?.length);
            if (latest?.attachments.length === 1) name = latest.attachments[0].name;
        }
        return name ? { attachment: name, ...intent } : null;
    }
    private async deliverySource(sessionId: string, messageId?: string): Promise<ChatMessage> {
        const messages = await this.unit.discussions.listMessages(sessionId);
        const source = [...messages].reverse().find(item => (!messageId || item.id === messageId) && item.role === "assistant" && item.turnRole !== "delegate" && item.content.trim() && !item.activity.some(step => step.detail?.interruption));
        if (!source) throw new AppError(422, "There is no completed response to turn into a document. Finish the original request first; an unfinished draft cannot be handed over as complete.");
        return source;
    }

    private deliverySpeaker(table: Table, source: ChatMessage): SpeakerPlan {
        const roster = table.kind === "team" ? table.team.members : [table.agent];
        const participant = roster.find(item => item.agentId === source.speakerAgentId) ?? this.firstSpeakers(table)[0].participant;
        return { participant, speakerRole: DISCUSSION_SPEAKER_ROLES.addressed };
    }

    private async deliverExistingDocument(session: ChatSession, turnId: string, settings: TurnSettings, plan: SpeakerPlan, delivery: NonNullable<PendingTurn["delivery"]>, emit: (event: TurnStreamEvent) => void, signal: AbortSignal): Promise<void> {
        if (delivery.attachment) return this.deliverAttachment(session, turnId, settings, plan, delivery, emit, signal);
        const source = await this.deliverySource(session.id, delivery.sourceMessageId);
        if (documentImageRequests(source.content).length) throw new AppError(422, "The existing response still contains unrendered image instructions. Complete its document generation before exporting it; a format-only request does not regenerate content or images.");
        const history = await this.unit.discussions.listMessages(session.id);
        const original = history.find(item => item.role === "user" && item.turnId === source.turnId);
        const explicit = explicitDeliverableRequirements(original?.content ?? "");
        const saved = source.activity.find(step => step.kind === DISCUSSION_ACTIVITY_KINDS.savingDocument && step.status === "done");
        const document: DocumentRequest = {
            title: (saved?.detail?.title ?? /^#\s+(.+)$/m.exec(source.content)?.[1] ?? `${session.title} document`).slice(0, DOCUMENT_LIMITS.maxTitleCharacters),
            imageCount: Math.max(saved?.detail?.count ?? 0, explicit.minimumImages, documentImageAssets(source.content).length),
            requiredSections: saved?.detail?.requiredSections ?? (explicit.synopsis ? ["Synopsis"] : []),
        };
        const issues = documentRequirementIssues(source.content, document);
        if (issues.length) throw new AppError(422, `The existing response cannot be delivered unchanged: ${issues.join(" ")}`);
        const started = Date.now();
        const step: DiscussionActivityStep = { id: randomUUID(), kind: DISCUSSION_ACTIVITY_KINDS.savingDocument, status: "running", startedAt: new Date().toISOString(), detail: { title: document.title, count: document.imageCount, requiredSections: document.requiredSections, sourceMessageId: source.id } };
        emit({ type: DISCUSSION_STREAM_EVENTS.speaker, agentId: plan.participant.agentId, name: plan.participant.name, role: plan.participant.role, isLead: plan.participant.isLead, turnRole: plan.speakerRole });
        emit({ type: DISCUSSION_STREAM_EVENTS.activity, agentId: plan.participant.agentId, step });
        const location = this.locationOf(session);
        for (const asset of documentImageAssets(source.content)) { signal.throwIfAborted(); await this.fileServer.readDocumentAsset(location, asset); }
        let content = source.content;
        let fileName: string | undefined;
        let usage = ZERO_USAGE;
        if (delivery.format === DOCUMENT_FORMATS.markdown && saved?.detail?.fileName && extname(saved.detail.fileName) === ".md" && await this.fileServer.hasArtifact(location, saved.detail.fileName)) {
            const stored = await this.fileServer.readArtifact(location, saved.detail.fileName);
            const expected = Buffer.from(source.content.trim() + "\n", "utf8");
            if (createHash("sha256").update(stored).digest("hex") === createHash("sha256").update(expected).digest("hex")) fileName = saved.detail.fileName;
        }
        if (!fileName) {
            if (delivery.format === DOCUMENT_FORMATS.markdown) {
                const completed = await this.saveDocument(session, document.title, content, plan, document, signal);
                fileName = completed.fileName; content = completed.content; usage = completed.usage;
            } else {
                const info: DocumentInfo = { title: document.title, subtitle: session.title, author: source.speakerName ?? plan.participant.name, exportedAt: exportTimestamp() };
                fileName = await this.storeExport(location, delivery, info, content, signal);
            }
        }
        if (!fileName) throw new AppError(500, "Document delivery finished without a saved artifact.");
        const completedStep: DiscussionActivityStep = { ...step, status: "done", durationMs: Date.now() - started, detail: { ...step.detail, fileName } };
        emit({ type: DISCUSSION_STREAM_EVENTS.activity, agentId: plan.participant.agentId, step: completedStep });
        const sources = (await this.unit.discussions.listMessageSources(source.id)).map(item => ({ type: item.sourceType, title: item.title ?? item.reference, reference: item.reference, ...(item.url ? { url: item.url } : {}) }));
        for (const event of await this.saveReply(session, turnId, settings, { plan, content, sources, usage, steps: [completedStep] }, [], null)) emit(event);
        logger.info({ workspaceId: session.workspaceId, sessionId: session.id, sourceMessageId: source.id, format: delivery.format }, "Delivered existing document without model regeneration");
    }

    /** Exports content to the requested format and saves it as a new artifact; returns the file name. */
    private async storeExport(location: SessionLocation, delivery: NonNullable<PendingTurn["delivery"]>, info: DocumentInfo, content: string, signal: AbortSignal): Promise<string> {
        const exported = await this.exporter.export(delivery.format, info, content, asset => this.fileServer.readDocumentAsset(location, asset), { fontFamily: delivery.font });
        const stem = fileStem(info.title);
        if (!stem) throw new AppError(422, "The document needs a valid title before it can be saved.");
        for (const candidate of numberedNames(stem, exported.extension)) {
            signal.throwIfAborted();
            if (await this.fileServer.storeArtifactIfAbsent(location, candidate, exported.mimeType, exported.contents)) return candidate;
        }
        throw new AppError(409, DOCUMENT_ERRORS.namesExhausted);
    }
    /** Exports an attached document to the requested format without passing it through a model, so its content is unchanged. */
    private async deliverAttachment(session: ChatSession, turnId: string, settings: TurnSettings, plan: SpeakerPlan, delivery: NonNullable<PendingTurn["delivery"]>, emit: (event: TurnStreamEvent) => void, signal: AbortSignal): Promise<void> {
        const name = delivery.attachment!;
        const location = this.locationOf(session);
        const [document] = await this.knowledge.fullTexts(location, [name]);
        if (!document?.text) throw new AppError(404, DISCUSSION_ERRORS.attachmentMissing);
        const stem = name.replace(/\.docx\.txt$/i, "").replace(/\.[^.]+$/, "");
        const title = (/^#\s+(.+)$/m.exec(document.text)?.[1]?.trim() || stem || session.title).slice(0, DOCUMENT_LIMITS.maxTitleCharacters);
        const started = Date.now();
        const step: DiscussionActivityStep = { id: randomUUID(), kind: DISCUSSION_ACTIVITY_KINDS.savingDocument, status: "running", startedAt: new Date().toISOString(), detail: { title, count: 0, requiredSections: [] } };
        emit({ type: DISCUSSION_STREAM_EVENTS.speaker, agentId: plan.participant.agentId, name: plan.participant.name, role: plan.participant.role, isLead: plan.participant.isLead, turnRole: plan.speakerRole });
        emit({ type: DISCUSSION_STREAM_EVENTS.activity, agentId: plan.participant.agentId, step });
        const info: DocumentInfo = { title, subtitle: session.title, author: plan.participant.name, exportedAt: exportTimestamp() };
        const fileName = await this.storeExport(location, delivery, info, document.text, signal);
        const completedStep: DiscussionActivityStep = { ...step, status: "done", durationMs: Date.now() - started, detail: { ...step.detail, fileName } };
        emit({ type: DISCUSSION_STREAM_EVENTS.activity, agentId: plan.participant.agentId, step: completedStep });
        const format = delivery.format === DOCUMENT_FORMATS.pdf ? "PDF" : delivery.format === DOCUMENT_FORMATS.word ? "Word" : "Markdown";
        const content = `Converted "${name}" to ${format} as written${delivery.font ? `, in the ${delivery.font} font` : ""}. The content was not changed. Saved as "${fileName}".`;
        for (const event of await this.saveReply(session, turnId, settings, { plan, content, sources: [], usage: ZERO_USAGE, steps: [completedStep] }, [], null)) emit(event);
        logger.info({ workspaceId: session.workspaceId, sessionId: session.id, format: delivery.format }, "Converted an attached document without model regeneration");
    }
    /** Ensure the configured model before saving; web credentials are checked only if the plan needs a search. */
    private async prepare(workspaceId: string): Promise<void> {
        await this.models.ensure(workspaceId);
    }

    private async resolveTable(session: ChatSession): Promise<Table> {
        if (session.teamId) return { kind: "team", ...(await this.participants.team(session.workspaceId, session.teamId)) };
        if (session.agentId) return { kind: "solo", agent: await this.participants.soloAgent(session.workspaceId, session.agentId) };
        throw new AppError(409, DISCUSSION_ERRORS.sessionWithoutParticipants);
    }

    /** The initial planning participant; the validated plan selects the actual task executors. */
    private firstSpeakers(table: Table): SpeakerPlan[] {
        if (table.kind === "solo") return [{ participant: table.agent, speakerRole: DISCUSSION_SPEAKER_ROLES.solo }];
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
        taskPlan?: TaskExecutionPlan | null,
        repositorySnapshots?: ReadonlyArray<RepositorySnapshot>,
    ): Promise<void> {
        const stop = () => slot.controller.abort();
        signal.addEventListener("abort", stop, { once: true });
        if (signal.aborted) stop();
        // Keep the current response until it is saved or deliberately replaced by routing.
        // Failure snapshots use the same durable message history as completed responses.
        const attempt: { progress: ReplyProgress | null } = { progress: null };
        const forward = (event: TurnStreamEvent) => {
            if (event.type === DISCUSSION_STREAM_EVENTS.speaker) {
                attempt.progress = { agentId: String(event.agentId), name: String(event.name), role: String(event.role), isLead: event.isLead === true, turnRole: event.turnRole as SpeakerPlan["speakerRole"], content: "", draft: "", steps: new Map() };
            } else if (attempt.progress && event.agentId === attempt.progress.agentId) {
                if (event.type === DISCUSSION_STREAM_EVENTS.activity) {
                    const step = event.step as DiscussionActivityStep;
                    attempt.progress.steps.set(step.id, step);
                } else if (event.type === DISCUSSION_STREAM_EVENTS.token && typeof event.text === "string") {
                    attempt.progress.content = (attempt.progress.content + event.text).slice(0, 1_000_000);
                } else if (event.type === DISCUSSION_STREAM_EVENTS.reply || event.type === DISCUSSION_STREAM_EVENTS.routed) {
                    attempt.progress = null;
                }
            }
            emit(event);
        };
        try {
            const pending = (await this.getSession(session.workspaceId, session.id)).pendingTurn;
            if (pending?.turnId !== turnId) throw new AppError(409, "This turn belongs to a replaced conversation checkpoint.");
            if (pending?.turnId === turnId && pending.delivery) {
                await this.deliverExistingDocument(session, turnId, settings, queue[0], pending.delivery, forward, slot.controller.signal);
                emit({ type: DISCUSSION_STREAM_EVENTS.done, usage: usageOf(await this.getSession(session.workspaceId, session.id)) });
                return;
            }
            const toolbox = await this.toolboxFor(session);
            const collaborators: DiscussionCollaborators = {
                compactHistory: (context, signal) => this.memory(session, { participant: context.participant, speakerRole: context.speakerRole, assignment: context.assignment }, table, message, settings, collaborators, turnId, signal, true),
                observeContext: async measurement => {
                    const state = await this.recordContext(session, measurement, turnId);
                    forward({ type: "context", context: state });
                },
                documentImages: await this.exporter.imageCapability(session.workspaceId),
                // Small knowledge bases stay in the cacheable prefix; larger ones are retrieved during investigation.
                // Web access is available only when enabled, and the plan decides whether it is needed.
                retrieveKnowledge: toolbox?.searchKnowledge
                    ? query => this.knowledge.search(session.workspaceId, session.id, query, DISCUSSION_LIMITS.expertRetrievalTopK)
                    : undefined,
                searchWeb: settings.webEnabled ? query => this.webSearch.search(session.workspaceId, query, DISCUSSION_LIMITS.expertWebResults) : undefined,
                ...(toolbox ? { toolbox } : {}),
            };
            slot.controller.signal.throwIfAborted();
            await runDiscussionTurn(this.runtime, {
                workspaceId: session.workspaceId,
                team: table.kind === "team" ? table.team : null,
                message,
                settings,
                collaborators,
                document,
                taskPlan,
                repositorySnapshots,
                checkpoint: pending.checkpoint,
                allowedAgentIds: queue.some(item => item.speakerRole === DISCUSSION_SPEAKER_ROLES.lead) && table.kind === "team" ? table.team.members.map(member => member.agentId) : queue.map(item => item.participant.agentId),
                ports: {
                    retainDraft: (agentId, content) => {
                        if (attempt.progress?.agentId === agentId) attempt.progress.draft = content.slice(0, 1_000_000);
                    },
                    memory: plan => this.memory(session, plan, table, message, settings, collaborators, turnId, slot.controller.signal),
                    saveReply: (reply, remaining, pendingDocument, plan, snapshots) => this.saveReply(session, turnId, settings, reply, remaining, pendingDocument, plan, snapshots, message),
                    checkpoint: (remaining, pendingDocument, plan, snapshots, progress) => this.storeQueue(session.id, turnId, remaining, settings, pendingDocument, plan, snapshots, progress),
                    saveDocument: (title, content, plan, request, signal) => this.saveDocument(session, title, content, plan, request, signal),
                },
            }, queue, forward, slot.controller.signal);
            const current = await this.getSession(session.workspaceId, session.id);
            emit({ type: DISCUSSION_STREAM_EVENTS.done, usage: usageOf(current) });
        } catch (error) {
            const stopped = slot.controller.signal.aborted;
            const reason = stopped ? "Stopped before completion. Continue when you are ready."
                : error instanceof AppError && (error.statusCode < 500 || error.expose) ? error.message
                : "The agent could not complete this request. Your progress was saved. You can continue the unfinished work.";
            // Keep the checkpointed queue on failure; continuation must use the same plan and commit.
            const current = await this.getSession(session.workspaceId, session.id);
            const first = queue[0];
            const active = current.pendingTurn?.turnId === turnId && current.pendingTurn.queue.length ? attempt.progress ?? (first ? {
                agentId: first.participant.agentId, name: first.participant.name, role: first.participant.role,
                isLead: first.participant.isLead, turnRole: first.speakerRole, content: "", draft: "", steps: new Map<string, DiscussionActivityStep>(),
            } : null) : null;
            if (active) {
                const now = new Date();
                const steps: DiscussionActivityStep[] = [...active.steps.values()].map(step => step.status === "running" ? { ...step, status: "failed", durationMs: Math.max(0, now.getTime() - new Date(step.startedAt).getTime()) } : step);
                steps.push({ id: randomUUID(), kind: DISCUSSION_ACTIVITY_KINDS.writing, status: "failed", startedAt: now.toISOString(), detail: { interruption: reason } });
                const unfinished = active.content || active.draft;
                const saved = await this.unit.discussions.appendMessage({
                    sessionId: session.id, role: DISCUSSION_MESSAGE_ROLES.assistant, turnId,
                    speakerAgentId: active.agentId,
                    speakerName: active.name,
                    speakerRole: active.role,
                    isLead: active.isLead,
                    turnRole: active.turnRole,
                    responseMode: settings.responseMode, capabilityMode: settings.capabilityMode,
                    content: unfinished ? `> Unfinished response: this content has not been handed over as a completed answer.\n\n${unfinished}` : "", activity: steps,
                });
                emit({ type: DISCUSSION_STREAM_EVENTS.reply, agentId: saved.speakerAgentId, message: saved, sources: [], usage: usageOf(current) });
            }
            const members = table.kind === "team" ? table.team.members : queue.map(plan => plan.participant);
            emit({ type: DISCUSSION_STREAM_EVENTS.pending, speakers: (current.pendingTurn?.queue ?? []).flatMap(item => {
                const member = members.find(member => member.agentId === item.agentId);
                return member ? [{ agentId: member.agentId, name: member.name, role: member.role, isLead: member.isLead }] : [];
            }) });
            if (stopped) return;
            logger.error({ sessionId: session.id, error: String(error) }, "Discussion turn failed");
            throw error;
        } finally {
            signal.removeEventListener("abort", stop);
            this.release(session.id, slot);

        }
    }

    private async memory(session: ChatSession, plan: SpeakerPlan, table: Table, message: string, settings: TurnSettings, collaborators: DiscussionCollaborators, turnId: string, signal?: AbortSignal, force = false): Promise<{ summary: string | null; transcript: TranscriptMessage[] }> {
        for (let attempt = 0; attempt < 3; attempt++) {
            signal?.throwIfAborted();
            const current = await this.getSession(session.workspaceId, session.id);
            const messages = await this.unit.discussions.listMessages(session.id);
            const transcript = toTranscript(messages.slice(current.summarizedMessageCount).filter(item => item.turnId !== turnId || item.role !== "user"));
            const measurement = await this.runtime.measureContext({ workspaceId: session.workspaceId, participant: plan.participant, speakerRole: plan.speakerRole,
                team: table.kind === "team" ? table.team : null, summary: current.summary, transcript, message, ...settings, collaborators,
                taskPlan: current.pendingTurn?.taskPlan ?? undefined }, signal);
            let latestUser = messages.length - 1;
            while (latestUser >= 0 && messages[latestUser].role !== "user") latestUser--;
            let coverUntil = Math.min(messages.length - CONTEXT_COMPACTION.keepRecentMessages, latestUser);
            while (coverUntil > current.summarizedMessageCount && messages[coverUntil]?.role !== "user") coverUntil--;
            if (coverUntil <= current.summarizedMessageCount || attempt > 0) coverUntil = latestUser;
            if ((measurement.inputTokens >= measurement.thresholdTokens || force) && coverUntil > current.summarizedMessageCount && attempt < 2) {
                const folded = toTranscript(messages.slice(current.summarizedMessageCount, coverUntil));
                const result = await this.runtime.summarize(session.workspaceId, current.summary, folded, signal);
                await this.unit.discussions.addUsage(session.id, result.usage);
                if (await this.unit.discussions.updateMemory(session.id, result.summary, coverUntil, current.memoryRevision)) {
                    const refreshed = await this.getSession(session.workspaceId, session.id);
                    await this.unit.discussions.updateContext(session.id, { ...measurement, compactionCount: (current.contextState?.compactionCount ?? 0) + 1, lastCompactedAt: new Date().toISOString() }, refreshed.memoryRevision);
                }
                force = false;
                continue;
            }
            const state = await this.recordContext(current, measurement);
            await collaborators.observeContext?.(measurement);
            logger.debug({ sessionId: session.id, inputTokens: state.inputTokens, maxInputTokens: state.maxInputTokens }, "Measured active discussion context");
            return { summary: current.summary, transcript };
        }
        throw new AppError(409, "The conversation changed during context compaction. Retry this turn.");
    }

    private async recordContext(session: ChatSession, measurement: Omit<ConversationContext, "compactionCount" | "lastCompactedAt">, turnId?: string): Promise<ConversationContext> {
        const current = await this.unit.discussions.findSessionInWorkspace(session.id, session.workspaceId);
        if (!current) throw new AppError(404, DISCUSSION_ERRORS.sessionNotFound);
        if (turnId && current.pendingTurn?.turnId !== turnId) throw new AppError(409, "This context belongs to a replaced discussion checkpoint.");
        const state = { ...measurement, compactionCount: current.contextState?.compactionCount ?? 0, lastCompactedAt: current.contextState?.lastCompactedAt ?? null };
        await this.unit.discussions.updateContext(session.id, state, current.memoryRevision);
        return state;
    }

    async getContext(workspaceId: string, sessionId: string): Promise<ConversationContext | null> {
        return (await this.getSession(workspaceId, sessionId)).contextState;
    }

    compactContext(workspaceId: string, sessionId: string): Promise<ConversationContext | null> {
        return this.mutateSession(sessionId, async () => {
            const session = await this.getSession(workspaceId, sessionId);
            if (this.running.has(sessionId)) throw new AppError(409, "Wait until the current response finishes before compacting context.");
            await this.prepare(workspaceId);
            const table = await this.resolveTable(session);
            const toolbox = await this.toolboxFor(session);
            await this.memory(session, this.firstSpeakers(table)[0], table, "", { responseMode: "detailed", capabilityMode: "fast", webEnabled: false }, { toolbox }, "", undefined, true);
            return this.getContext(workspaceId, sessionId);
        });
    }

    restoreCheckpoint(workspaceId: string, sessionId: string, messageId: string): Promise<RestoredCheckpoint> {
        return this.mutateSession(sessionId, async () => {
            const session = await this.getSession(workspaceId, sessionId);
            if (session.composerDraft?.messageId !== messageId && !(await this.unit.discussions.listMessages(sessionId)).some(item => item.id === messageId && item.role === "user")) {
                throw new AppError(409, "The checkpoint is no longer available. Refresh the discussion.");
            }
            await this.stopRunningTurn(sessionId);
            const restored = await this.unit.discussions.restoreCheckpoint(sessionId, messageId);
            if (!restored) throw new AppError(409, "The checkpoint is no longer available. Refresh the discussion.");
            return restored;
        });
    }

    private mutateSession<T>(sessionId: string, action: () => Promise<T>): Promise<T> {
        const work = (this.sessionMutations.get(sessionId) ?? Promise.resolve()).catch(() => undefined).then(action);
        this.sessionMutations.set(sessionId, work);
        void work.finally(() => { if (this.sessionMutations.get(sessionId) === work) this.sessionMutations.delete(sessionId); }).catch(() => undefined);
        return work;
    }

    /** Saves one reply with its activity and usage, then the speakers still due, and reports both to the client. */
    private async saveReply(
        session: ChatSession,
        turnId: string,
        settings: TurnSettings,
        reply: SpokenReply,
        remaining: ReadonlyArray<SpeakerPlan>,
        pendingDocument: TurnDocument | null,
        taskPlan?: TaskExecutionPlan | null,
        repositorySnapshots?: ReadonlyArray<RepositorySnapshot>,
        requestContent = "",
    ): Promise<TurnStreamEvent[]> {
        const current = await this.getSession(session.workspaceId, session.id);
        if (current.pendingTurn?.turnId !== turnId) throw new AppError(409, "This reply belongs to a replaced conversation checkpoint.");
        const { participant } = reply.plan;
        const { message: saved, session: totals, question } = await this.unit.discussions.appendMessageWithSources({
            ...(reply.questions?.length ? { clarification: { questions: [...reply.questions], requestContent } } : {}),
            pendingTurn: this.pendingQueue(turnId, remaining, settings, pendingDocument, taskPlan, repositorySnapshots),
            usage: reply.usage,
            message: {
                sessionId: session.id,
                role: DISCUSSION_MESSAGE_ROLES.assistant,
                content: reply.content,
                turnId,
                speakerAgentId: participant.agentId,
                speakerName: participant.name,
                speakerRole: participant.role,
                isLead: participant.isLead,
                turnRole: reply.questions?.length ? DISCUSSION_SPEAKER_ROLES.addressed : reply.plan.speakerRole,
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
        return [
            { type: DISCUSSION_STREAM_EVENTS.reply, agentId: participant.agentId, message: saved, sources: reply.sources, usage: usageOf(totals) },
            ...(question ? [{ type: "question", question: { id: question.id, sessionId: session.id, messageId: saved.id, questions: question.questions, createdAt: question.createdAt, sessionTitle: session.title, speakerName: participant.name } }] : []),
            { type: DISCUSSION_STREAM_EVENTS.pending, speakers: remaining.map(toPendingSpeaker) },
        ];
    }

    /** Stores who is still due to reply, so a turn the user leaves resumes where it stopped; empty clears it. */
    private async storeQueue(sessionId: string, turnId: string, queue: ReadonlyArray<SpeakerPlan>, settings: TurnSettings, document: TurnDocument | null = null, taskPlan: TaskExecutionPlan | null = null, repositorySnapshots?: ReadonlyArray<RepositorySnapshot>, checkpoint?: TurnCheckpoint): Promise<void> {
        const pending = this.pendingQueue(turnId, queue, settings, document, taskPlan, repositorySnapshots, checkpoint);
        await this.unit.discussions.setPendingTurn(sessionId, pending, turnId);
    }

    private pendingQueue(turnId: string, queue: ReadonlyArray<SpeakerPlan>, settings: TurnSettings, document: TurnDocument | null = null, taskPlan: TaskExecutionPlan | null = null, repositorySnapshots?: ReadonlyArray<RepositorySnapshot>, checkpoint?: TurnCheckpoint): PendingTurn | null {
        if (!queue.length) return null;
        const leadName = queue.find(plan => plan.assignment)?.assignment?.leadName ?? queue[0].participant.name;
        return { turnId, queue: queue.map(toResponder), leadName, ...settings, document, taskPlan, repositorySnapshots, checkpoint };
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

}
