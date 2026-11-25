import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import {
    brainActionApprovals, brainAgentTasks, brainPolicySettings, brainTaskSteps, brainWorkflowDefinitions, brainWorkflowRuns, brainWorkflowStepRuns,
} from "../../../infrastructure/database/schema/brain.js";
import type {
    BrainActionApproval, BrainAgentTask, BrainPolicySettings, BrainTaskStep, BrainWorkflowDefinition, BrainWorkflowRun, BrainWorkflowStepRun,
    NewBrainActionApproval, NewBrainAgentTask, NewBrainTaskStep, NewBrainWorkflowDefinition, NewBrainWorkflowRun,
} from "../../../shared/types/entities.js";
import type { IBrainWorkforceRepository, StepRunInsert, StepRunUpdate } from "./brain-workforce.repository.js";

const leaseUntil = (leaseMs: number) => sql`now() + ${leaseMs}::int * interval '1 millisecond'`;
const runLeaseFree = or(isNull(brainWorkflowRuns.leaseExpiresAt), lt(brainWorkflowRuns.leaseExpiresAt, sql`now()`));

export class BrainWorkforceRepository implements IBrainWorkforceRepository {
    constructor(private readonly database: DatabaseSession) {}

    async createTask(data: NewBrainAgentTask): Promise<BrainAgentTask> {
        const [row] = await this.database.insert(brainAgentTasks).values(data).returning();
        return row;
    }
    async updateTask(id: string, data: Partial<NewBrainAgentTask>): Promise<BrainAgentTask | null> {
        const [row] = await this.database.update(brainAgentTasks).set({ ...data, updatedAt: new Date() }).where(eq(brainAgentTasks.id, id)).returning();
        return row ?? null;
    }
    async findTask(id: string, workspaceId: string): Promise<BrainAgentTask | null> {
        const [row] = await this.database.select().from(brainAgentTasks).where(and(eq(brainAgentTasks.id, id), eq(brainAgentTasks.workspaceId, workspaceId))).limit(1);
        return row ?? null;
    }
    listTasks(workspaceId: string, options: { initiatedBy?: string; limit: number }): Promise<BrainAgentTask[]> {
        return this.database.select().from(brainAgentTasks)
            .where(and(eq(brainAgentTasks.workspaceId, workspaceId), options.initiatedBy ? eq(brainAgentTasks.initiatedBy, options.initiatedBy) : undefined))
            .orderBy(desc(brainAgentTasks.createdAt)).limit(options.limit);
    }
    async countTasks(workspaceId: string, status: string, since: Date): Promise<number> {
        const [row] = await this.database.select({ value: count() }).from(brainAgentTasks)
            .where(and(eq(brainAgentTasks.workspaceId, workspaceId), eq(brainAgentTasks.status, status), gte(brainAgentTasks.finishedAt, since)));
        return row?.value ?? 0;
    }
    createSteps(rows: ReadonlyArray<NewBrainTaskStep>): Promise<BrainTaskStep[]> {
        if (!rows.length) return Promise.resolve([]);
        return this.database.insert(brainTaskSteps).values([...rows]).returning();
    }
    async updateStep(id: string, data: Partial<NewBrainTaskStep>): Promise<BrainTaskStep | null> {
        const [row] = await this.database.update(brainTaskSteps).set(data).where(eq(brainTaskSteps.id, id)).returning();
        return row ?? null;
    }
    listSteps(taskId: string): Promise<BrainTaskStep[]> {
        return this.database.select().from(brainTaskSteps).where(eq(brainTaskSteps.taskId, taskId)).orderBy(asc(brainTaskSteps.stepIndex));
    }

    async getPolicySettings(workspaceId: string): Promise<BrainPolicySettings | null> {
        const [row] = await this.database.select().from(brainPolicySettings).where(eq(brainPolicySettings.workspaceId, workspaceId)).limit(1);
        return row ?? null;
    }
    async upsertPolicySettings(workspaceId: string, data: Partial<Omit<BrainPolicySettings, "workspaceId">>): Promise<BrainPolicySettings> {
        const [row] = await this.database.insert(brainPolicySettings).values({ workspaceId, ...data, updatedAt: new Date() })
            .onConflictDoUpdate({ target: brainPolicySettings.workspaceId, set: { ...data, updatedAt: new Date() } }).returning();
        return row;
    }

    async createWorkflowDefinition(data: NewBrainWorkflowDefinition): Promise<BrainWorkflowDefinition> {
        const [row] = await this.database.insert(brainWorkflowDefinitions).values(data).returning();
        return row;
    }
    async findWorkflowDefinition(id: string, workspaceId: string): Promise<BrainWorkflowDefinition | null> {
        const [row] = await this.database.select().from(brainWorkflowDefinitions).where(and(eq(brainWorkflowDefinitions.id, id), eq(brainWorkflowDefinitions.workspaceId, workspaceId))).limit(1);
        return row ?? null;
    }
    async findLatestWorkflowByKey(workspaceId: string, key: string): Promise<BrainWorkflowDefinition | null> {
        const [row] = await this.database.select().from(brainWorkflowDefinitions).where(and(eq(brainWorkflowDefinitions.workspaceId, workspaceId), eq(brainWorkflowDefinitions.key, key)))
            .orderBy(desc(brainWorkflowDefinitions.version)).limit(1);
        return row ?? null;
    }
    listWorkflowDefinitions(workspaceId: string, limit: number): Promise<BrainWorkflowDefinition[]> {
        return this.database.select().from(brainWorkflowDefinitions).where(eq(brainWorkflowDefinitions.workspaceId, workspaceId))
            .orderBy(asc(brainWorkflowDefinitions.key), desc(brainWorkflowDefinitions.version)).limit(limit);
    }
    async updateWorkflowDefinition(id: string, workspaceId: string, data: Partial<NewBrainWorkflowDefinition>): Promise<BrainWorkflowDefinition | null> {
        const [row] = await this.database.update(brainWorkflowDefinitions).set({ ...data, updatedAt: new Date() })
            .where(and(eq(brainWorkflowDefinitions.id, id), eq(brainWorkflowDefinitions.workspaceId, workspaceId))).returning();
        return row ?? null;
    }
    async claimDueScheduledWorkflows(limit: number): Promise<BrainWorkflowDefinition[]> {
        const due = this.database.select({ id: brainWorkflowDefinitions.id }).from(brainWorkflowDefinitions)
            .where(and(eq(brainWorkflowDefinitions.status, "active"), lte(brainWorkflowDefinitions.nextRunAt, sql`now()`), sql`${brainWorkflowDefinitions.trigger}->>'type' = 'schedule'`))
            .limit(limit).for("update", { skipLocked: true });
        // Advancing next_run_at in the claim makes each due slot start one run, even with several workers.
        return this.database.update(brainWorkflowDefinitions).set({
            nextRunAt: sql`now() + greatest(5, coalesce((${brainWorkflowDefinitions.trigger}->>'intervalMinutes')::int, 60)) * interval '1 minute'`,
        }).where(inArray(brainWorkflowDefinitions.id, due)).returning();
    }
    listActiveEventWorkflows(workspaceId: string, eventType: string): Promise<BrainWorkflowDefinition[]> {
        return this.database.select().from(brainWorkflowDefinitions).where(and(
            eq(brainWorkflowDefinitions.workspaceId, workspaceId), eq(brainWorkflowDefinitions.status, "active"),
            sql`${brainWorkflowDefinitions.trigger}->>'type' = 'event'`, sql`${brainWorkflowDefinitions.trigger}->>'eventType' = ${eventType}`,
        ));
    }

    async insertWorkflowRun(data: NewBrainWorkflowRun): Promise<{ run: BrainWorkflowRun; created: boolean }> {
        const [created] = await this.database.insert(brainWorkflowRuns).values(data).onConflictDoNothing({ target: [brainWorkflowRuns.workspaceId, brainWorkflowRuns.idempotencyKey] }).returning();
        if (created) return { run: created, created: true };
        const [existing] = await this.database.select().from(brainWorkflowRuns)
            .where(and(eq(brainWorkflowRuns.workspaceId, data.workspaceId), eq(brainWorkflowRuns.idempotencyKey, data.idempotencyKey))).limit(1);
        return { run: existing, created: false };
    }
    async findWorkflowRun(id: string, workspaceId: string): Promise<BrainWorkflowRun | null> {
        const [row] = await this.database.select().from(brainWorkflowRuns).where(and(eq(brainWorkflowRuns.id, id), eq(brainWorkflowRuns.workspaceId, workspaceId))).limit(1);
        return row ?? null;
    }
    listWorkflowRuns(workspaceId: string, options: { definitionId?: string; status?: string; limit: number }): Promise<BrainWorkflowRun[]> {
        return this.database.select().from(brainWorkflowRuns).where(and(
            eq(brainWorkflowRuns.workspaceId, workspaceId),
            options.definitionId ? eq(brainWorkflowRuns.definitionId, options.definitionId) : undefined,
            options.status ? eq(brainWorkflowRuns.status, options.status) : undefined,
        )).orderBy(desc(brainWorkflowRuns.createdAt)).limit(options.limit);
    }
    async transitionWorkflowRun(id: string, from: ReadonlyArray<string>, data: Partial<NewBrainWorkflowRun>): Promise<BrainWorkflowRun | null> {
        const [row] = await this.database.update(brainWorkflowRuns).set({ ...data, updatedAt: new Date() })
            .where(and(eq(brainWorkflowRuns.id, id), inArray(brainWorkflowRuns.status, [...from]))).returning();
        return row ?? null;
    }
    async claimWorkflowRun(id: string, owner: string, leaseMs: number): Promise<BrainWorkflowRun | null> {
        const [row] = await this.database.update(brainWorkflowRuns).set({ leaseOwner: owner, leaseExpiresAt: leaseUntil(leaseMs) })
            .where(and(eq(brainWorkflowRuns.id, id), inArray(brainWorkflowRuns.status, ["queued", "running"]), runLeaseFree)).returning();
        return row ?? null;
    }
    async claimReadyWorkflowRuns(owner: string, leaseMs: number, limit: number): Promise<BrainWorkflowRun[]> {
        const ready = this.database.select({ id: brainWorkflowRuns.id }).from(brainWorkflowRuns)
            .where(and(inArray(brainWorkflowRuns.status, ["queued", "running"]), or(isNull(brainWorkflowRuns.wakeAt), lte(brainWorkflowRuns.wakeAt, sql`now()`)), runLeaseFree))
            .orderBy(asc(brainWorkflowRuns.createdAt)).limit(limit).for("update", { skipLocked: true });
        return this.database.update(brainWorkflowRuns).set({ leaseOwner: owner, leaseExpiresAt: leaseUntil(leaseMs) })
            .where(inArray(brainWorkflowRuns.id, ready)).returning();
    }
    async releaseWorkflowRun(id: string, owner: string, data: Partial<NewBrainWorkflowRun>): Promise<void> {
        await this.database.update(brainWorkflowRuns).set({ ...data, leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
            .where(and(eq(brainWorkflowRuns.id, id), eq(brainWorkflowRuns.leaseOwner, owner)));
    }
    expireWorkflowRuns(limit: number): Promise<BrainWorkflowRun[]> {
        const stale = this.database.select({ id: brainWorkflowRuns.id }).from(brainWorkflowRuns)
            .where(and(inArray(brainWorkflowRuns.status, ["queued", "running", "waiting_approval"]), lt(brainWorkflowRuns.expiresAt, sql`now()`), runLeaseFree))
            .limit(limit).for("update", { skipLocked: true });
        return this.database.update(brainWorkflowRuns).set({ status: "expired", finishedAt: new Date(), error: "The run exceeded its permitted lifetime.", updatedAt: new Date() })
            .where(inArray(brainWorkflowRuns.id, stale)).returning();
    }

    createStepRuns(workspaceId: string, runId: string, rows: ReadonlyArray<StepRunInsert>): Promise<BrainWorkflowStepRun[]> {
        if (!rows.length) return Promise.resolve([]);
        return this.database.insert(brainWorkflowStepRuns).values(rows.map(row => ({ workspaceId, runId, stepKey: row.stepKey, action: row.action })))
            .onConflictDoNothing().returning();
    }
    listStepRuns(runId: string): Promise<BrainWorkflowStepRun[]> {
        return this.database.select().from(brainWorkflowStepRuns).where(eq(brainWorkflowStepRuns.runId, runId)).orderBy(asc(brainWorkflowStepRuns.createdAt));
    }
    async updateStepRun(id: string, data: StepRunUpdate): Promise<BrainWorkflowStepRun | null> {
        const [row] = await this.database.update(brainWorkflowStepRuns).set({ ...data, updatedAt: new Date() }).where(eq(brainWorkflowStepRuns.id, id)).returning();
        return row ?? null;
    }
    async findSucceededStepByIdempotencyKey(workspaceId: string, idempotencyKey: string): Promise<BrainWorkflowStepRun | null> {
        const [row] = await this.database.select().from(brainWorkflowStepRuns).where(and(
            eq(brainWorkflowStepRuns.workspaceId, workspaceId), eq(brainWorkflowStepRuns.idempotencyKey, idempotencyKey), eq(brainWorkflowStepRuns.status, "succeeded"),
        )).limit(1);
        return row ?? null;
    }

    async createApproval(data: NewBrainActionApproval): Promise<BrainActionApproval> {
        const [row] = await this.database.insert(brainActionApprovals).values(data).returning();
        return row;
    }
    async findApproval(id: string, workspaceId: string): Promise<BrainActionApproval | null> {
        const [row] = await this.database.select().from(brainActionApprovals).where(and(eq(brainActionApprovals.id, id), eq(brainActionApprovals.workspaceId, workspaceId))).limit(1);
        return row ?? null;
    }
    listApprovals(workspaceId: string, options: { status?: string; limit: number }): Promise<BrainActionApproval[]> {
        return this.database.select().from(brainActionApprovals)
            .where(and(eq(brainActionApprovals.workspaceId, workspaceId), options.status ? eq(brainActionApprovals.status, options.status) : undefined))
            .orderBy(desc(brainActionApprovals.createdAt)).limit(options.limit);
    }
    async countApprovals(workspaceId: string, status: string, since?: Date): Promise<number> {
        const [row] = await this.database.select({ value: count() }).from(brainActionApprovals).where(and(
            eq(brainActionApprovals.workspaceId, workspaceId), eq(brainActionApprovals.status, status), since ? gte(brainActionApprovals.decidedAt, since) : undefined,
        ));
        return row?.value ?? 0;
    }
    async updateApproval(id: string, expectedStatus: string, data: Partial<NewBrainActionApproval>): Promise<BrainActionApproval | null> {
        const [row] = await this.database.update(brainActionApprovals).set({ ...data, updatedAt: new Date() })
            .where(and(eq(brainActionApprovals.id, id), eq(brainActionApprovals.status, expectedStatus))).returning();
        return row ?? null;
    }
    expireApprovals(limit: number): Promise<BrainActionApproval[]> {
        const stale = this.database.select({ id: brainActionApprovals.id }).from(brainActionApprovals)
            .where(and(eq(brainActionApprovals.status, "pending"), lt(brainActionApprovals.expiresAt, sql`now()`))).limit(limit).for("update", { skipLocked: true });
        return this.database.update(brainActionApprovals).set({ status: "expired", decidedAt: new Date(), updatedAt: new Date() })
            .where(inArray(brainActionApprovals.id, stale)).returning();
    }
}
