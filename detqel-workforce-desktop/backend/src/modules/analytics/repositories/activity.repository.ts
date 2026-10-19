import type { NewUserActivity, UserActivity } from "../../../shared/types/entities.js";
import type { ActivityHeatmapResult } from "./activity.types.js";
export interface IActivityRepository {
    recordActivity(data: NewUserActivity): Promise<UserActivity>;
    recordBatchActivities(data: NewUserActivity[]): Promise<UserActivity[]>;
    listActivities(workspaceId: string, options?: {
        userId?: string;
        activityType?: string;
        limit?: number;
    }): Promise<UserActivity[]>;
    getHeatmapData(workspaceId: string, options?: {
        userId?: string;
        days?: number;
    }): Promise<ActivityHeatmapResult>;
}
