import type { NewUserNotification, UserNotification } from "../../../shared/types/entities.js";
export interface INotificationRepository {
    listByUser(userId: string, options?: {
        workspaceId?: string;
        unreadOnly?: boolean;
        limit?: number;
    }): Promise<UserNotification[]>;
    countUnread(userId: string, workspaceId?: string): Promise<number>;
    /** Marks the user's own notification as read. Another user's notification is never matched. */
    markAsRead(id: string, userId: string): Promise<UserNotification | null>;
    markAllAsRead(userId: string, workspaceId?: string): Promise<number>;
    create(data: NewUserNotification): Promise<UserNotification>;
    delete(id: string): Promise<boolean>;
}
