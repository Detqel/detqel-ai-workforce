import type { NewUserNotification, UserNotification } from "../../../shared/types/entities.js";
import type { INotificationRepository } from "../../notifications/repositories/notification.repository.js";
export class NotificationService {
    constructor(private readonly repository: INotificationRepository) { }
    listByUser(userId: string, options?: {
        workspaceId?: string;
        unreadOnly?: boolean;
        limit?: number;
    }): Promise<UserNotification[]> { return this.repository.listByUser(userId, options); }
    countUnread(userId: string, workspaceId?: string): Promise<number> { return this.repository.countUnread(userId, workspaceId); }
    markAsRead(id: string): Promise<UserNotification | null> { return this.repository.markAsRead(id); }
    markAllAsRead(userId: string, workspaceId?: string): Promise<number> { return this.repository.markAllAsRead(userId, workspaceId); }
    create(data: NewUserNotification): Promise<UserNotification> { return this.repository.create(data); }
}
