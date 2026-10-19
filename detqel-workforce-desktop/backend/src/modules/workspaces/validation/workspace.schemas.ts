import { z } from "zod";
export const createWorkspaceSchema = z.object({
    name: z.string().trim().min(1).max(255),
    slug: z.string().optional(),
    description: z.string().optional(),
    industry: z.string().trim().max(100).optional(),
    timezone: z.string().default("UTC"),
    logoUrl: z.string().optional(),
    createdBy: z.string().uuid(),
});
export const updateWorkspaceSchema = z.object({
    name: z.string().trim().min(1).max(255).optional(),
    slug: z.string().optional(),
    description: z.string().optional(),
    industry: z.string().trim().max(100).optional(),
    timezone: z.string().optional(),
    logoUrl: z.string().optional(),
    status: z.string().optional(),
});
export const addMemberSchema = z.object({
    userId: z.string().uuid(),
    role: z.enum(["owner", "admin", "manager", "analyst", "employee"]).default("employee"),
});
export const workspaceIdParamSchema = z.object({
    id: z.string().uuid(),
});
export const userWorkspaceParamSchema = z.object({
    userId: z.string().uuid(),
});
export const memberParamSchema = z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
});
