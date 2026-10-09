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
        const [prediction] = await this.database
            .insert(predictions)
            .values(data)
            .returning();
        return prediction;
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
        const [simulation] = await this.database
            .insert(simulations)
            .values(data)
            .returning();
        return simulation;
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
