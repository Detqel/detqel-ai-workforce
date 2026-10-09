import type { IUnitOfWork } from "../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../shared/errors/app-error.js";
export interface CreateWorkspaceDTO {
    name: string;
    slug?: string;
    description?: string;
    industry?: string;
    timezone?: string;
    logoUrl?: string;
    createdBy: string;
}
export interface UpdateWorkspaceDTO {
    name?: string;
    slug?: string;
    description?: string;
    industry?: string;
    timezone?: string;
    logoUrl?: string;
    status?: string;
}
export interface AddMemberDTO {
    userId: string;
    role: "owner" | "admin" | "manager" | "analyst" | "employee";
}
export class WorkspaceService {
    constructor(private readonly dbCtx: IUnitOfWork) { }
    /**
     * List all workspaces (system/admin view)
     */
    async listAllWorkspaces() {
        return this.dbCtx.workspaces.findMany({ limit: 100 });
    }
    /**
     * List workspaces belonging to a user through workspace membership
     */
    async listUserWorkspaces(userId: string) {
        return this.dbCtx.workspaces.listByUser(userId);
    }
    /**
     * Create a new workspace, auto-generate slug, assign owner role, and seed business profile
     */
    async createWorkspace(dto: CreateWorkspaceDTO) {
        return this.dbCtx.transaction(repositories => new WorkspaceService(repositories).createInTransaction(dto));
    }
    private async createInTransaction(dto: CreateWorkspaceDTO) {
        const trimmedName = dto.name.trim();
        const trimmedIndustry = (dto.industry || "").trim();
        const creator = await this.dbCtx.users.findById(dto.createdBy);
        if (!creator) throw new AppError(404, "Workspace creator not found");
        const creatorId = creator.id;
        // Check for duplicate workspace with same name and same domain
        if (await this.dbCtx.workspaces.findDuplicate(trimmedName, trimmedIndustry, creatorId)) {
            throw new AppError(409, `A workspace with the name "${trimmedName}" and domain "${trimmedIndustry}" already exists. Please choose a different name or domain.`);
        }
        // Ensure custom domain is stored in database table
        if (trimmedIndustry) {
            await this.dbCtx.domains.ensureDomain(trimmedIndustry, true);
        }
        let baseSlug = (dto.slug || trimmedName)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
        if (!baseSlug)
            baseSlug = "workspace";
        let finalSlug = baseSlug;
        const existing = await this.dbCtx.workspaces.findBySlug(finalSlug);
        if (existing) {
            finalSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
        }
        const created = await this.dbCtx.workspaces.create({
            name: trimmedName,
            slug: finalSlug,
            description: dto.description || null,
            industry: trimmedIndustry || null,
            timezone: dto.timezone || "UTC",
            logoUrl: dto.logoUrl || null,
            status: "active",
            createdBy: creatorId,
        });
        if (creatorId) {
            await this.dbCtx.workspaces.addMember({
                workspaceId: created.id,
                userId: creatorId,
                role: "owner",
                status: "active",
            });
        }
        // Seed default business profile
        await this.dbCtx.business.upsertProfile(created.id, {
            businessName: dto.name,
            industry: dto.industry || "General Enterprise",
            description: dto.description || `${dto.name} operational workspace.`,
            productsServices: [],
            customers: [],
            departments: ["Management", "Operations"],
            locations: ["HQ"],
        });
        return {
            ...created,
            role: "owner",
        };
    }
    /**
     * Update workspace details and synchronize linked business profile
     */
    async updateWorkspace(id: string, dto: UpdateWorkspaceDTO) {
        return this.dbCtx.transaction(repositories => new WorkspaceService(repositories).updateInTransaction(id, dto));
    }
    private async updateInTransaction(id: string, dto: UpdateWorkspaceDTO) {
        const existing = await this.dbCtx.workspaces.findById(id);
        if (!existing) {
            throw new AppError(404, "Workspace not found");
        }
        const targetName = (dto.name ?? existing.name).trim();
        const targetIndustry = (dto.industry !== undefined ? dto.industry : existing.industry || "").trim();
        const isNameChanged = dto.name !== undefined &&
            targetName.toLowerCase() !== existing.name.trim().toLowerCase();
        const isIndustryChanged = dto.industry !== undefined &&
            targetIndustry.toLowerCase() !== (existing.industry || "").trim().toLowerCase();
        // Only validate duplicate collision if the name or industry was actually modified
        if (isNameChanged || isIndustryChanged) {
            if (await this.dbCtx.workspaces.findDuplicate(targetName, targetIndustry, existing.createdBy, id)) {
                throw new AppError(409, `A workspace with the name "${targetName}" and domain "${targetIndustry}" already exists. Please choose a different name or domain.`);
            }
        }
        // Ensure custom domain is stored in database table
        if (targetIndustry) {
            await this.dbCtx.domains.ensureDomain(targetIndustry, true);
        }
        let finalSlug: string | undefined;
        if (dto.slug && dto.slug !== existing.slug) {
            const existingSlug = await this.dbCtx.workspaces.findBySlug(dto.slug);
            if (existingSlug && existingSlug.id !== id) {
                finalSlug = `${dto.slug}-${Math.random().toString(36).substring(2, 6)}`;
            }
            else {
                finalSlug = dto.slug;
            }
        }
        const updated = await this.dbCtx.workspaces.update(id, {
            ...(dto.name ? { name: dto.name } : {}),
            ...(finalSlug ? { slug: finalSlug } : {}),
            ...(dto.industry !== undefined ? { industry: dto.industry } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.timezone ? { timezone: dto.timezone } : {}),
            ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
            ...(dto.status ? { status: dto.status } : {}),
        });
        if (!updated) throw new AppError(404, "Workspace not found");
        if (dto.name || dto.industry !== undefined || dto.description !== undefined) {
            await this.dbCtx.business.upsertProfile(id, {
                businessName: dto.name || existing.name,
                ...(dto.industry !== undefined ? { industry: dto.industry } : {}),
                ...(dto.description !== undefined ? { description: dto.description } : {}),
            });
        }
        return {
            ...updated,
            role: "owner",
        };
    }
    /**
     * Get workspace overview with members and business profile
     */
    async getWorkspaceOverview(id: string) {
        return this.dbCtx.workspaces.getWorkspaceOverview(id);
    }
    /**
     * Permanently delete a workspace and cascade all linked entities
     */
    async deleteWorkspace(workspaceId: string): Promise<{
        success: boolean;
        id: string;
    }> {
        const existing = await this.dbCtx.workspaces.findById(workspaceId);
        if (!existing) {
            throw new AppError(404, "Workspace not found");
        }
        const deleted = await this.dbCtx.workspaces.deleteWorkspace(workspaceId);
        if (!deleted) {
            throw new AppError(500, "Failed to delete workspace");
        }
        return { success: true, id: workspaceId };
    }
    /**
     * List members of a workspace
     */
    async getMembers(workspaceId: string) {
        return this.dbCtx.workspaces.getMembers(workspaceId);
    }
    /**
     * Add a member to a workspace
     */
    async addMember(workspaceId: string, dto: AddMemberDTO) {
        return this.dbCtx.workspaces.addMember({
            workspaceId,
            userId: dto.userId,
            role: dto.role,
            status: "active",
        });
    }
    /**
     * Remove a member from a workspace
     */
    async removeMember(workspaceId: string, userId: string) {
        return this.dbCtx.workspaces.removeMember(workspaceId, userId);
    }
}
