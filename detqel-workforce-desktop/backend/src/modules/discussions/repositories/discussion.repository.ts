import type {
    ChatSession,
    NewChatSession,
    ChatMessage,
    NewChatMessage,
    ChatMessageSource,
    NewChatMessageSource,
    ChatSessionConnection,
    PendingResponder,
    PendingTurn,
    ChatQuestion,
} from "../../../infrastructure/database/schema/discussions.js";
import type { ConversationContext } from "../../../shared/agents/context/conversation-context.js";
export type { ChatSession, NewChatSession, ChatMessage, NewChatMessage, ChatMessageSource, NewChatMessageSource, ChatSessionConnection, PendingResponder, PendingTurn };

export type RestoredCheckpoint = ChatSession & {
    composerDraft: { readonly messageId: string; readonly content: string; readonly answerToQuestionId?: string };
    messages: ChatMessage[];
};

export interface UsageDelta {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cachedTokens: number;
    readonly costUsd: number;
}

export interface CreateMessageWithSources {
    readonly message: NewChatMessage;
    readonly sources: ReadonlyArray<Omit<NewChatMessageSource, "messageId">>;
    readonly pendingTurn: PendingTurn | null;
    readonly usage: UsageDelta;
    readonly clarification?: { readonly questions: ChatQuestion["questions"]; readonly requestContent: string };
}

export type PendingQuestionSummary = Pick<ChatQuestion, "id" | "sessionId" | "messageId" | "questions" | "createdAt"> & { sessionTitle: string; speakerName: string | null };

export interface IDiscussionRepository {
    createSession(session: NewChatSession): Promise<ChatSession>;
    listSessions(workspaceId: string): Promise<ChatSession[]>;
    /** Returns the session only when it belongs to the given workspace; otherwise null. */
    findSessionInWorkspace(sessionId: string, workspaceId: string): Promise<ChatSession | null>;
    renameSession(sessionId: string, title: string): Promise<ChatSession | null>;
    deleteSession(sessionId: string): Promise<boolean>;

    listMessages(sessionId: string): Promise<ChatMessage[]>;
    appendMessage(message: NewChatMessage, answerToQuestionId?: string, pendingTurn?: PendingTurn | null, actorUserId?: string): Promise<ChatMessage>;
    /** Commits the reply, sources, usage and next queue in one transaction. */
    appendMessageWithSources(input: CreateMessageWithSources): Promise<{ message: ChatMessage; session: ChatSession; question?: ChatQuestion }>;
    listPendingQuestions(workspaceId: string, options: { sessionId?: string; focusQuestionId?: string; limit: number; offset: number }): Promise<{ items: PendingQuestionSummary[]; total: number }>;
    findPendingQuestion(workspaceId: string, sessionId: string, questionId: string): Promise<ChatQuestion | null>;
    findQuestionForAnswer(sessionId: string, answerMessageId: string): Promise<ChatQuestion | null>;
    listMessageSources(messageId: string): Promise<ChatMessageSource[]>;

    /** Replaces the queue of teammates still due to reply; null clears it. */
    setPendingTurn(sessionId: string, pending: PendingTurn | null, expectedTurnId?: string): Promise<void>;
    /** Adds one call's gateway usage to the session's running totals atomically and returns the updated session. */
    addUsage(sessionId: string, usage: UsageDelta): Promise<ChatSession>;
    /** Stores the memory summary and how many of the session's oldest messages it covers. */
    updateMemory(sessionId: string, summary: string, summarizedMessageCount: number, revision: number): Promise<boolean>;
    updateContext(sessionId: string, context: ConversationContext, revision: number): Promise<void>;
    restoreCheckpoint(sessionId: string, messageId: string): Promise<RestoredCheckpoint | null>;

    listAttachedConnections(sessionId: string): Promise<ChatSessionConnection[]>;
    attachConnection(sessionId: string, connectionId: string): Promise<ChatSessionConnection>;
    detachConnection(sessionId: string, connectionId: string): Promise<boolean>;
    isConnectionAttached(sessionId: string, connectionId: string): Promise<boolean>;
}
