import type { NewPrediction, NewSimulation, NewUserActivity, Prediction, Simulation, UserActivity } from "../../../shared/types/entities.js";
import type { IAnalyticsRepository } from "../../analytics/repositories/analytics.repository.js";
import type { IActivityRepository } from "../repositories/activity.repository.js";
import type { ActivityHeatmapResult } from "../repositories/activity.types.js";
export class AnalyticsService {
    constructor(private readonly repository: IAnalyticsRepository, private readonly activities: IActivityRepository) { }
    listPredictions(workspaceId: string): Promise<Prediction[]> { return this.repository.listPredictions(workspaceId); }
    createPrediction(data: NewPrediction): Promise<Prediction> { return this.repository.createPrediction(data); }
    listSimulations(workspaceId: string): Promise<Simulation[]> { return this.repository.listSimulations(workspaceId); }
    createSimulation(data: NewSimulation): Promise<Simulation> { return this.repository.createSimulation(data); }
    recordActivity(data: NewUserActivity): Promise<UserActivity> { return this.activities.recordActivity(data); }
    listActivities(workspaceId: string, options?: {
        userId?: string;
        activityType?: string;
        limit?: number;
    }): Promise<UserActivity[]> { return this.activities.listActivities(workspaceId, options); }
    getHeatmapData(workspaceId: string, options?: {
        userId?: string;
        days?: number;
    }): Promise<ActivityHeatmapResult> { return this.activities.getHeatmapData(workspaceId, options); }
}
