import { userActivities } from "../../../infrastructure/database/schema/activities.js";
import { desc, eq } from "drizzle-orm";
import { type DatabaseSession } from "../../../infrastructure/database/connection.js";
import { predictions, simulations, type NewPrediction, type NewSimulation, type Prediction, type Simulation, } from "../../../infrastructure/database/schema/analytics.js";
import type { IAnalyticsRepository } from "./analytics.repository.js";
export class AnalyticsRepository implements IAnalyticsRepository {
    constructor(private readonly database: DatabaseSession) { }
    // Predictions
    async listPredictions(workspaceId: string): Promise<Prediction[]> {
        return this.database
            .select()
            .from(predictions)
            .where(eq(predictions.workspaceId, workspaceId))
            .orderBy(desc(predictions.createdAt));
    }
    async createPrediction(data: NewPrediction): Promise<Prediction> {
        return this.database.transaction(async tx => {
            const [prediction] = await tx.insert(predictions).values(data).returning();
            await tx.insert(userActivities).values({ workspaceId: prediction.workspaceId, activityType: "predictions", title: "Prediction saved", entityType: "prediction", entityId: prediction.id, metadata: { event: "prediction-created" } });
            return prediction;
        });
    }
    // Simulations
    async listSimulations(workspaceId: string): Promise<Simulation[]> {
        return this.database
            .select()
            .from(simulations)
            .where(eq(simulations.workspaceId, workspaceId))
            .orderBy(desc(simulations.createdAt));
    }
    async createSimulation(data: NewSimulation): Promise<Simulation> {
        return this.database.transaction(async tx => {
            const [simulation] = await tx.insert(simulations).values(data).returning();
            await tx.insert(userActivities).values({ workspaceId: simulation.workspaceId, userId: simulation.createdBy, activityType: "simulations", title: "Simulation created", entityType: "simulation", entityId: simulation.id, metadata: { event: "simulation-created" } });
            return simulation;
        });
    }
    async updateSimulation(id: string, data: Partial<NewSimulation>): Promise<Simulation | null> {
        const [updated] = await this.database
            .update(simulations)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(simulations.id, id))
            .returning();
        return updated || null;
    }
}
