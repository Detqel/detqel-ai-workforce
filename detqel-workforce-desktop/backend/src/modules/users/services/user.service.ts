import type { NewUser, User } from "../../../shared/types/entities.js";
import type { IUserRepository } from "../../users/repositories/user.repository.js";
import type { IWorkspaceRepository } from "../../workspaces/repositories/workspace.repository.js";

/** The only user fields that may leave the server. Credentials and internal timestamps are excluded by construction. */
export interface UserProfile {
    id: string;
    name: string;
    email: string;
    username: string | null;
    avatarUrl: string | null;
    status: string;
}
export function toUserProfile(user: User): UserProfile {
    return { id: user.id, name: user.name, email: user.email, username: user.username, avatarUrl: user.avatarUrl, status: user.status };
}

export class UserService {
    constructor(private readonly repository: IUserRepository, private readonly workspaces: IWorkspaceRepository) { }
    findByEmail(email: string): Promise<User | null> { return this.repository.findByEmail(email); }

    /** Ids of every active member of every workspace the user belongs to, including the user. */
    private async visibleUserIds(userId: string): Promise<Set<string>> {
        const visible = new Set<string>([userId]);
        for (const workspace of await this.workspaces.listAuthWorkspaces(userId)) {
            if (workspace.status !== "active") continue;
            for (const member of await this.workspaces.getMembers(workspace.id)) if (member.status === "active") visible.add(member.user.id);
        }
        return visible;
    }

    /** People the user works with. Users who share no workspace with them are not listed. */
    async listVisibleTo(userId: string): Promise<UserProfile[]> {
        const visible = await this.visibleUserIds(userId);
        const profiles: UserProfile[] = [];
        for (const id of visible) {
            const user = await this.repository.findById(id);
            if (user) profiles.push(toUserProfile(user));
        }
        return profiles.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * A user's own profile includes their workspace memberships; another user's profile is just the safe fields,
     * and only for people who share a workspace. Anyone else is reported as not found.
     */
    async getVisibleTo(requesterId: string, targetId: string) {
        if (requesterId === targetId) {
            const own = await this.repository.findWithMemberships(targetId);
            if (!own) return undefined;
            const { memberships, ...user } = own;
            return { ...toUserProfile(user), memberships };
        }
        if (!(await this.visibleUserIds(requesterId)).has(targetId)) return undefined;
        const other = await this.repository.findById(targetId);
        return other ? toUserProfile(other) : undefined;
    }

    async create(data: NewUser): Promise<UserProfile> { return toUserProfile(await this.repository.create(data)); }
}
