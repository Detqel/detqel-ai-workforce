import { and, count, desc, eq } from "drizzle-orm";
import { type DatabaseSession } from "../../../infrastructure/database/connection.js";
import { userNotifications, type NewUserNotification, type UserNotification, } from "../../../infrastructure/database/schema/notifications.js";
import type { INotificationRepository } from "./notification.repository.js";
export class NotificationRepository implements INotificationRepository {
    constructor(private readonly database: DatabaseSession) { }
    /**
     * List notifications for a specific user, optionally filtered by workspace
     */
    async listByUser(userId: string, options?: {
        workspaceId?: string;
        unreadOnly?: boolean;
        limit?: number;
    }): Promise<UserNotification[]> {
        const conditions = [eq(userNotifications.userId, userId)];
        if (options?.workspaceId) {
            conditions.push(eq(userNotifications.workspaceId, options.workspaceId));
        }
        if (options?.unreadOnly) {
            conditions.push(eq(userNotifications.isRead, false));
        }
        return this.database
            .select()
            .from(userNotifications)
            .where(and(...conditions))
            .orderBy(desc(userNotifications.createdAt))
            .limit(options?.limit ?? 50);
    }
    /**
     * Count unread notifications for a specific user
     */
    async countUnread(userId: string, workspaceId?: string): Promise<number> {
        const conditions = [
            eq(userNotifications.userId, userId),
            eq(userNotifications.isRead, false),
        ];
        if (workspaceId) {
            conditions.push(eq(userNotifications.workspaceId, workspaceId));
        }
        const [result] = await this.database
            .select({ count: count() })
            .from(userNotifications)
            .where(and(...conditions));
        return result?.count ?? 0;
    }
    /**
     * Mark a notification as read
     */
    async markAsRead(id: string): Promise<UserNotification | null> {
        const [updated] = await this.database
            .update(userNotifications)
            .set({ isRead: true })
            .where(eq(userNotifications.id, id))
            .returning();
        return updated || null;
    }
    /**
     * Mark all notifications as read for a user
     */
    async markAllAsRead(userId: string, workspaceId?: string): Promise<number> {
        const conditions = [
            eq(userNotifications.userId, userId),
            eq(userNotifications.isRead, false),
        ];
        if (workspaceId) {
            conditions.push(eq(userNotifications.workspaceId, workspaceId));
        }
        const updated = await this.database
            .update(userNotifications)
            .set({ isRead: true })
            .where(and(...conditions))
            .returning();
        return updated.length;
    }
    /**
     * Create a new notification linked to a user
     */
    async create(data: NewUserNotification): Promise<UserNotification> {
        const [created] = await this.database
            .insert(userNotifications)
            .values(data)
            .returning();
        return created;
    }
    /**
     * Delete a notification
     */
    async delete(id: string): Promise<boolean> {
        const [deleted] = await this.database
            .delete(userNotifications)
            .where(eq(userNotifications.id, id))
            .returning();
        return Boolean(deleted);
    }
}
