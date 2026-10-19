import { z } from "zod";
export const getNotificationsQuerySchema = z.object({
    userId: z.string().uuid(),
    workspaceId: z.string().uuid().optional(),
    unreadOnly: z
        .enum(["true", "false"])
        .optional()
        .transform((val) => val === "true"),
    limit: z.coerce.number().min(1).max(100).optional(),
});
export const createNotificationSchema = z.object({
    userId: z.string().uuid(),
    workspaceId: z.string().uuid().optional(),
    title: z.string().min(1).max(255),
    message: z.string().min(1),
    type: z.enum(["info", "success", "warning", "alert"]).default("info"),
    link: z.string().max(255).optional(),
});
export const markAllReadSchema = z.object({
    userId: z.string().uuid(),
    workspaceId: z.string().uuid().optional(),
});
