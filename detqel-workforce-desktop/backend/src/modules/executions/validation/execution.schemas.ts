import { z } from "zod";
export const createExecutionSchema = z.object({
    missionId: z.string().uuid(),
    approvalId: z.string().uuid().optional(),
    actionType: z.string().min(1),
    actionPayload: z.record(z.unknown()),
});
export const updateExecutionSchema = z.object({
    status: z.enum(["queued", "running", "completed", "failed", "rolled_back"]),
    result: z.record(z.unknown()).optional(),
    error: z.string().optional(),
});
