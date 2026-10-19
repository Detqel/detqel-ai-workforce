import { z } from "zod";
export const idParamsSchema = z.object({ id: z.string().uuid() });
export const workspaceParamsSchema = z.object({ workspaceId: z.string().uuid() });
export const workspaceQuerySchema = z.object({ workspaceId: z.string().uuid() });
export const activityQuerySchema = z.object({
    workspaceId: z.string().uuid(), userId: z.string().uuid().optional(),
    activityType: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const heatmapQuerySchema = z.object({
    workspaceId: z.string().uuid(), userId: z.string().uuid().optional(),
    days: z.coerce.number().int().min(1).max(366).default(28),
});
