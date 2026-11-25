import type { BrainAuditEvent, BrainConversation, BrainEvent, BrainMessage, NewBrainAuditEvent, NewBrainEvent } from "../../../shared/types/entities.js";

/** Governance persistence: the audit trail, the event outbox and the assistant's conversations. */
export interface IBrainGovernanceRepository {
    recordAudit(events: ReadonlyArray<NewBrainAuditEvent>): Promise<void>;
    listAudit(workspaceId: string, options: { targetType?: string; targetId?: string; limit: number; before?: Date }): Promise<BrainAuditEvent[]>;

    publishEvents(events: ReadonlyArray<NewBrainEvent>): Promise<void>;
    /** Claims unprocessed events (marking them processed) so each is handled by one worker. */
    claimPendingEvents(limit: number): Promise<BrainEvent[]>;

    createConversation(workspaceId: string, userId: string, title: string): Promise<BrainConversation>;
    /** A conversation belongs to one user; another user's id never matches. */
    findConversation(id: string, workspaceId: string, userId: string): Promise<BrainConversation | null>;
    listConversations(workspaceId: string, userId: string, limit: number): Promise<BrainConversation[]>;
    touchConversation(id: string): Promise<void>;
    deleteConversation(id: string, workspaceId: string, userId: string): Promise<boolean>;
    addMessage(data: Omit<BrainMessage, "id" | "createdAt">): Promise<BrainMessage>;
    listMessages(conversationId: string, limit: number): Promise<BrainMessage[]>;
}
