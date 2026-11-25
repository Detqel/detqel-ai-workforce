import { BRAIN_ERRORS, BRAIN_LIMITS, BRAIN_MESSAGE_ROLES } from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import type { BrainMessage } from "../../../../shared/types/entities.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import type { BrainActor } from "../brain-types.js";
import { SlidingWindowLimiter } from "../rate-limiter.js";
import type { BrainOrchestrator } from "../workforce/brain-orchestrator.js";

/** A stored message in the shape the assistant panel renders. */
export function messageView(message: BrainMessage) {
    const payload = message.payload as Record<string, unknown>;
    return {
        id: message.id, role: message.role, content: message.content, createdAt: message.createdAt, taskId: message.taskId,
        attachments: payload.attachments ?? undefined, metricCard: payload.metricCard ?? undefined,
        insightsTitle: payload.insightsTitle ?? undefined, insights: payload.insights ?? undefined,
        actionsTitle: payload.actionsTitle ?? undefined, actions: payload.actions ?? undefined,
        statements: payload.statements ?? undefined, evidence: payload.evidence ?? undefined, agents: payload.agents ?? undefined,
        approvals: payload.approvals ?? undefined, planner: payload.planner ?? undefined, verification: payload.verification ?? undefined,
    };
}

/**
 * The Business Brain assistant (Journey B and D). Conversations are private to the user who started them. Each
 * question is answered by the orchestrator in the caller's verified tenant and role, and the reply is stored with
 * its task id, evidence and verification so it can be inspected later.
 */
export class BrainAssistantService {
    private readonly limiter = new SlidingWindowLimiter(BRAIN_LIMITS.assistantRequestsPerMinute, 60_000);

    constructor(private readonly unit: IUnitOfWork, private readonly orchestrator: BrainOrchestrator, private readonly audit: BrainAuditService) {}

    async ask(actor: BrainActor, input: { conversationId?: string; message: string; attachments?: string[] }, signal?: AbortSignal) {
        if (!actor.userId) throw new AppError(401, "Sign in to continue");
        this.limiter.consume(`${actor.workspaceId}:${actor.userId}`);
        const conversation = input.conversationId
            ? await this.unit.brainGovernance.findConversation(input.conversationId, actor.workspaceId, actor.userId)
            : await this.unit.brainGovernance.createConversation(actor.workspaceId, actor.userId, input.message.replace(/\s+/g, " ").trim().slice(0, 120) || "Business Brain");
        if (!conversation) throw new AppError(404, BRAIN_ERRORS.conversationNotFound);
        const history = await this.unit.brainGovernance.listMessages(conversation.id, BRAIN_LIMITS.conversationHistoryMessages);
        const userMessage = await this.unit.brainGovernance.addMessage({
            workspaceId: actor.workspaceId, conversationId: conversation.id, role: BRAIN_MESSAGE_ROLES.user, content: input.message,
            payload: input.attachments?.length ? { attachments: input.attachments } : {}, taskId: null,
        });
        const result = await this.orchestrator.run({ actor, question: input.message, conversationId: conversation.id, history: history.map(message => ({ role: message.role, content: message.content })), signal });
        const { content, ...payload } = result.payload;
        const assistantMessage = await this.unit.brainGovernance.addMessage({
            workspaceId: actor.workspaceId, conversationId: conversation.id, role: BRAIN_MESSAGE_ROLES.assistant, content,
            payload: payload as unknown as Record<string, unknown>, taskId: result.taskId,
        });
        await this.unit.brainGovernance.touchConversation(conversation.id);
        await this.audit.activity(actor.workspaceId, actor.userId, "investigations", "Asked the Business Brain", "brain-conversation", conversation.id, { event: "brain-question", taskId: result.taskId, status: result.status });
        return { conversation, taskId: result.taskId, status: result.status, messages: [messageView(userMessage), messageView(assistantMessage)] };
    }

    listConversations(actor: BrainActor) {
        return this.unit.brainGovernance.listConversations(actor.workspaceId, actor.userId!, 50);
    }

    async messages(actor: BrainActor, conversationId: string) {
        const conversation = await this.unit.brainGovernance.findConversation(conversationId, actor.workspaceId, actor.userId!);
        if (!conversation) throw new AppError(404, BRAIN_ERRORS.conversationNotFound);
        return { conversation, messages: (await this.unit.brainGovernance.listMessages(conversationId, 200)).map(messageView) };
    }

    async deleteConversation(actor: BrainActor, conversationId: string) {
        if (!await this.unit.brainGovernance.deleteConversation(conversationId, actor.workspaceId, actor.userId!)) throw new AppError(404, BRAIN_ERRORS.conversationNotFound);
        await this.audit.recordQuietly(entryFor(actor, "assistant.conversation.deleted", "conversation", conversationId));
        return { success: true };
    }
}
