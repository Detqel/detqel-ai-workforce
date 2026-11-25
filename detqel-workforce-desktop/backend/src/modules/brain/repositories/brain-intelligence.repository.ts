import type { BrainAnalysisRun, BrainScenario, NewBrainAnalysisRun, NewBrainScenario } from "../../../shared/types/entities.js";

/** Intelligence Engine persistence: the versioned run registry and saved scenarios. */
export interface IBrainIntelligenceRepository {
    createRun(data: NewBrainAnalysisRun): Promise<BrainAnalysisRun>;
    findRun(id: string, workspaceId: string): Promise<BrainAnalysisRun | null>;
    listRuns(workspaceId: string, options: { kind?: string; metricId?: string; scenarioId?: string; limit: number }): Promise<BrainAnalysisRun[]>;
    latestRun(workspaceId: string, kind: string, status?: string): Promise<BrainAnalysisRun | null>;

    createScenario(data: NewBrainScenario): Promise<BrainScenario>;
    findScenario(id: string, workspaceId: string): Promise<BrainScenario | null>;
    listScenarios(workspaceId: string, limit: number): Promise<BrainScenario[]>;
    updateScenario(id: string, workspaceId: string, data: Partial<NewBrainScenario>): Promise<BrainScenario | null>;
    deleteScenario(id: string, workspaceId: string): Promise<boolean>;
}
