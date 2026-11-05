import type { FastifyReply, FastifyRequest } from "fastify";
import { idParamsSchema, workspaceQuerySchema } from "../../../shared/validation/http.schemas.js";
import { requireUserId } from "../../../shared/security/request-context.js";
import type { WorkspaceAccess, WorkspaceAccessService } from "../../workspaces/services/workspace-access.service.js";
import type { ConnectionService } from "../services/connection.service.js";
import { catalogQuerySchema, createConnectionSchema, testConnectionSchema, updateConnectionSchema } from "../validation/connection.schemas.js";
export class ConnectionController {
    constructor(private readonly service: ConnectionService, private readonly access: WorkspaceAccessService) {}
    private async authorize(request: FastifyRequest, workspaceId: string, access: WorkspaceAccess): Promise<void> {
        await this.access.authorize(requireUserId(request), workspaceId, access);
    }
    private async workspace(request: FastifyRequest, access: WorkspaceAccess): Promise<string> {
        const { workspaceId } = workspaceQuerySchema.parse(request.query);
        await this.authorize(request, workspaceId, access);
        return workspaceId;
    }
    async catalog(request: FastifyRequest, reply: FastifyReply) {
        const query = catalogQuerySchema.parse(request.query);
        await this.authorize(request, query.workspaceId, "read");
        return reply.send(await this.service.listCatalog(query.connectorType, query.category));
    }
    async catalogById(request: FastifyRequest, reply: FastifyReply) {
        await this.workspace(request, "read");
        const { id } = idParamsSchema.parse(request.params);
        return reply.send(await this.service.getCatalog(id));
    }
    async list(request: FastifyRequest, reply: FastifyReply) {
        const workspaceId = await this.workspace(request, "read");
        return reply.send(await this.service.listByWorkspace(workspaceId));
    }
    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = createConnectionSchema.parse(request.body);
        await this.authorize(request, body.workspaceId, "manage");
        return reply.status(201).send(await this.service.create(body));
    }
    async test(request: FastifyRequest, reply: FastifyReply) {
        const body = testConnectionSchema.parse(request.body);
        await this.authorize(request, body.workspaceId, "manage");
        return reply.send(await this.service.verify(body));
    }
    async getById(request: FastifyRequest, reply: FastifyReply) {
        const workspaceId = await this.workspace(request, "read");
        const { id } = idParamsSchema.parse(request.params);
        return reply.send(await this.service.findById(id, workspaceId));
    }
    async update(request: FastifyRequest, reply: FastifyReply) {
        const workspaceId = await this.workspace(request, "manage");
        const { id } = idParamsSchema.parse(request.params);
        return reply.send(await this.service.update(id, workspaceId, updateConnectionSchema.parse(request.body)));
    }
    async reconnect(request: FastifyRequest, reply: FastifyReply) {
        const workspaceId = await this.workspace(request, "manage");
        const { id } = idParamsSchema.parse(request.params);
        return reply.send(await this.service.reconnect(id, workspaceId));
    }
    async disconnect(request: FastifyRequest, reply: FastifyReply) {
        const workspaceId = await this.workspace(request, "manage");
        const { id } = idParamsSchema.parse(request.params);
        return reply.send(await this.service.disconnect(id, workspaceId));
    }
    async delete(request: FastifyRequest, reply: FastifyReply) {
        const workspaceId = await this.workspace(request, "manage");
        const { id } = idParamsSchema.parse(request.params);
        return reply.send(await this.service.delete(id, workspaceId));
    }
}
