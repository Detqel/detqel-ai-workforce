import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { AppError } from "../../../shared/errors/app-error.js";
import { requireUserId } from "../../../shared/security/request-context.js";
import { NotificationController } from "../controllers/notification.controller.js";
import { createNotificationSchema } from "../validation/notification.schemas.js";
export const notificationRoutes: FastifyPluginAsync = async (app) => {
    const controller = new NotificationController(app.services.notifications);
    // Notifying yourself needs nothing more than a session. Notifying someone else requires a shared workspace
    // where the sender can write and the recipient is a member.
    const authorizeRecipient = async (request: FastifyRequest) => {
        const body = createNotificationSchema.parse(request.body);
        const senderId = requireUserId(request);
        const access = app.services.workspaceAccess;
        if (!body.workspaceId) {
            if (body.userId !== senderId) throw new AppError(403, "Notifying another user requires a shared workspace");
            return;
        }
        await access.authorize(senderId, body.workspaceId, body.userId === senderId ? "read" : "write");
        if (body.userId !== senderId && (await access.roleOf(body.userId, body.workspaceId)) === null) {
            throw new AppError(404, "Recipient is not a member of this workspace");
        }
    };
    app.get("/notifications", {
        schema: {
            tags: [API_TAG_NAMES.notifications],
            summary: "Get notifications linked to the signed-in user",
        },
    }, controller.list.bind(controller));
    app.post("/notifications", {
        preHandler: authorizeRecipient,
        schema: {
            tags: [API_TAG_NAMES.notifications],
            summary: "Create a notification for a user",
        },
    }, controller.create.bind(controller));
    app.patch("/notifications/:id/read", {
        schema: {
            tags: [API_TAG_NAMES.notifications],
            summary: "Mark notification as read",
        },
    }, controller.markRead.bind(controller));
    app.post("/notifications/mark-all-read", {
        schema: {
            tags: [API_TAG_NAMES.notifications],
            summary: "Mark all notifications as read for user",
        },
    }, controller.markAllRead.bind(controller));
};
