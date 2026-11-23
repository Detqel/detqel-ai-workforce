import { and, asc, desc, eq, sql } from "drizzle-orm";
import { AppError } from "../../../shared/errors/app-error.js";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import {
    chatMessageSources,
    chatMessages,
    chatSessionConnections,
    chatSessions,
    type ChatMessage,
    type ChatMessageSource,
    type ChatSession,
    type ChatSessionConnection,
    type NewChatMessage,
    type NewChatSession,
    type PendingTurn,
} from "../../../infrastructure/database/schema/discussions.js";
import type { CreateMessageWithSources, IDiscussionRepository, RestoredCheckpoint, UsageDelta } from "./discussion.repository.js";
import type { ConversationContext } from "../../../shared/agents/context/conversation-context.js";

export class DiscussionRepository implements IDiscussionRepository {
    constructor(private readonly database: DatabaseSession) {}

    async createSession(session: NewChatSession): Promise<ChatSession> {
        const [created] = await this.database.insert(chatSessions).values(session).returning();
        return created;
    }

    async listSessions(workspaceId: string): Promise<ChatSession[]> {
        return this.database.select().from(chatSessions).where(eq(chatSessions.workspaceId, workspaceId)).orderBy(desc(chatSessions.updatedAt));
    }

    async findSessionInWorkspace(sessionId: string, workspaceId: string): Promise<ChatSession | null> {
        const rows = await this.database
            .select()
            .from(chatSessions)
            .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.workspaceId, workspaceId)))
            .limit(1);
        return rows[0] || null;
    }

    async renameSession(sessionId: string, title: string): Promise<ChatSession | null> {
        const [updated] = await this.database.update(chatSessions).set({ title, updatedAt: new Date() }).where(eq(chatSessions.id, sessionId)).returning();
        return updated || null;
    }

    async deleteSession(sessionId: string): Promise<boolean> {
        const deleted = await this.database.delete(chatSessions).where(eq(chatSessions.id, sessionId)).returning({ id: chatSessions.id });
        return deleted.length > 0;
    }

    async listMessages(sessionId: string): Promise<ChatMessage[]> {
        return this.database.select().from(chatMessages).where(eq(chatMessages.sessionId, sessionId)).orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
    }

    async appendMessage(message: NewChatMessage): Promise<ChatMessage> {
        return this.database.transaction(async tx => {
            const [session] = await tx.select().from(chatSessions).where(eq(chatSessions.id, message.sessionId)).for("update");
            if (!session || (message.role === "assistant" && session.pendingTurn?.turnId !== message.turnId)) throw new AppError(409, "The discussion checkpoint changed before this message was saved.");
            const [created] = await tx.insert(chatMessages).values(message).returning();
            await tx.update(chatSessions).set({ updatedAt: new Date(), ...(message.role === "user" ? { composerDraft: null } : {}) }).where(eq(chatSessions.id, message.sessionId));
            return created;
        });
    }

    async appendMessageWithSources(input: CreateMessageWithSources): Promise<{ message: ChatMessage; session: ChatSession }> {
        return this.database.transaction(async tx => {
            const [session] = await tx.select().from(chatSessions).where(eq(chatSessions.id, input.message.sessionId)).for("update");
            if (!session || !session.pendingTurn || session.pendingTurn.turnId !== input.message.turnId || session.pendingTurn.queue[0]?.agentId !== input.message.speakerAgentId
                || (input.pendingTurn && input.pendingTurn.turnId !== input.message.turnId)) throw new AppError(409, "The discussion checkpoint changed before this reply was saved.");
            const [created] = await tx.insert(chatMessages).values(input.message).returning();
            if (input.sources.length > 0) {
                await tx.insert(chatMessageSources).values(input.sources.map(source => ({ ...source, messageId: created.id })));
            }
            const [updated] = await tx.update(chatSessions).set({ updatedAt: new Date(), pendingTurn: input.pendingTurn,
                inputTokens: sql`${chatSessions.inputTokens} + ${input.usage.inputTokens}`,
                outputTokens: sql`${chatSessions.outputTokens} + ${input.usage.outputTokens}`,
                cachedTokens: sql`${chatSessions.cachedTokens} + ${input.usage.cachedTokens}`,
                costUsd: sql`${chatSessions.costUsd} + ${input.usage.costUsd}`,
            }).where(eq(chatSessions.id, input.message.sessionId)).returning();
            return { message: created, session: updated };
        });
    }

    async listMessageSources(messageId: string): Promise<ChatMessageSource[]> {
        return this.database.select().from(chatMessageSources).where(eq(chatMessageSources.messageId, messageId)).orderBy(asc(chatMessageSources.createdAt));
    }

    async listAttachedConnections(sessionId: string): Promise<ChatSessionConnection[]> {
        return this.database.select().from(chatSessionConnections).where(eq(chatSessionConnections.sessionId, sessionId));
    }

    async attachConnection(sessionId: string, connectionId: string): Promise<ChatSessionConnection> {
        const [attached] = await this.database
            .insert(chatSessionConnections)
            .values({ sessionId, connectionId })
            .onConflictDoNothing({ target: [chatSessionConnections.sessionId, chatSessionConnections.connectionId] })
            .returning();
        if (attached) return attached;
        const [existing] = await this.database
            .select()
            .from(chatSessionConnections)
            .where(and(eq(chatSessionConnections.sessionId, sessionId), eq(chatSessionConnections.connectionId, connectionId)))
            .limit(1);
        return existing;
    }

    async detachConnection(sessionId: string, connectionId: string): Promise<boolean> {
        const deleted = await this.database
            .delete(chatSessionConnections)
            .where(and(eq(chatSessionConnections.sessionId, sessionId), eq(chatSessionConnections.connectionId, connectionId)))
            .returning({ id: chatSessionConnections.id });
        return deleted.length > 0;
    }

    async isConnectionAttached(sessionId: string, connectionId: string): Promise<boolean> {
        const rows = await this.database
            .select({ id: chatSessionConnections.id })
            .from(chatSessionConnections)
            .where(and(eq(chatSessionConnections.sessionId, sessionId), eq(chatSessionConnections.connectionId, connectionId)))
            .limit(1);
        return rows.length > 0;
    }

    async setPendingTurn(sessionId: string, pending: PendingTurn | null, expectedTurnId?: string): Promise<void> {
        const updated = await this.database.update(chatSessions).set({ pendingTurn: pending }).where(and(eq(chatSessions.id, sessionId), expectedTurnId ? sql`${chatSessions.pendingTurn}->>'turnId' = ${expectedTurnId}` : undefined)).returning({ id: chatSessions.id });
        if (!updated.length) throw new AppError(409, "The discussion checkpoint changed before this execution plan was saved.");
    }

    async addUsage(sessionId: string, usage: UsageDelta): Promise<ChatSession> {
        // Incremented in SQL so concurrent calls for the same session never lose an update.
        const [updated] = await this.database.update(chatSessions).set({
            inputTokens: sql`${chatSessions.inputTokens} + ${usage.inputTokens}`,
            outputTokens: sql`${chatSessions.outputTokens} + ${usage.outputTokens}`,
            cachedTokens: sql`${chatSessions.cachedTokens} + ${usage.cachedTokens}`,
            costUsd: sql`${chatSessions.costUsd} + ${usage.costUsd}`,
        }).where(eq(chatSessions.id, sessionId)).returning();
        return updated;
    }

    async updateMemory(sessionId: string, summary: string, summarizedMessageCount: number, revision: number): Promise<boolean> {
        const rows = await this.database.update(chatSessions).set({ summary, summarizedMessageCount, memoryRevision: sql`${chatSessions.memoryRevision} + 1` })
            .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.memoryRevision, revision))).returning({ id: chatSessions.id });
        return rows.length === 1;
    }

    async updateContext(sessionId: string, contextState: ConversationContext, revision: number): Promise<void> {
        await this.database.update(chatSessions).set({ contextState }).where(and(eq(chatSessions.id, sessionId), eq(chatSessions.memoryRevision, revision)));
    }

    async restoreCheckpoint(sessionId: string, messageId: string): Promise<RestoredCheckpoint | null> {
        return this.database.transaction(async tx => {
            const [session] = await tx.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).for("update");
            if (!session) return null;
            const [target] = await tx.select().from(chatMessages).where(and(eq(chatMessages.id, messageId), eq(chatMessages.sessionId, sessionId), eq(chatMessages.role, "user")));
            if (!target) {
                // A retry after a lost response returns the durable draft without deleting anything else.
                if (session.composerDraft?.messageId !== messageId) return null;
                const messages = await tx.select().from(chatMessages).where(eq(chatMessages.sessionId, sessionId)).orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
                return { ...session, composerDraft: session.composerDraft, messages };
            }
            const composerDraft = { messageId: target.id, content: target.content };
            // Compare database timestamps directly; JS Dates lose PostgreSQL's sub-millisecond precision.
            await tx.delete(chatMessages).where(and(eq(chatMessages.sessionId, sessionId), sql`(${chatMessages.createdAt}, ${chatMessages.id}) >= (SELECT checkpoint.created_at, checkpoint.id FROM chat_messages checkpoint WHERE checkpoint.id = ${messageId}::uuid AND checkpoint.session_id = ${sessionId}::uuid)`));
            const [updated] = await tx.update(chatSessions).set({ summary: null, summarizedMessageCount: 0, contextState: null, composerDraft,
                memoryRevision: sql`${chatSessions.memoryRevision} + 1`, pendingTurn: null, updatedAt: new Date() }).where(eq(chatSessions.id, sessionId)).returning();
            const messages = await tx.select().from(chatMessages).where(eq(chatMessages.sessionId, sessionId)).orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
            return { ...updated, composerDraft, messages };
        });
    }

}
