import type { FastifyReply, FastifyRequest } from "fastify";
import type { WorkspaceService } from "../services/workspace.service.js";
import { addMemberSchema, createWorkspaceSchema, memberParamSchema, updateWorkspaceSchema, userWorkspaceParamSchema, workspaceIdParamSchema } from "../validation/workspace.schemas.js";
export class WorkspaceController {
    constructor(private readonly service: WorkspaceService) { }
    async listAll(_request: FastifyRequest, reply: FastifyReply) {
        const list = await this.service.listAllWorkspaces();
        return reply.send(list);
    }
    async listByUser(request: FastifyRequest, reply: FastifyReply) {
        const { userId } = userWorkspaceParamSchema.parse(request.params);
        const workspaces = await this.service.listUserWorkspaces(userId);
        return reply.send(workspaces);
    }
    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = createWorkspaceSchema.parse(request.body);
        const workspace = await this.service.createWorkspace(body);
        return reply.status(201).send(workspace);
    }
    async update(request: FastifyRequest, reply: FastifyReply) {
        const { id } = workspaceIdParamSchema.parse(request.params);
        const body = updateWorkspaceSchema.parse(request.body);
        const updated = await this.service.updateWorkspace(id, body);
        return reply.send(updated);
    }
    async getOverview(request: FastifyRequest, reply: FastifyReply) {
        const { id } = workspaceIdParamSchema.parse(request.params);
        const workspace = await this.service.getWorkspaceOverview(id);
        if (!workspace) {
            return reply.status(404).send({ message: "Workspace not found" });
        }
        return reply.send(workspace);
    }
    async delete(request: FastifyRequest, reply: FastifyReply) {
        const { id } = workspaceIdParamSchema.parse(request.params);
        const result = await this.service.deleteWorkspace(id);
        return reply.send({
            success: true,
            message: "Workspace deleted successfully",
            id: result.id,
        });
    }
    async getMembers(request: FastifyRequest, reply: FastifyReply) {
        const { id } = workspaceIdParamSchema.parse(request.params);
        const members = await this.service.getMembers(id);
        return reply.send(members);
    }
    async addMember(request: FastifyRequest, reply: FastifyReply) {
        const { id } = workspaceIdParamSchema.parse(request.params);
        const body = addMemberSchema.parse(request.body);
        const member = await this.service.addMember(id, body);
        return reply.status(201).send(member);
    }
    async removeMember(request: FastifyRequest, reply: FastifyReply) {
        const { id, userId } = memberParamSchema.parse(request.params);
        const success = await this.service.removeMember(id, userId);
        return reply.send({ success });
    }
}
