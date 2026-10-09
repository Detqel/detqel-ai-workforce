import type { FastifyReply, FastifyRequest } from "fastify";
import { idParamsSchema, workspaceParamsSchema } from "../../../shared/validation/http.schemas.js";
import type { BusinessService } from "../services/business.service.js";
import { goalSchema, knowledgeSchema, memorySchema, profileSchema, ruleSchema, stateSchema } from "../validation/business.schemas.js";
export class BusinessController {
    constructor(private readonly service: BusinessService) { }
    async getProfile(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const profile = await this.service.getProfile(workspaceId);
        return reply.send(profile || {});
    }
    async upsertProfile(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const body = profileSchema.parse(request.body);
        const profile = await this.service.upsertProfile(workspaceId, body);
        return reply.send(profile);
    }
    async listKnowledge(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const list = await this.service.listKnowledge(workspaceId);
        return reply.send(list);
    }
    async addKnowledge(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const body = knowledgeSchema.parse(request.body);
        const item = await this.service.addKnowledge({
            workspaceId,
            ...body,
            status: "active",
        });
        return reply.status(201).send(item);
    }
    async deleteKnowledge(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const success = await this.service.deleteKnowledge(id);
        return reply.send({ success });
    }
    async listGoals(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const goals = await this.service.listGoals(workspaceId);
        return reply.send(goals);
    }
    async createGoal(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const body = goalSchema.parse(request.body);
        const goal = await this.service.createGoal({
            workspaceId,
            ...body,
            status: "active",
        });
        return reply.status(201).send(goal);
    }
    async listRules(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const rules = await this.service.listRules(workspaceId);
        return reply.send(rules);
    }
    async createRule(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const body = ruleSchema.parse(request.body);
        const rule = await this.service.createRule({
            workspaceId,
            ...body,
            status: "active",
        });
        return reply.status(201).send(rule);
    }
    async getState(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { stateType } = request.query as {
            stateType?: string;
        };
        const state = await this.service.getLatestState(workspaceId, stateType);
        return reply.send(state);
    }
    async recordState(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const body = stateSchema.parse(request.body);
        const state = await this.service.recordState({
            workspaceId,
            ...body,
        });
        return reply.status(201).send(state);
    }
    async listMemories(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const memories = await this.service.listMemories(workspaceId);
        return reply.send(memories);
    }
    async addMemory(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const body = memorySchema.parse(request.body);
        const mem = await this.service.addMemory({
            workspaceId,
            ...body,
        });
        return reply.status(201).send(mem);
    }
}
