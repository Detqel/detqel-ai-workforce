import { z } from "zod";
export const createMissionSchema = z.object({
    workspaceId: z.string().uuid(),
    title: z.string().min(1),
    userRequest: z.string().min(1),
    intent: z.record(z.unknown()).default({}),
    plan: z.record(z.unknown()).optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    initiatedBy: z.string().uuid().optional(),
    assignedAgents: z
        .array(z.object({
        agentId: z.string().uuid(),
        role: z.enum(["primary", "collaborator", "reviewer", "executor"]).default("primary"),
    }))
        .optional(),
});
export const logEventSchema = z.object({
    eventType: z.enum([
        "intent",
        "plan",
        "research",
        "analysis",
        "agent_action",
        "finding",
        "recommendation",
        "approval",
        "execution",
        "verification",
        "error",
    ]),
    title: z.string().min(1),
    description: z.string().optional(),
    payload: z.record(z.unknown()).optional(),
    agentId: z.string().uuid().optional(),
});
export const addSourceSchema = z.object({
    sourceType: z.enum(["internal", "web", "connection", "knowledge", "agent"]),
    sourceReference: z.string().min(1),
    title: z.string().optional(),
    url: z.string().url().optional(),
    metadata: z.record(z.unknown()).optional(),
});
export const updateStatusSchema = z.object({
    status: z.enum([
        "queued",
        "planning",
        "investigating",
        "collaborating",
        "reasoning",
        "review",
        "executing",
        "verifying",
        "completed",
        "failed",
        "cancelled",
        "blocked",
    ]),
});
