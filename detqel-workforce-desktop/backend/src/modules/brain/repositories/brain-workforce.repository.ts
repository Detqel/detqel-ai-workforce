import type {
    BrainActionApproval, BrainAgentTask, BrainPolicySettings, BrainTaskStep, BrainWorkflowDefinition, BrainWorkflowRun, BrainWorkflowStepRun,
    NewBrainActionApproval, NewBrainAgentTask, NewBrainTaskStep, NewBrainWorkflowDefinition, NewBrainWorkflowRun,
} from "../../../shared/types/entities.js";

export type StepRunInsert = Pick<BrainWorkflowStepRun, "stepKey" | "action">;
export type StepRunUpdate = Partial<Omit<BrainWorkflowStepRun, "id" | "runId" | "workspaceId" | "stepKey" | "action" | "createdAt">>;

/** AI Workforce and Workflow Engine persistence: tasks, steps, approvals, tenant policy, workflow definitions and durable runs. */
export interface IBrainWorkforceRepository {
    createTask(data: NewBrainAgentTask): Promise<BrainAgentTask>;
    updateTask(id: string, data: Partial<NewBrainAgentTask>): Promise<BrainAgentTask | null>;
    findTask(id: string, workspaceId: string): Promise<BrainAgentTask | null>;
    listTasks(workspaceId: string, options: { initiatedBy?: string; limit: number }): Promise<BrainAgentTask[]>;
    countTasks(workspaceId: string, status: string, since: Date): Promise<number>;
    createSteps(rows: ReadonlyArray<NewBrainTaskStep>): Promise<BrainTaskStep[]>;
    updateStep(id: string, data: Partial<NewBrainTaskStep>): Promise<BrainTaskStep | null>;
    listSteps(taskId: string): Promise<BrainTaskStep[]>;

    getPolicySettings(workspaceId: string): Promise<BrainPolicySettings | null>;
    upsertPolicySettings(workspaceId: string, data: Partial<Omit<BrainPolicySettings, "workspaceId">>): Promise<BrainPolicySettings>;

    createWorkflowDefinition(data: NewBrainWorkflowDefinition): Promise<BrainWorkflowDefinition>;
    findWorkflowDefinition(id: string, workspaceId: string): Promise<BrainWorkflowDefinition | null>;
    findLatestWorkflowByKey(workspaceId: string, key: string): Promise<BrainWorkflowDefinition | null>;
    listWorkflowDefinitions(workspaceId: string, limit: number): Promise<BrainWorkflowDefinition[]>;
    updateWorkflowDefinition(id: string, workspaceId: string, data: Partial<NewBrainWorkflowDefinition>): Promise<BrainWorkflowDefinition | null>;
    /** Active scheduled definitions whose next run is due, claimed by advancing their next run time. */
    claimDueScheduledWorkflows(limit: number): Promise<BrainWorkflowDefinition[]>;
    listActiveEventWorkflows(workspaceId: string, eventType: string): Promise<BrainWorkflowDefinition[]>;

    /** Inserts a run unless one with the same idempotency key exists in the workspace; returns whichever is stored. */
    insertWorkflowRun(data: NewBrainWorkflowRun): Promise<{ run: BrainWorkflowRun; created: boolean }>;
    findWorkflowRun(id: string, workspaceId: string): Promise<BrainWorkflowRun | null>;
    listWorkflowRuns(workspaceId: string, options: { definitionId?: string; status?: string; limit: number }): Promise<BrainWorkflowRun[]>;
    /** Changes a run's status only when it is still in one of the expected states (optimistic transition). */
    transitionWorkflowRun(id: string, from: ReadonlyArray<string>, data: Partial<NewBrainWorkflowRun>): Promise<BrainWorkflowRun | null>;
    claimWorkflowRun(id: string, owner: string, leaseMs: number): Promise<BrainWorkflowRun | null>;
    claimReadyWorkflowRuns(owner: string, leaseMs: number, limit: number): Promise<BrainWorkflowRun[]>;
    releaseWorkflowRun(id: string, owner: string, data: Partial<NewBrainWorkflowRun>): Promise<void>;
    /** Moves runs past their permitted lifetime to expired and returns them. */
    expireWorkflowRuns(limit: number): Promise<BrainWorkflowRun[]>;

    createStepRuns(workspaceId: string, runId: string, rows: ReadonlyArray<StepRunInsert>): Promise<BrainWorkflowStepRun[]>;
    listStepRuns(runId: string): Promise<BrainWorkflowStepRun[]>;
    updateStepRun(id: string, data: StepRunUpdate): Promise<BrainWorkflowStepRun | null>;
    /** Duplicate-prevention: a side effect that already succeeded under this idempotency key. */
    findSucceededStepByIdempotencyKey(workspaceId: string, idempotencyKey: string): Promise<BrainWorkflowStepRun | null>;

    createApproval(data: NewBrainActionApproval): Promise<BrainActionApproval>;
    findApproval(id: string, workspaceId: string): Promise<BrainActionApproval | null>;
    listApprovals(workspaceId: string, options: { status?: string; limit: number }): Promise<BrainActionApproval[]>;
    countApprovals(workspaceId: string, status: string, since?: Date): Promise<number>;
    /** Updates a pending approval only when its status is unchanged, so concurrent decisions cannot both apply. */
    updateApproval(id: string, expectedStatus: string, data: Partial<NewBrainActionApproval>): Promise<BrainActionApproval | null>;
    expireApprovals(limit: number): Promise<BrainActionApproval[]>;
}
