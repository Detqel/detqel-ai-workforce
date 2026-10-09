import { and, eq, ne, sql } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import { BaseRepository } from "../../../infrastructure/database/repositories/base.repository.js";
import { workspaceMembers, workspaces, type NewWorkspace, type NewWorkspaceMember, type Workspace, type WorkspaceMember, } from "../../../infrastructure/database/schema/auth.js";
import type { AuthWorkspace, UserWorkspace } from "../../../shared/types/graphs.js";
import type { IWorkspaceRepository } from "./workspace.repository.js";
export class WorkspaceRepository extends BaseRepository<typeof workspaces, Workspace, NewWorkspace> implements IWorkspaceRepository {
    constructor(database: DatabaseSession) {
        super(workspaces, database);
    }
    async findBySlug(slug: string): Promise<Workspace | null> {
        const results = await this.database
            .select()
            .from(workspaces)
            .where(eq(workspaces.slug, slug))
            .limit(1);
        return results[0] || null;
    }
    async getMembers(workspaceId: string): Promise<Array<{
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
    }>> {
        const members = await this.database.query.workspaceMembers.findMany({
            where: eq(workspaceMembers.workspaceId, workspaceId),
            with: {
                user: {
                    columns: {
                        id: true,
                        name: true,
                        email: true,
                        avatarUrl: true,
                    },
                },
            },
        });
        return members;
    }
    async addMember(data: NewWorkspaceMember): Promise<WorkspaceMember> {
        const [member] = await this.database
            .insert(workspaceMembers)
            .values(data)
            .returning();
        return member;
    }
    async removeMember(workspaceId: string, userId: string): Promise<boolean> {
        const result = await this.database
            .delete(workspaceMembers)
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
            .returning();
        return result.length > 0;
    }
    async updateMemberRole(workspaceId: string, userId: string, role: string): Promise<WorkspaceMember | null> {
        const [updated] = await this.database
            .update(workspaceMembers)
            .set({ role })
            .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
            .returning();
        return updated || null;
    }
    async getWorkspaceOverview(workspaceId: string) {
        return this.database.query.workspaces.findFirst({
            where: eq(workspaces.id, workspaceId),
            with: {
                businessProfile: true,
                members: {
                    with: {
                        user: true,
                    },
                },
            },
        });
    }
    async deleteWorkspace(workspaceId: string): Promise<boolean> {
        const deleted = await this.database
            .delete(workspaces)
            .where(eq(workspaces.id, workspaceId))
            .returning();
        return deleted.length > 0;
    }
    async listByUser(userId: string): Promise<UserWorkspace[]> {
        const memberRows = await this.database
            .select({
            id: workspaces.id,
            name: workspaces.name,
            slug: workspaces.slug,
            industry: workspaces.industry,
            description: workspaces.description,
            timezone: workspaces.timezone,
            logoUrl: workspaces.logoUrl,
            status: workspaces.status,
            role: workspaceMembers.role,
            joinedAt: workspaceMembers.joinedAt,
        })
            .from(workspaceMembers)
            .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
            .where(eq(workspaceMembers.userId, userId));
        return memberRows;
    }
    async listAuthWorkspaces(userId: string): Promise<AuthWorkspace[]> {
        const memberRows = await this.database
            .select({
            id: workspaces.id,
            name: workspaces.name,
            slug: workspaces.slug,
            industry: workspaces.industry,
            description: workspaces.description,
            role: workspaceMembers.role,
            status: workspaceMembers.status,
        })
            .from(workspaceMembers)
            .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
            .where(eq(workspaceMembers.userId, userId));
        const createdRows = await this.database
            .select({
            id: workspaces.id,
            name: workspaces.name,
            slug: workspaces.slug,
            industry: workspaces.industry,
            description: workspaces.description,
        })
            .from(workspaces)
            .where(eq(workspaces.createdBy, userId));
        const map = new Map<string, AuthWorkspace>();
        for (const row of memberRows) {
            map.set(row.id, row);
        }
        for (const row of createdRows) {
            if (!map.has(row.id)) {
                map.set(row.id, {
                    ...row,
                    role: "owner",
                    status: "active",
                });
            }
        }
        return Array.from(map.values());
    }
    async findDuplicate(name: string, industry: string, ownerId: string | null, excludeId?: string): Promise<Workspace | null> {
        const conditions = [sql `lower(trim(${workspaces.name})) = lower(trim(${name}))`, sql `lower(trim(coalesce(${workspaces.industry}, ''))) = lower(trim(${industry}))`];
        conditions.push(sql`${workspaces.createdBy} IS NOT DISTINCT FROM ${ownerId}::uuid`);
        if (excludeId)
            conditions.push(ne(workspaces.id, excludeId));
        const [workspace] = await this.database.select().from(workspaces).where(and(...conditions)).limit(1);
        return workspace ?? null;
    }
}
