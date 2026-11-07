import { and, asc, desc, eq, sql } from "drizzle-orm";
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
import type { CreateMessageWithSources, IDiscussionRepository, UsageDelta } from "./discussion.repository.js";

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
        return this.database.select().from(chatMessages).where(eq(chatMessages.sessionId, sessionId)).orderBy(asc(chatMessages.createdAt));
    }

    async appendMessage(message: NewChatMessage): Promise<ChatMessage> {
        const [created] = await this.database.insert(chatMessages).values(message).returning();
        await this.touchSession(message.sessionId);
        return created;
    }

    async appendMessageWithSources(input: CreateMessageWithSources): Promise<ChatMessage> {
        return this.database.transaction(async tx => {
            const [created] = await tx.insert(chatMessages).values(input.message).returning();
            if (input.sources.length > 0) {
                await tx.insert(chatMessageSources).values(input.sources.map(source => ({ ...source, messageId: created.id })));
            }
            await tx.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, input.message.sessionId));
            return created;
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

    async setPendingTurn(sessionId: string, pending: PendingTurn | null): Promise<void> {
        await this.database.update(chatSessions).set({ pendingTurn: pending }).where(eq(chatSessions.id, sessionId));
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

    async updateMemory(sessionId: string, summary: string, summarizedMessageCount: number): Promise<void> {
        await this.database.update(chatSessions).set({ summary, summarizedMessageCount }).where(eq(chatSessions.id, sessionId));
    }

    private async touchSession(sessionId: string): Promise<void> {
        await this.database.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, sessionId));
    }
}
