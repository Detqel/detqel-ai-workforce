import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { idParamsSchema } from "../../../shared/validation/http.schemas.js";
import type { ApprovalService } from "../services/approval.service.js";
import { createApprovalSchema, reviewApprovalSchema } from "../validation/approval.schemas.js";
export class ApprovalController {
    constructor(private readonly service: ApprovalService) { }
    async list(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId, status } = z.object({ workspaceId: z.string().uuid(), status: z.string().optional() }).parse(request.query);
        const list = await this.service.listApprovals(workspaceId, status);
        return reply.send(list);
    }
    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = createApprovalSchema.parse(request.body);
        const approval = await this.service.createWithEvent(body);
        return reply.status(201).send(approval);
    }
    async review(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const { userId, status } = reviewApprovalSchema.parse(request.body);
        const reviewed = await this.service.reviewWithEvent(id, userId, status);
        if (!reviewed)
            return reply.status(404).send({ message: "Approval request not found" });
        return reply.send(reviewed);
    }
}
