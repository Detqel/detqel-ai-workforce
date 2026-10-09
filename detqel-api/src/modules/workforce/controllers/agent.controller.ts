import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { idParamsSchema } from "../../../shared/validation/http.schemas.js";
import type { WorkforceService } from "../services/agent.service.js";
import { agentMemorySchema, connectAgentSchema, createAgentSchema } from "../validation/agent.schemas.js";
export class WorkforceController {
    constructor(private readonly service: WorkforceService) { }
    async list(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = z.object({ workspaceId: z.string().uuid().optional() }).parse(request.query);
        if (workspaceId) {
            const agents = await this.service.listAgentsForWorkspace(workspaceId);
            return reply.send(agents);
        }
        const all = await this.service.findMany({ limit: 100 });
        return reply.send(all);
    }
    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = createAgentSchema.parse(request.body);
        const agent = await this.service.create({
            ...body,
            status: "active",
        });
        return reply.status(201).send(agent);
    }
    async getById(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const agent = await this.service.getAgentWithDetails(id);
        if (!agent) {
            return reply.status(404).send({ message: "Agent not found" });
        }
        return reply.send(agent);
    }
    async attachConnection(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const body = connectAgentSchema.parse(request.body);
        const connection = await this.service.attachConnection({
            agentId: id,
            connectionId: body.connectionId,
            permissions: body.permissions,
        });
        return reply.status(201).send(connection);
    }
    async listMemories(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const memories = await this.service.listMemories(id);
        return reply.send(memories);
    }
    async addMemory(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const body = agentMemorySchema.parse(request.body);
        const mem = await this.service.addMemory({
            agentId: id,
            ...body,
        });
        return reply.status(201).send(mem);
    }
}
