import { PAGINATION_LIMITS } from "../../../constants/httpConstants.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { idParamsSchema, workspaceQuerySchema } from "../../../shared/validation/http.schemas.js";
import { actingUser } from "../../../shared/security/request-context.js";
import type { WorkforceService } from "../services/agent.service.js";
import {
    addTeamMemberBodySchema,
    agentMemorySchema,
    connectAgentSchema,
    createAgentSchema,
    createCustomAgentBodySchema,
    createTeamBodySchema,
    listTemplatesQuerySchema,
    recruitedAgentsQuerySchema,
    recruitTemplateBodySchema,
    teamIdParamsSchema,
    teamMemberParamsSchema,
    teamsQuerySchema,
    updateTeamBodySchema,
} from "../validation/agent.schemas.js";

export class WorkforceController {
    constructor(private readonly service: WorkforceService) { }

    async list(request: FastifyRequest, reply: FastifyReply) {
        // Agents are always listed for one workspace the caller belongs to, never across workspaces.
        const { workspaceId } = workspaceQuerySchema.parse(request.query);
        const agents = await this.service.listAgentsForWorkspace(workspaceId);
        return reply.send(agents);
    }

    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = createAgentSchema.parse(request.body);
        const agent = await this.service.create({
            ...body,
            createdBy: actingUser(request, body.createdBy),
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

    // Marketplace Handlers
    async listSections(_request: FastifyRequest, reply: FastifyReply) {
        const sections = await this.service.listMarketplaceSections();
        return reply.send(sections);
    }

    async listTemplates(request: FastifyRequest, reply: FastifyReply) {
        const query = listTemplatesQuerySchema.parse(request.query);
        const templates = await this.service.listMarketplaceTemplates({
            sectionSlug: query.section,
            levelCode: query.level,
            search: query.search,
            limit: query.limit ?? PAGINATION_LIMITS.maximum,
            offset: query.offset,
        });
        return reply.send(templates);
    }

    async getTemplate(request: FastifyRequest, reply: FastifyReply) {
        const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
        const template = await this.service.getMarketplaceTemplate(id);
        if (!template) {
            return reply.status(404).send({ message: "Agent template not found" });
        }
        return reply.send(template);
    }

    async recruitTemplate(request: FastifyRequest, reply: FastifyReply) {
        const body = recruitTemplateBodySchema.parse(request.body);
        const recruited = await this.service.recruitTemplate({ ...body, userId: actingUser(request, body.userId) });
        return reply.status(201).send(recruited);
    }

    async createCustomAgent(request: FastifyRequest, reply: FastifyReply) {
        const body = createCustomAgentBodySchema.parse(request.body);
        const recruited = await this.service.createCustomAgent({ ...body, userId: actingUser(request, body.userId) });
        return reply.status(201).send(recruited);
    }

    async listRecruited(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = recruitedAgentsQuerySchema.parse(request.query);
        const recruited = await this.service.listRecruitedOrganizationAgents(workspaceId);
        return reply.send(recruited);
    }

    async listTeams(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = teamsQuerySchema.parse(request.query);
        const teams = await this.service.listTeams(workspaceId);
        return reply.send(teams);
    }

    async getTeam(request: FastifyRequest, reply: FastifyReply) {
        const { id } = teamIdParamsSchema.parse(request.params);
        const { workspaceId } = teamsQuerySchema.parse(request.query);
        const team = await this.service.getTeamById(id, workspaceId);
        if (!team) {
            return reply.status(404).send({ message: "Team not found" });
        }
        return reply.send(team);
    }

    async createTeam(request: FastifyRequest, reply: FastifyReply) {
        const body = createTeamBodySchema.parse(request.body);
        const team = await this.service.createTeam({ ...body, userId: actingUser(request, body.userId) });
        return reply.status(201).send(team);
    }

    async updateTeam(request: FastifyRequest, reply: FastifyReply) {
        const { id } = teamIdParamsSchema.parse(request.params);
        const { workspaceId } = teamsQuerySchema.parse(request.query);
        const body = updateTeamBodySchema.parse(request.body);
        const team = await this.service.updateTeam(id, workspaceId, body);
        if (!team) {
            return reply.status(404).send({ message: "Team not found" });
        }
        return reply.send(team);
    }

    async deleteTeam(request: FastifyRequest, reply: FastifyReply) {
        const { id } = teamIdParamsSchema.parse(request.params);
        const { workspaceId } = teamsQuerySchema.parse(request.query);
        const success = await this.service.deleteTeam(id, workspaceId);
        if (!success) {
            return reply.status(404).send({ message: "Team not found" });
        }
        return reply.send({ success: true });
    }

    async addTeamMember(request: FastifyRequest, reply: FastifyReply) {
        const { id } = teamIdParamsSchema.parse(request.params);
        const body = addTeamMemberBodySchema.parse(request.body);
        await this.service.addTeamMember(id, body.agentId, body.memberRole, body.isLead, actingUser(request, body.userId));
        return reply.status(201).send({ success: true });
    }

    async removeTeamMember(request: FastifyRequest, reply: FastifyReply) {
        const { id, agentId } = teamMemberParamsSchema.parse(request.params);
        await this.service.removeTeamMember(id, agentId);
        return reply.send({ success: true });
    }
}
