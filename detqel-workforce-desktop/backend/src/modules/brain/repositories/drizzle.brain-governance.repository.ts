import { and, asc, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import { brainAuditEvents, brainConversations, brainEvents, brainMessages } from "../../../infrastructure/database/schema/brain.js";
import type { BrainAuditEvent, BrainConversation, BrainEvent, BrainMessage, NewBrainAuditEvent, NewBrainEvent } from "../../../shared/types/entities.js";
import type { IBrainGovernanceRepository } from "./brain-governance.repository.js";

export class BrainGovernanceRepository implements IBrainGovernanceRepository {
    constructor(private readonly database: DatabaseSession) {}

    async recordAudit(events: ReadonlyArray<NewBrainAuditEvent>): Promise<void> {
        if (events.length) await this.database.insert(brainAuditEvents).values([...events]);
    }
    listAudit(workspaceId: string, options: { targetType?: string; targetId?: string; limit: number; before?: Date }): Promise<BrainAuditEvent[]> {
        return this.database.select().from(brainAuditEvents).where(and(
            eq(brainAuditEvents.workspaceId, workspaceId),
            options.targetType ? eq(brainAuditEvents.targetType, options.targetType) : undefined,
            options.targetId ? eq(brainAuditEvents.targetId, options.targetId) : undefined,
            options.before ? lt(brainAuditEvents.createdAt, options.before) : undefined,
        )).orderBy(desc(brainAuditEvents.createdAt)).limit(options.limit);
    }

    async publishEvents(events: ReadonlyArray<NewBrainEvent>): Promise<void> {
        if (events.length) await this.database.insert(brainEvents).values([...events]);
    }
    claimPendingEvents(limit: number): Promise<BrainEvent[]> {
        const pending = this.database.select({ id: brainEvents.id }).from(brainEvents).where(isNull(brainEvents.processedAt))
            .orderBy(asc(brainEvents.occurredAt)).limit(limit).for("update", { skipLocked: true });
        return this.database.update(brainEvents).set({ processedAt: new Date() }).where(inArray(brainEvents.id, pending)).returning();
    }

    async createConversation(workspaceId: string, userId: string, title: string): Promise<BrainConversation> {
        const [row] = await this.database.insert(brainConversations).values({ workspaceId, userId, title }).returning();
        return row;
    }
    async findConversation(id: string, workspaceId: string, userId: string): Promise<BrainConversation | null> {
        const [row] = await this.database.select().from(brainConversations)
            .where(and(eq(brainConversations.id, id), eq(brainConversations.workspaceId, workspaceId), eq(brainConversations.userId, userId))).limit(1);
        return row ?? null;
    }
    listConversations(workspaceId: string, userId: string, limit: number): Promise<BrainConversation[]> {
        return this.database.select().from(brainConversations)
            .where(and(eq(brainConversations.workspaceId, workspaceId), eq(brainConversations.userId, userId)))
            .orderBy(desc(brainConversations.updatedAt)).limit(limit);
    }
    async touchConversation(id: string): Promise<void> {
        await this.database.update(brainConversations).set({ updatedAt: new Date() }).where(eq(brainConversations.id, id));
    }
    async deleteConversation(id: string, workspaceId: string, userId: string): Promise<boolean> {
        const rows = await this.database.delete(brainConversations)
            .where(and(eq(brainConversations.id, id), eq(brainConversations.workspaceId, workspaceId), eq(brainConversations.userId, userId))).returning({ id: brainConversations.id });
        return rows.length > 0;
    }
    async addMessage(data: Omit<BrainMessage, "id" | "createdAt">): Promise<BrainMessage> {
        const [row] = await this.database.insert(brainMessages).values(data).returning();
        return row;
    }
    async listMessages(conversationId: string, limit: number): Promise<BrainMessage[]> {
        const rows = await this.database.select().from(brainMessages).where(eq(brainMessages.conversationId, conversationId))
            .orderBy(desc(brainMessages.createdAt), desc(brainMessages.id)).limit(limit);
        return rows.reverse();
    }
}
