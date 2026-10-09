import type { IRepository } from "../../../shared/contracts/repository.js";
import type { NewWorkspace, NewWorkspaceMember, Workspace, WorkspaceMember } from "../../../shared/types/entities.js";
import type { AuthWorkspace, UserWorkspace, WorkspaceOverview } from "../../../shared/types/graphs.js";
export interface IWorkspaceRepository extends IRepository<Workspace, NewWorkspace> {
    findBySlug(slug: string): Promise<Workspace | null>;
    getMembers(workspaceId: string): Promise<Array<{
        id: string;
        role: string;
        status: string;
        joinedAt: Date;
        user: {
            id: string;
            name: string;
            email: string;
            avatarUrl: string | null;
        };
    }>>;
    addMember(data: NewWorkspaceMember): Promise<WorkspaceMember>;
    removeMember(workspaceId: string, userId: string): Promise<boolean>;
    updateMemberRole(workspaceId: string, userId: string, role: string): Promise<WorkspaceMember | null>;
    getWorkspaceOverview(workspaceId: string): Promise<WorkspaceOverview | undefined>;
    deleteWorkspace(workspaceId: string): Promise<boolean>;
    listByUser(userId: string): Promise<UserWorkspace[]>;
    listAuthWorkspaces(userId: string): Promise<AuthWorkspace[]>;
    findDuplicate(name: string, industry: string, ownerId: string | null, excludeId?: string): Promise<Workspace | null>;
}
