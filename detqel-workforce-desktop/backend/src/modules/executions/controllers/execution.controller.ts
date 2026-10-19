import type { FastifyReply, FastifyRequest } from "fastify";
import { idParamsSchema } from "../../../shared/validation/http.schemas.js";
import type { ExecutionService } from "../services/execution.service.js";
import { createExecutionSchema, updateExecutionSchema } from "../validation/execution.schemas.js";
export class ExecutionController {
    constructor(private readonly service: ExecutionService) { }
    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = createExecutionSchema.parse(request.body);
        const execution = await this.service.createWithEvent(body);
        return reply.status(201).send(execution);
    }
    async updateStatus(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const body = updateExecutionSchema.parse(request.body);
        const updated = await this.service.updateStatusWithEvent(id, body);
        if (!updated)
            return reply.status(404).send({ message: "Execution not found" });
        return reply.send(updated);
    }
}
