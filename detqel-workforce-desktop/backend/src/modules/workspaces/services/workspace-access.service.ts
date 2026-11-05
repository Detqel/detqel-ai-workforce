import { AppError } from "../../../shared/errors/app-error.js";
import type { SessionService } from "../../../shared/security/session.js";
import type { IUserRepository } from "../../users/repositories/user.repository.js";
import type { IWorkspaceRepository } from "../repositories/workspace.repository.js";

/**
 * What a caller needs to do in a workspace. Each level includes the roles of the levels below it:
 * read: any active member, write: owner/admin/manager, manage: owner/admin, owner: the workspace owner.
 */
export type WorkspaceAccess = "read" | "write" | "manage" | "owner";

const ROLES_BY_ACCESS: Record<WorkspaceAccess, readonly string[]> = {
    read: ["owner", "admin", "manager", "analyst", "employee"],
    write: ["owner", "admin", "manager"],
    manage: ["owner", "admin"],
    owner: ["owner"],
};
const ACCESS_DENIED: Record<WorkspaceAccess, string> = {
    read: "You do not have access to this workspace",
    write: "Workspace owner, administrator or manager access is required",
    manage: "Workspace owner or administrator access is required",
    owner: "Only the workspace owner can do this",
};

export class WorkspaceAccessService {
    constructor(private readonly sessions: SessionService, private readonly users: IUserRepository, private readonly workspaces: IWorkspaceRepository) {}

    /** Verifies the bearer token and that its user still exists and is active. */
    async authenticate(authorization: string | undefined): Promise<string> {
        const userId = this.sessions.verify(authorization);
        const user = await this.users.findById(userId);
        if (!user || user.status !== "active") throw new AppError(401, "An active user session is required");
        return userId;
    }

    /** The caller's role in the workspace, or null when they are not an active member. The creator is always the owner. */
    async roleOf(userId: string, workspaceId: string): Promise<string | null> {
        const workspace = await this.workspaces.findById(workspaceId);
        if (!workspace || workspace.status !== "active") throw new AppError(404, "Workspace not found");
        if (workspace.createdBy === userId) return "owner";
        const member = (await this.workspaces.getMembers(workspaceId)).find(item => item.user.id === userId && item.status === "active");
        return member?.role ?? null;
    }

    async authorize(userId: string, workspaceId: string, access: WorkspaceAccess): Promise<void> {
        const role = await this.roleOf(userId, workspaceId);
        if (role === null) throw new AppError(403, ACCESS_DENIED.read);
        if (!ROLES_BY_ACCESS[access].includes(role)) throw new AppError(403, ACCESS_DENIED[access]);
    }

    /**
     * Provider credentials are shared by the whole installation, so changing or using them is limited to people
     * who administer at least one workspace.
     */
    async requireAdministrator(userId: string): Promise<void> {
        const memberships = await this.workspaces.listAuthWorkspaces(userId);
        if (!memberships.some(item => item.status === "active" && ROLES_BY_ACCESS.manage.includes(item.role))) {
            throw new AppError(403, "Workspace owner or administrator access is required");
        }
    }
}
