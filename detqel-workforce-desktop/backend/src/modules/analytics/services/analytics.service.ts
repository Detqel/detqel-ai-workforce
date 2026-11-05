import type { NewPrediction, NewSimulation, NewUserActivity, Prediction, Simulation, UserActivity } from "../../../shared/types/entities.js";
import type { IAnalyticsRepository } from "../../analytics/repositories/analytics.repository.js";
import type { IMissionRepository } from "../../missions/repositories/mission.repository.js";
import { assertMissionInWorkspace } from "../../missions/services/mission-scope.js";
import type { IActivityRepository } from "../repositories/activity.repository.js";
import type { ActivityHeatmapResult } from "../repositories/activity.types.js";
export class AnalyticsService {
    constructor(private readonly repository: IAnalyticsRepository, private readonly activities: IActivityRepository, private readonly missions: IMissionRepository) { }
    listPredictions(workspaceId: string): Promise<Prediction[]> { return this.repository.listPredictions(workspaceId); }
    async createPrediction(data: NewPrediction): Promise<Prediction> {
        await assertMissionInWorkspace(this.missions, data.missionId, data.workspaceId);
        return this.repository.createPrediction(data);
    }
    listSimulations(workspaceId: string): Promise<Simulation[]> { return this.repository.listSimulations(workspaceId); }
    async createSimulation(data: NewSimulation): Promise<Simulation> {
        await assertMissionInWorkspace(this.missions, data.missionId, data.workspaceId);
        return this.repository.createSimulation(data);
    }
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
