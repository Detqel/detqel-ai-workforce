import type { FastifyReply, FastifyRequest } from "fastify";
import { idParamsSchema } from "../../../shared/validation/http.schemas.js";
import type { NotificationService } from "../services/notification.service.js";
import { createNotificationSchema, getNotificationsQuerySchema, markAllReadSchema } from "../validation/notification.schemas.js";
export class NotificationController {
    constructor(private readonly service: NotificationService) { }
    async list(request: FastifyRequest, reply: FastifyReply) {
        const query = getNotificationsQuerySchema.parse(request.query);
        const notifications = await this.service.listByUser(query.userId, {
            workspaceId: query.workspaceId,
            unreadOnly: query.unreadOnly,
            limit: query.limit,
        });
        const unreadCount = await this.service.countUnread(query.userId, query.workspaceId);
        return reply.send({
            notifications,
            unreadCount,
        });
    }
    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = createNotificationSchema.parse(request.body);
        const notification = await this.service.create(body);
        return reply.status(201).send(notification);
    }
    async markRead(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const updated = await this.service.markAsRead(id);
        if (!updated) {
            return reply.status(404).send({ message: "Notification not found" });
        }
        return reply.send(updated);
    }
    async markAllRead(request: FastifyRequest, reply: FastifyReply) {
        const body = markAllReadSchema.parse(request.body);
        await this.service.markAllAsRead(body.userId, body.workspaceId);
        return reply.send({ success: true, message: "All notifications marked as read" });
    }
}
