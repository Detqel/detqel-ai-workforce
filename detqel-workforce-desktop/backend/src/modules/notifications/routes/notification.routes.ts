import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { NotificationController } from "../controllers/notification.controller.js";
export const notificationRoutes: FastifyPluginAsync = async (app) => {
    const controller = new NotificationController(app.services.notifications);
    app.get("/notifications", {
        schema: {
            tags: [API_TAG_NAMES.notifications],
            summary: "Get notifications linked to a specific user",
        },
    }, controller.list.bind(controller));
    app.post("/notifications", {
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
