import { and, desc, eq } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import { brainAnalysisRuns, brainScenarios } from "../../../infrastructure/database/schema/brain.js";
import type { BrainAnalysisRun, BrainScenario, NewBrainAnalysisRun, NewBrainScenario } from "../../../shared/types/entities.js";
import type { IBrainIntelligenceRepository } from "./brain-intelligence.repository.js";

export class BrainIntelligenceRepository implements IBrainIntelligenceRepository {
    constructor(private readonly database: DatabaseSession) {}

    async createRun(data: NewBrainAnalysisRun): Promise<BrainAnalysisRun> {
        const [row] = await this.database.insert(brainAnalysisRuns).values(data).returning();
        return row;
    }
    async findRun(id: string, workspaceId: string): Promise<BrainAnalysisRun | null> {
        const [row] = await this.database.select().from(brainAnalysisRuns).where(and(eq(brainAnalysisRuns.id, id), eq(brainAnalysisRuns.workspaceId, workspaceId))).limit(1);
        return row ?? null;
    }
    listRuns(workspaceId: string, options: { kind?: string; metricId?: string; scenarioId?: string; limit: number }): Promise<BrainAnalysisRun[]> {
        return this.database.select().from(brainAnalysisRuns).where(and(
            eq(brainAnalysisRuns.workspaceId, workspaceId),
            options.kind ? eq(brainAnalysisRuns.kind, options.kind) : undefined,
            options.metricId ? eq(brainAnalysisRuns.metricId, options.metricId) : undefined,
            options.scenarioId ? eq(brainAnalysisRuns.scenarioId, options.scenarioId) : undefined,
        )).orderBy(desc(brainAnalysisRuns.createdAt)).limit(options.limit);
    }
    async latestRun(workspaceId: string, kind: string, status?: string): Promise<BrainAnalysisRun | null> {
        const [row] = await this.database.select().from(brainAnalysisRuns).where(and(
            eq(brainAnalysisRuns.workspaceId, workspaceId), eq(brainAnalysisRuns.kind, kind), status ? eq(brainAnalysisRuns.status, status) : undefined,
        )).orderBy(desc(brainAnalysisRuns.createdAt)).limit(1);
        return row ?? null;
    }

    async createScenario(data: NewBrainScenario): Promise<BrainScenario> {
        const [row] = await this.database.insert(brainScenarios).values(data).returning();
        return row;
    }
    async findScenario(id: string, workspaceId: string): Promise<BrainScenario | null> {
        const [row] = await this.database.select().from(brainScenarios).where(and(eq(brainScenarios.id, id), eq(brainScenarios.workspaceId, workspaceId))).limit(1);
        return row ?? null;
    }
    listScenarios(workspaceId: string, limit: number): Promise<BrainScenario[]> {
        return this.database.select().from(brainScenarios).where(and(eq(brainScenarios.workspaceId, workspaceId), eq(brainScenarios.status, "saved")))
            .orderBy(desc(brainScenarios.updatedAt)).limit(limit);
    }
    async updateScenario(id: string, workspaceId: string, data: Partial<NewBrainScenario>): Promise<BrainScenario | null> {
        const [row] = await this.database.update(brainScenarios).set({ ...data, updatedAt: new Date() })
            .where(and(eq(brainScenarios.id, id), eq(brainScenarios.workspaceId, workspaceId))).returning();
        return row ?? null;
    }
    async deleteScenario(id: string, workspaceId: string): Promise<boolean> {
        const rows = await this.database.delete(brainScenarios).where(and(eq(brainScenarios.id, id), eq(brainScenarios.workspaceId, workspaceId))).returning({ id: brainScenarios.id });
        return rows.length > 0;
    }
}
