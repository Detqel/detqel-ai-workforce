import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { idParamsSchema } from "../../../shared/validation/http.schemas.js";
import type { MissionService } from "../services/mission.service.js";
import { addSourceSchema, createMissionSchema, logEventSchema, updateStatusSchema } from "../validation/mission.schemas.js";
export class MissionController {
    constructor(private readonly service: MissionService) { }
    async list(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId, status } = z.object({ workspaceId: z.string().uuid(), status: z.string().optional() }).parse(request.query);
        const list = await this.service.listByWorkspace(workspaceId, status);
        return reply.send(list);
    }
    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = createMissionSchema.parse(request.body);
        const { assignedAgents, ...missionData } = body;
        const mission = await this.service.createWithEvent(missionData, assignedAgents);
        return reply.status(201).send(mission);
    }
    async getById(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const details = await this.service.getMissionWithDetails(id);
        if (!details) {
            return reply.status(404).send({ message: "Mission not found" });
        }
        return reply.send(details);
    }
    async updateStatus(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const { status } = updateStatusSchema.parse(request.body);
        const updated = await this.service.updateStatusWithEvent(id, status);
        if (!updated)
            return reply.status(404).send({ message: "Mission not found" });
        return reply.send(updated);
    }
    async logEvent(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const body = logEventSchema.parse(request.body);
        const event = await this.service.logEvent({
            missionId: id,
            ...body,
        });
        return reply.status(201).send(event);
    }
    async addSource(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const body = addSourceSchema.parse(request.body);
        const source = await this.service.addSource({
            missionId: id,
            ...body,
        });
        return reply.status(201).send(source);
    }
}
