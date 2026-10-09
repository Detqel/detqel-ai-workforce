import type { FastifyReply, FastifyRequest } from "fastify";
import { idParamsSchema, workspaceQuerySchema } from "../../../shared/validation/http.schemas.js";
import type { ConnectionService } from "../services/connection.service.js";
import { createConnectionSchema } from "../validation/connection.schemas.js";
export class ConnectionController {
    constructor(private readonly service: ConnectionService) { }
    async list(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceQuerySchema.parse(request.query);
        const list = await this.service.listByWorkspace(workspaceId);
        return reply.send(list);
    }
    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = createConnectionSchema.parse(request.body);
        const conn = await this.service.create({
            ...body,
            status: "pending",
        });
        return reply.status(201).send(conn);
    }
    async getById(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const conn = await this.service.findById(id);
        if (!conn) {
            return reply.status(404).send({ message: "Connection not found" });
        }
        return reply.send(conn);
    }
    async sync(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const updated = await this.service.updateStatus(id, "connected", true);
        return reply.send(updated);
    }
    async delete(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const success = await this.service.delete(id);
        return reply.send({ success });
    }
}
