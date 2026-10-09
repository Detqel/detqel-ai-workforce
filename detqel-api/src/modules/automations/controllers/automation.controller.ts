import type { FastifyReply, FastifyRequest } from "fastify";
import { idParamsSchema, workspaceQuerySchema } from "../../../shared/validation/http.schemas.js";
import type { AutomationService } from "../services/automation.service.js";
import { createAutomationSchema, createScheduledTaskSchema, triggerRunSchema } from "../validation/automation.schemas.js";
export class AutomationController {
    constructor(private readonly service: AutomationService) { }
    async list(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceQuerySchema.parse(request.query);
        const list = await this.service.listAutomations(workspaceId);
        return reply.send(list);
    }
    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = createAutomationSchema.parse(request.body);
        const automation = await this.service.createAutomation({
            ...body,
            status: "active",
        });
        return reply.status(201).send(automation);
    }
    async trigger(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const body = triggerRunSchema.parse(request.body);
        const run = await this.service.recordRun({
            automationId: id,
            missionId: body.missionId,
            triggerData: body.triggerData,
            status: "running",
        });
        return reply.status(201).send(run);
    }
    async listRuns(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const runs = await this.service.listRuns(id);
        return reply.send(runs);
    }
    async listTasks(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceQuerySchema.parse(request.query);
        const tasks = await this.service.listTasks(workspaceId);
        return reply.send(tasks);
    }
    async createTask(request: FastifyRequest, reply: FastifyReply) {
        const body = createScheduledTaskSchema.parse(request.body);
        const task = await this.service.createTask({
            ...body,
            status: "active",
        });
        return reply.status(201).send(task);
    }
}
