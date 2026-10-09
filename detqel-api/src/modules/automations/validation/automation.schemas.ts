import { z } from "zod";
export const createAutomationSchema = z.object({
    workspaceId: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().min(1),
    trigger: z.record(z.unknown()).default({}),
    conditions: z.array(z.unknown()).default([]),
    actions: z.array(z.unknown()).default([]),
    agentStrategy: z.record(z.unknown()).optional(),
    approvalPolicy: z.record(z.unknown()).default({}),
    faultTolerance: z.record(z.unknown()).optional(),
    createdBy: z.string().uuid(),
});
export const triggerRunSchema = z.object({
    missionId: z.string().uuid().optional(),
    triggerData: z.record(z.unknown()).optional(),
});
export const createScheduledTaskSchema = z.object({
    workspaceId: z.string().uuid(),
    taskType: z.enum(["state_refresh", "mission", "prediction", "automation", "agent_task", "other"]),
    targetId: z.string().uuid().optional(),
    schedule: z.string().min(1),
});
