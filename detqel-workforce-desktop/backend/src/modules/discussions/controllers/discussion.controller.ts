import type { FastifyReply, FastifyRequest } from "fastify";
import { requireUserId } from "../../../shared/security/request-context.js";
import { workspaceParamsSchema } from "../../../shared/validation/http.schemas.js";
import type { DiscussionService } from "../services/discussion.service.js";
import { sendEventStream } from "../../../shared/http/event-stream.js";
import {
    addKnowledgeSchema,
    artifactParamsSchema,
    attachConnectorSchema,
    connectorParamsSchema,
    createSessionSchema,
    exportSchema,
    messageParamsSchema,
    postMessageSchema,
    renameSessionSchema,
    sessionIdParamsSchema,
    uploadArtifactSchema,
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

    /** Saves the message, then streams the turn: who speaks, each step they take, and their reply as written. */
    async postMessage(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId } = sessionIdParamsSchema.parse(request.params);
        const body = postMessageSchema.parse(request.body);
        // Problems the user must fix (no model, no web-search key) fail here as an ordinary error response.
        const turn = await this.service.startMessage({ workspaceId, sessionId, ...body });
        return sendEventStream(reply, (emit, signal) => turn.run(emit, signal));
    }

    /** Streams the rest of a turn the user left before every speaker replied. */
    async continueTurn(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId } = sessionIdParamsSchema.parse(request.params);
        const turn = await this.service.startContinue(workspaceId, sessionId);
        return sendEventStream(reply, (emit, signal) => turn.run(emit, signal));
    }

    async renameSession(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId } = sessionIdParamsSchema.parse(request.params);
        const { title } = renameSessionSchema.parse(request.body);
        return reply.send(await this.service.renameSession(workspaceId, sessionId, title));
    }

    async exportMessage(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId, messageId } = messageParamsSchema.parse(request.params);
        const { format } = exportSchema.parse(request.body);
        return reply.status(201).send(await this.service.exportMessage(workspaceId, sessionId, messageId, format));
    }

    async listArtifacts(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId } = sessionIdParamsSchema.parse(request.params);
        return reply.send(await this.service.listArtifacts(workspaceId, sessionId));
    }

    async uploadArtifact(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId } = sessionIdParamsSchema.parse(request.params);
        const body = uploadArtifactSchema.parse(request.body);
        const artifact = await this.service.uploadArtifact(workspaceId, sessionId, body.fileName, body.mimeType, Buffer.from(body.contentBase64, "base64"));
        return reply.status(201).send(artifact);
    }

    async downloadArtifact(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId, fileName } = artifactParamsSchema.parse(request.params);
        return reply.send(await this.service.downloadArtifact(workspaceId, sessionId, fileName));
    }

    async deleteArtifact(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId, fileName } = artifactParamsSchema.parse(request.params);
        return reply.send({ success: await this.service.deleteArtifact(workspaceId, sessionId, fileName) });
    }

    async exportArtifact(request: FastifyRequest, reply: FastifyReply) {
        const { workspaceId } = workspaceParamsSchema.parse(request.params);
        const { sessionId, fileName } = artifactParamsSchema.parse(request.params);
        const { format } = exportSchema.parse(request.body);
        return reply.status(201).send(await this.service.exportArtifact(workspaceId, sessionId, fileName, format));
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
