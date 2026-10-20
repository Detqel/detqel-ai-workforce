import type { FastifyReply, FastifyRequest } from "fastify";
import { idParamsSchema, workspaceQuerySchema } from "../../../shared/validation/http.schemas.js";
import type { ConnectionAccessService } from "../services/connection-access.service.js";
import type { ConnectionService } from "../services/connection.service.js";
import { catalogQuerySchema, createConnectionSchema, testConnectionSchema, updateConnectionSchema } from "../validation/connection.schemas.js";

export class ConnectionController {
    constructor(private readonly service: ConnectionService, private readonly access: ConnectionAccessService) {}

    private async workspace(request: FastifyRequest, mutation: boolean): Promise<string> {
        const { workspaceId } = workspaceQuerySchema.parse(request.query);
        await this.access.authorize(request.headers.authorization, workspaceId, mutation);
        return workspaceId;
    }

    async catalog(request: FastifyRequest, reply: FastifyReply) {
        const query = catalogQuerySchema.parse(request.query);
        await this.access.authorize(request.headers.authorization, query.workspaceId, false);
        return reply.send(await this.service.listCatalog(query.connectorType, query.category));
    }

    async catalogById(request: FastifyRequest, reply: FastifyReply) {
        await this.workspace(request, false);
        const { id } = idParamsSchema.parse(request.params);
        return reply.send(await this.service.getCatalog(id));
    }

    async list(request: FastifyRequest, reply: FastifyReply) {
        const workspaceId = await this.workspace(request, false);
        return reply.send(await this.service.listByWorkspace(workspaceId));
    }

    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = createConnectionSchema.parse(request.body);
        await this.access.authorize(request.headers.authorization, body.workspaceId, true);
        return reply.status(201).send(await this.service.create(body));
    }

    async test(request: FastifyRequest, reply: FastifyReply) {
        const body = testConnectionSchema.parse(request.body);
        await this.access.authorize(request.headers.authorization, body.workspaceId, true);
        return reply.send(await this.service.verify(body));
    }

    async getById(request: FastifyRequest, reply: FastifyReply) {
        const workspaceId = await this.workspace(request, false);
        const { id } = idParamsSchema.parse(request.params);
        return reply.send(await this.service.findById(id, workspaceId));
    }

    async update(request: FastifyRequest, reply: FastifyReply) {
        const workspaceId = await this.workspace(request, true);
        const { id } = idParamsSchema.parse(request.params);
        return reply.send(await this.service.update(id, workspaceId, updateConnectionSchema.parse(request.body)));
    }

    async reconnect(request: FastifyRequest, reply: FastifyReply) {
        const workspaceId = await this.workspace(request, true);
        const { id } = idParamsSchema.parse(request.params);
        return reply.send(await this.service.reconnect(id, workspaceId));
    }

    async disconnect(request: FastifyRequest, reply: FastifyReply) {
        const workspaceId = await this.workspace(request, true);
        const { id } = idParamsSchema.parse(request.params);
        return reply.send(await this.service.disconnect(id, workspaceId));
    }

    async delete(request: FastifyRequest, reply: FastifyReply) {
        const workspaceId = await this.workspace(request, true);
        const { id } = idParamsSchema.parse(request.params);
        return reply.send(await this.service.delete(id, workspaceId));
    }
}

