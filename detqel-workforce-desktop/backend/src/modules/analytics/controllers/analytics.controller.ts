import type { FastifyReply, FastifyRequest } from "fastify";
import { activityQuerySchema, heatmapQuerySchema, workspaceQuerySchema } from "../../../shared/validation/http.schemas.js";
import type { AnalyticsService } from "../services/analytics.service.js";
import { createPredictionSchema, createSimulationSchema, recordActivitySchema } from "../validation/analytics.schemas.js";
export class AnalyticsController {
    constructor(private readonly service: AnalyticsService) { }
    async listPredictions(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceQuerySchema.parse(request.query);
        const list = await this.service.listPredictions(workspaceId);
        return reply.send(list);
    }
    async createPrediction(request: FastifyRequest, reply: FastifyReply) {
        const body = createPredictionSchema.parse(request.body);
        const prediction = await this.service.createPrediction(body);
        return reply.status(201).send(prediction);
    }
    async listSimulations(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceQuerySchema.parse(request.query);
        const list = await this.service.listSimulations(workspaceId);
        return reply.send(list);
    }
    async createSimulation(request: FastifyRequest, reply: FastifyReply) {
        const body = createSimulationSchema.parse(request.body);
        const simulation = await this.service.createSimulation({
            ...body,
            status: "draft",
        });
        return reply.status(201).send(simulation);
    }
    async getHeatmap(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId, userId, days } = heatmapQuerySchema.parse(request.query);
        const heatmap = await this.service.getHeatmapData(workspaceId, {
            userId,
            days,
        });
        return reply.send(heatmap);
    }
    async listActivities(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId, userId, activityType, limit } = activityQuerySchema.parse(request.query);
        const list = await this.service.listActivities(workspaceId, {
            userId,
            activityType,
            limit,
        });
        return reply.send(list);
    }
    async recordActivity(request: FastifyRequest, reply: FastifyReply) {
        const body = recordActivitySchema.parse(request.body);
        const activity = await this.service.recordActivity(body);
        return reply.status(201).send(activity);
    }
}
