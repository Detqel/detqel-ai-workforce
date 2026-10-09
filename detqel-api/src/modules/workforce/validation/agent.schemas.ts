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
