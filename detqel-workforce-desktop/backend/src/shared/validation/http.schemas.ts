import { HEATMAP_DAY_LIMITS, PAGINATION_LIMITS } from "../../constants/httpConstants.js";
import { z } from "zod";
export const idParamsSchema = z.object({ id: z.string().uuid() });
export const workspaceParamsSchema = z.object({ workspaceId: z.string().uuid() });
export const workspaceQuerySchema = z.object({ workspaceId: z.string().uuid() });
export const activityQuerySchema = z.object({
    workspaceId: z.string().uuid(), userId: z.string().uuid().optional(),
    activityType: z.string().optional(), limit: z.coerce.number().int().min(1).max(PAGINATION_LIMITS.maximum).default(PAGINATION_LIMITS.standard),
});
export const heatmapQuerySchema = z.object({
    workspaceId: z.string().uuid(), userId: z.string().uuid().optional(),
    days: z.coerce.number().int().min(1).max(HEATMAP_DAY_LIMITS.maximum).default(HEATMAP_DAY_LIMITS.standard),
});
