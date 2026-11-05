import { z } from "zod";
export const createApprovalSchema = z.object({
    workspaceId: z.string().uuid(),
    missionId: z.string().uuid().optional(),
    title: z.string().min(1),
    description: z.string().min(1),
    requestedAction: z.record(z.unknown()),
    riskLevel: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    requestedBy: z.string().uuid().optional(),
});
export const reviewApprovalSchema = z.object({
    // Optional and verified against the session: the reviewer is always the signed-in user.
    userId: z.string().uuid().optional(),
    status: z.enum(["approved", "rejected"]),
});
