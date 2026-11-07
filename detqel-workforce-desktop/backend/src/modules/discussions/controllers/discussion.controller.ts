import type { FastifyReply, FastifyRequest } from "fastify";
import { requireUserId } from "../../../shared/security/request-context.js";
import { workspaceParamsSchema } from "../../../shared/validation/http.schemas.js";
import type { DiscussionService } from "../services/discussion.service.js";
import {
    addKnowledgeSchema,
    attachConnectorSchema,
    connectorParamsSchema,
    createSessionSchema,
    postMessageSchema,
    sessionIdParamsSchema,
} from "../validation/discussion.schemas.js";

export class DiscussionController {
    constructor(private readonly service: DiscussionService) {}

    async createSession(request: FastifyRequest, reply: FastifyReply) {
        const body = createSessionSchema.parse(request.body);
        const session = await this.service.createSession({
            workspaceId: body.workspaceId,
            title: body.title,
            agentId: body.agentId,
            teamId: body.teamId,
            createdBy: requireUserId(request),
        });
        return reply.status(201).send(session);
    }

    async listSessions(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        return reply.send(await this.service.listSessions(workspaceId));
    }

    async getSession(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId } = sessionIdParamsSchema.parse(request.params);
        return reply.send(await this.service.getSession(workspaceId, sessionId));
    }

    async listMessages(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId } = sessionIdParamsSchema.parse(request.params);
        return reply.send(await this.service.listMessages(workspaceId, sessionId));
    }

    async deleteSession(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId } = sessionIdParamsSchema.parse(request.params);
        await this.service.deleteSession(workspaceId, sessionId);
        return reply.send({ success: true });
    }

    async postMessage(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId } = sessionIdParamsSchema.parse(request.params);
        const body = postMessageSchema.parse(request.body);
        const turn = await this.service.postMessage({ workspaceId, sessionId, ...body });
        return reply.status(201).send(turn);
    }

    async continueTurn(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId } = sessionIdParamsSchema.parse(request.params);
        return reply.send(await this.service.continueTurn(workspaceId, sessionId));
    }

    async attachConnector(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId } = sessionIdParamsSchema.parse(request.params);
        const { connectionId } = attachConnectorSchema.parse(request.body);
        await this.service.attachConnector(workspaceId, sessionId, connectionId);
        return reply.status(201).send({ success: true });
    }

    async detachConnector(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId, connectionId } = connectorParamsSchema.parse(request.params);
        const success = await this.service.detachConnector(workspaceId, sessionId, connectionId);
        return reply.send({ success });
    }

    async listConnectors(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId } = sessionIdParamsSchema.parse(request.params);
        return reply.send(await this.service.listAttachedConnectors(workspaceId, sessionId));
    }

    async addKnowledge(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId } = sessionIdParamsSchema.parse(request.params);
        const body = addKnowledgeSchema.parse(request.body);
        const contents = Buffer.from(body.content, body.encoding);
        const result = await this.service.addKnowledge(workspaceId, sessionId, body.fileName, body.mimeType, contents);
        return reply.status(201).send(result);
    }
}
