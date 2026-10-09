import type { NewPrediction, NewSimulation, Prediction, Simulation } from "../../../shared/types/entities.js";
export interface IAnalyticsRepository {
    listPredictions(workspaceId: string): Promise<Prediction[]>;
    createPrediction(data: NewPrediction): Promise<Prediction>;
    listSimulations(workspaceId: string): Promise<Simulation[]>;
    createSimulation(data: NewSimulation): Promise<Simulation>;
    updateSimulation(id: string, data: Partial<NewSimulation>): Promise<Simulation | null>;
}
