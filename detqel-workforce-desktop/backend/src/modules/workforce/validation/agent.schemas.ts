import { z } from "zod";
export const createAgentSchema = z.object({
    workspaceId: z.string().uuid().optional(),
    name: z.string().min(1),
    description: z.string().min(1),
    purpose: z.string().min(1),
    instructions: z.string().min(1),
    agentType: z.enum(["platform", "custom", "marketplace"]).default("custom"),
    scope: z.record(z.unknown()).default({}),
    capabilities: z.array(z.unknown()).default([]),
    approvalPolicy: z.record(z.unknown()).default({}),
    createdBy: z.string().uuid().optional(),
});
export const connectAgentSchema = z.object({
    connectionId: z.string().uuid(),
    permissions: z.record(z.unknown()).default({}),
});
export const agentMemorySchema = z.object({
    memoryType: z.enum(["fact", "context", "lesson", "preference", "interaction"]),
    content: z.string().min(1),
    sourceReference: z.string().optional(),
    importance: z.enum(["low", "medium", "high"]).default("medium"),
});
export const listTemplatesQuerySchema = z.object({
    section: z.string().optional(),
    level: z.string().optional(),
    search: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    offset: z.coerce.number().int().min(0).optional(),
});
export const recruitTemplateBodySchema = z.object({
    workspaceId: z.string().uuid(),
    templateId: z.string().min(1),
    customName: z.string().min(1).optional(),
    customRole: z.string().min(1).optional(),
    customInstructions: z.string().optional(),
    userId: z.string().uuid().optional(),
});
export const createCustomAgentBodySchema = z.object({
    workspaceId: z.string().uuid(),
    name: z.string().min(1, "Agent name is required"),
    role: z.string().min(1, "Role is required"),
    sectionId: z.string().uuid("Please select a valid department"),
    levelId: z.string().uuid().optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    systemPrompt: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    userId: z.string().uuid().optional(),
});
export const recruitedAgentsQuerySchema = z.object({
    workspaceId: z.string().uuid(),
});

export const createTeamBodySchema = z.object({
    workspaceId: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().optional(),
    focus: z.string().optional(),
    icon: z.string().optional(),
    accentColor: z.string().optional(),
    missionObjective: z.string().optional(),
    memberAgentIds: z.array(z.string().uuid()).min(2, "Requires minimum 2 agents in a team to work"),
    leadAgentId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
});

export const updateTeamBodySchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    focus: z.string().optional(),
    icon: z.string().optional(),
    accentColor: z.string().optional(),
    missionObjective: z.string().optional(),
    status: z.enum(["active", "idle", "archived"]).optional(),
});

export const teamsQuerySchema = z.object({
    workspaceId: z.string().uuid(),
});

export const teamIdParamsSchema = z.object({
    id: z.string().uuid(),
});

export const teamMemberParamsSchema = z.object({
    id: z.string().uuid(),
    agentId: z.string().uuid(),
});

export const addTeamMemberBodySchema = z.object({
    agentId: z.string().uuid(),
    memberRole: z.string().optional(),
    isLead: z.boolean().optional(),
    userId: z.string().uuid().optional(),
});
