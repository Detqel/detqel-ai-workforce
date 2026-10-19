import type { NewUserNotification, UserNotification } from "../../../shared/types/entities.js";
export interface INotificationRepository {
    listByUser(userId: string, options?: {
        workspaceId?: string;
        unreadOnly?: boolean;
        limit?: number;
    }): Promise<UserNotification[]>;
    countUnread(userId: string, workspaceId?: string): Promise<number>;
    markAsRead(id: string): Promise<UserNotification | null>;
    markAllAsRead(userId: string, workspaceId?: string): Promise<number>;
    create(data: NewUserNotification): Promise<UserNotification>;
    delete(id: string): Promise<boolean>;
}
