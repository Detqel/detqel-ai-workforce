import { AppError } from "../../../shared/errors/app-error.js";
import type { SessionService } from "../../../shared/security/session.js";
import type { IUserRepository } from "../../users/repositories/user.repository.js";
import type { IWorkspaceRepository } from "../../workspaces/repositories/workspace.repository.js";

export class ConnectionAccessService {
    constructor(private readonly sessions: SessionService, private readonly users: IUserRepository, private readonly workspaces: IWorkspaceRepository) {}

    async authorize(authorization: string | undefined, workspaceId: string, mutation: boolean): Promise<string> {
        const userId = this.sessions.verify(authorization);
        const user = await this.users.findById(userId);
        if (!user || user.status !== "active") throw new AppError(401, "An active user session is required");
        const workspace = await this.workspaces.findById(workspaceId);
        if (!workspace || workspace.status !== "active") throw new AppError(404, "Workspace not found");
        if (workspace.createdBy === userId) return userId;
        const members = await this.workspaces.getMembers(workspaceId);
        const member = members.find(item => item.user.id === userId && item.status === "active");
        if (!member) throw new AppError(403, "You do not have access to this workspace");
        if (mutation && !["owner", "admin"].includes(member.role)) throw new AppError(403, "Workspace owner or administrator access is required");
        return userId;
    }
}
