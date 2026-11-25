import { randomUUID } from "node:crypto";
import {
    BRAIN_APPROVAL_STATUSES, BRAIN_ERROR_CLASSES, BRAIN_ERRORS, BRAIN_EVENT_TYPES, BRAIN_LIMITS, BRAIN_POLICY_DECISIONS, BRAIN_STEP_STATUSES,
    BRAIN_WORKFLOW_RUN_STATUSES, BRAIN_WORKFLOW_STATUSES, type BrainErrorClass, type BrainWorkflowTrigger,
} from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../../shared/logging/logger.js";
import type { BrainActionApproval, BrainRetryEntry, BrainWorkflowDefinition, BrainWorkflowRun, BrainWorkflowStepRun } from "../../../../shared/types/entities.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import { actorId, hashOf, sha256, systemActor, userActor, type BrainActor } from "../brain-types.js";
import { isTransient } from "../data/medallion-pipeline.service.js";
import { decide, type BrainPolicyService, type PolicyOutcome } from "../workforce/policy-engine.js";
import type { WorkflowActionDefinition } from "./workflow-actions.js";
import { canTransition, evaluateCondition, isTerminal, resolveTemplates, type WorkflowInput, type WorkflowStep } from "./workflow-definitions.js";

const logger = createScopedLogger("brain-workflow-engine");
const S = BRAIN_STEP_STATUSES;
const R = BRAIN_WORKFLOW_RUN_STATUSES;
const APPROVAL_EXPIRED = "The approval expired.";

export type RoleResolver = (userId: string, workspaceId: string) => Promise<string | null>;

/** Transient failures are retried with backoff; validation and policy failures are not (FR-WF-005). */
export function classifyError(error: unknown): BrainErrorClass {
    if (error instanceof AppError && error.statusCode === 403) return BRAIN_ERROR_CLASSES.policy;
    return isTransient(error) ? BRAIN_ERROR_CLASSES.transient : BRAIN_ERROR_CLASSES.permanent;
}
const safeError = (error: unknown) => error instanceof AppError && (error.statusCode < 500 || error.expose) ? error.message : (error as Error)?.message?.slice(0, 300) || "The step failed.";

/** Validates run inputs against the definition's typed input schema (FR-WF-001). */
export function validateInputs(schema: ReadonlyArray<WorkflowInput>, inputs: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const field of schema) {
        const value = inputs[field.name];
        if (value === undefined || value === null || value === "") {
            if (field.required) throw new AppError(400, `The workflow input "${field.name}" is required.`);
            continue;
        }
        const ok = field.type === "object" ? typeof value === "object" : typeof value === field.type;
        if (!ok) throw new AppError(400, `The workflow input "${field.name}" must be a ${field.type}.`);
        result[field.name] = value;
    }
    if (JSON.stringify(result).length > 50_000) throw new AppError(400, "The workflow inputs are too large.");
    return result;
}

/**
 * The Workflow Engine (PRD 9). Run state lives in the database and every transition is checked, so a run survives
 * restarts and is never advanced by two workers at once (a lease guards each advance). Steps run when their
 * dependencies succeed, in parallel where possible; conditions skip steps; transient failures retry with
 * exponential backoff; side effects carry idempotency keys and are not repeated when already done; high-risk
 * steps wait for an approval bound to the exact resolved payload.
 */
export class WorkflowEngine {
    constructor(
        private readonly unit: IUnitOfWork,
        private readonly audit: BrainAuditService,
        private readonly actions: ReadonlyMap<string, WorkflowActionDefinition>,
        private readonly policies: BrainPolicyService,
        private readonly roleOf: RoleResolver,
        readonly workerId: string,
    ) {}

    knownActions(): Set<string> { return new Set(this.actions.keys()); }
    action(key: string): WorkflowActionDefinition | undefined { return this.actions.get(key); }

    /** Accepts a run (Queued). An idempotency key already used in the workspace returns the existing run instead. */
    async start(actor: BrainActor, definition: BrainWorkflowDefinition, inputs: Record<string, unknown>, trigger: BrainWorkflowTrigger, idempotencyKey?: string): Promise<{ run: BrainWorkflowRun; created: boolean }> {
        if (definition.status !== BRAIN_WORKFLOW_STATUSES.active) throw new AppError(409, BRAIN_ERRORS.workflowNotActive);
        if (!(await this.policies.get(actor.workspaceId)).workflowsEnabled) throw new AppError(403, BRAIN_ERRORS.workflowsDisabled);
        const values = validateInputs(definition.inputSchema as unknown as WorkflowInput[], inputs);
        const { run, created } = await this.unit.brainWorkforce.insertWorkflowRun({
            workspaceId: actor.workspaceId, definitionId: definition.id, definitionVersion: definition.version, status: R.queued, triggerType: trigger,
            inputs: values, idempotencyKey: idempotencyKey ?? randomUUID(), correlationId: randomUUID(), startedBy: actor.userId,
            expiresAt: new Date(Date.now() + BRAIN_LIMITS.workflowRunTtlHours * 3_600_000),
        });
        if (created) {
            const steps = definition.steps as unknown as WorkflowStep[];
            await this.unit.brainWorkforce.createStepRuns(actor.workspaceId, run.id, steps.map(step => ({ stepKey: step.key, action: step.action })));
            await this.audit.recordQuietly(entryFor(actor, "workflow.run.started", "workflow_run", run.id, { correlationId: run.correlationId, metadata: { definition: `${definition.key}@v${definition.version}`, trigger } }));
            setImmediate(() => { void this.advance(run.id, run.workspaceId).catch(error => logger.warn({ runId: run.id, error: String(error) }, "A workflow run could not advance")); });
        }
        return { run, created };
    }

    /** Advances a run if this worker can take its lease; otherwise another worker is already on it. */
    async advance(runId: string, workspaceId: string): Promise<BrainWorkflowRun | null> {
        const claimed = await this.unit.brainWorkforce.claimWorkflowRun(runId, this.workerId, BRAIN_LIMITS.leaseMs);
        if (!claimed) return this.unit.brainWorkforce.findWorkflowRun(runId, workspaceId);
        if (claimed.workspaceId !== workspaceId) {
            await this.unit.brainWorkforce.releaseWorkflowRun(runId, this.workerId, {});
            return null;
        }
        return this.process(claimed);
    }

    /** Scheduler entry point: advances runs that are due, claimed in one statement so workers never overlap. */
    async tick(limit: number): Promise<number> {
        const runs = await this.unit.brainWorkforce.claimReadyWorkflowRuns(this.workerId, BRAIN_LIMITS.leaseMs, limit);
        for (const run of runs) await this.process(run).catch(error => logger.error({ runId: run.id, error: String(error) }, "Workflow run processing failed"));
        return runs.length;
    }

    async cancel(actor: BrainActor, runId: string): Promise<BrainWorkflowRun> {
        const run = await this.unit.brainWorkforce.findWorkflowRun(runId, actor.workspaceId);
        if (!run) throw new AppError(404, BRAIN_ERRORS.workflowRunNotFound);
        if (!canTransition(run.status, R.cancelled)) throw new AppError(409, BRAIN_ERRORS.invalidTransition);
        const cancelled = await this.unit.brainWorkforce.transitionWorkflowRun(runId, [R.queued, R.running, R.waitingApproval], { status: R.cancelled, finishedAt: new Date(), error: "Cancelled by a user.", leaseOwner: null, leaseExpiresAt: null });
        if (!cancelled) throw new AppError(409, BRAIN_ERRORS.invalidTransition);
        for (const step of await this.unit.brainWorkforce.listStepRuns(runId)) {
            if ([S.pending, S.waitingApproval, S.running].includes(step.status as never)) await this.unit.brainWorkforce.updateStepRun(step.id, { status: S.cancelled, finishedAt: new Date() });
            if (step.approvalId) await this.unit.brainWorkforce.updateApproval(step.approvalId, BRAIN_APPROVAL_STATUSES.pending, { status: BRAIN_APPROVAL_STATUSES.invalidated, decidedAt: new Date() });
        }
        await this.finished(actor, cancelled);
        return cancelled;
    }

    /** Manual retry of a failed run: failed and cancelled steps become pending again and the run resumes. */
    async retry(actor: BrainActor, runId: string): Promise<BrainWorkflowRun | null> {
        const run = await this.unit.brainWorkforce.findWorkflowRun(runId, actor.workspaceId);
        if (!run) throw new AppError(404, BRAIN_ERRORS.workflowRunNotFound);
        if (run.status !== R.failed) throw new AppError(409, "Only a failed run can be retried.");
        for (const step of await this.unit.brainWorkforce.listStepRuns(runId)) {
            if (step.status === S.failed || step.status === S.cancelled) await this.unit.brainWorkforce.updateStepRun(step.id, { status: S.pending, error: null, errorClass: null, nextAttemptAt: null, approvalId: step.errorClass === BRAIN_ERROR_CLASSES.policy ? null : step.approvalId });
        }
        const resumed = await this.unit.brainWorkforce.transitionWorkflowRun(runId, [R.failed], { status: R.running, error: null, finishedAt: null, wakeAt: null, expiresAt: new Date(Date.now() + BRAIN_LIMITS.workflowRunTtlHours * 3_600_000) });
        await this.audit.recordQuietly(entryFor(actor, "workflow.run.retried", "workflow_run", runId));
        return resumed ? this.advance(runId, actor.workspaceId) : null;
    }

    /** After an approval decision the waiting run resumes so the step can run or fail accordingly. */
    async resumeAfterDecision(approval: BrainActionApproval): Promise<void> {
        if (!approval.runId) return;
        // The gated step goes back to pending so the approval gate re-evaluates it against the decision.
        const gated = (await this.unit.brainWorkforce.listStepRuns(approval.runId)).find(step => step.approvalId === approval.id && step.status === S.waitingApproval);
        if (gated) await this.unit.brainWorkforce.updateStepRun(gated.id, { status: S.pending });
        await this.unit.brainWorkforce.transitionWorkflowRun(approval.runId, [R.waitingApproval], { status: R.running, wakeAt: null });
        await this.advance(approval.runId, approval.workspaceId);
    }

    private async actorFor(run: BrainWorkflowRun): Promise<BrainActor> {
        if (!run.startedBy) return systemActor(run.workspaceId);
        const role = await this.roleOf(run.startedBy, run.workspaceId).catch(() => null);
        if (!role) throw new AppError(403, "The person who started this workflow no longer has access to the workspace.");
        return userActor(run.startedBy, run.workspaceId, role);
    }

    private async process(run: BrainWorkflowRun): Promise<BrainWorkflowRun> {
        try {
            const definition = await this.unit.brainWorkforce.findWorkflowDefinition(run.definitionId, run.workspaceId);
            if (!definition) throw new AppError(404, BRAIN_ERRORS.workflowNotFound);
            const steps = definition.steps as unknown as WorkflowStep[];
            let current = run;
            if (current.status === R.queued) {
                current = (await this.unit.brainWorkforce.transitionWorkflowRun(run.id, [R.queued], { status: R.running, startedAt: new Date() })) ?? current;
            }
            const actor = await this.actorFor(current);
            const settings = await this.policies.get(run.workspaceId);
            let stepRuns = new Map((await this.unit.brainWorkforce.listStepRuns(run.id)).map(step => [step.stepKey, step]));
            // A step still "running" under a fresh lease means the previous worker stopped mid-step: retry it as transient.
            for (const step of stepRuns.values()) {
                if (step.status === S.running) stepRuns.set(step.stepKey, (await this.unit.brainWorkforce.updateStepRun(step.id, this.retryState(step, "The worker stopped before the step finished.", BRAIN_ERROR_CLASSES.transient, steps.find(item => item.key === step.stepKey))))!);
            }
            for (let round = 0; round < steps.length * 2 + 2; round++) {
                const outputs = Object.fromEntries([...stepRuns.values()].filter(step => step.status === S.succeeded || step.status === S.skipped).map(step => [step.stepKey, step.output ?? {}]));
                const ready: WorkflowStep[] = [];
                for (const step of steps) {
                    const state = stepRuns.get(step.key);
                    if (!state || state.status !== S.pending) continue;
                    const dependencies = step.dependsOn.map(key => stepRuns.get(key));
                    if (dependencies.some(dependency => dependency && [S.failed, S.cancelled].includes(dependency.status as never))) {
                        stepRuns.set(step.key, (await this.unit.brainWorkforce.updateStepRun(state.id, { status: S.cancelled, error: "A step it depends on did not succeed.", finishedAt: new Date() }))!);
                        continue;
                    }
                    if (!dependencies.every(dependency => dependency && (dependency.status === S.succeeded || dependency.status === S.skipped))) continue;
                    if (state.nextAttemptAt && state.nextAttemptAt.getTime() > Date.now()) continue;
                    ready.push(step);
                }
                if (!ready.length) break;
                for (let offset = 0; offset < ready.length; offset += BRAIN_LIMITS.maxParallelSteps) {
                    const batch = ready.slice(offset, offset + BRAIN_LIMITS.maxParallelSteps);
                    const updated = await Promise.all(batch.map(step => this.executeStep(current, definition, step, stepRuns.get(step.key)!, actor, settings, outputs)));
                    for (const step of updated) stepRuns.set(step.stepKey, step);
                }
            }
            stepRuns = new Map((await this.unit.brainWorkforce.listStepRuns(run.id)).map(step => [step.stepKey, step]));
            return this.settle(actor, current, [...stepRuns.values()]);
        } catch (error) {
            logger.warn({ runId: run.id, error: String(error) }, "Workflow run failed while advancing");
            const failed = await this.unit.brainWorkforce.transitionWorkflowRun(run.id, [R.queued, R.running], { status: R.failed, error: safeError(error), finishedAt: new Date() });
            await this.unit.brainWorkforce.releaseWorkflowRun(run.id, this.workerId, {});
            if (failed) await this.finished(systemActor(run.workspaceId), failed);
            return failed ?? run;
        }
    }

    /** Derives the run state from its steps and releases the lease. */
    private async settle(actor: BrainActor, run: BrainWorkflowRun, steps: BrainWorkflowStepRun[]): Promise<BrainWorkflowRun> {
        const failed = steps.find(step => step.status === S.failed);
        const expired = failed?.error === APPROVAL_EXPIRED;
        const waiting = steps.some(step => step.status === S.waitingApproval);
        const pending = steps.filter(step => step.status === S.pending);
        let status: string = R.running;
        let wakeAt: Date | null = null;
        if (failed) status = expired ? R.expired : R.failed;
        else if (steps.every(step => step.status === S.succeeded || step.status === S.skipped)) status = R.succeeded;
        else if (waiting && !pending.some(step => step.nextAttemptAt)) status = R.waitingApproval;
        else wakeAt = pending.map(step => step.nextAttemptAt).filter((at): at is Date => Boolean(at)).sort((a, b) => a.getTime() - b.getTime())[0] ?? new Date(Date.now() + BRAIN_LIMITS.schedulerTickMs);
        const terminal = isTerminal(status);
        await this.unit.brainWorkforce.releaseWorkflowRun(run.id, this.workerId, { status, wakeAt, ...(terminal ? { finishedAt: new Date(), error: failed?.error ?? null } : {}) });
        const settled = (await this.unit.brainWorkforce.findWorkflowRun(run.id, run.workspaceId)) ?? run;
        if (terminal) await this.finished(actor, settled);
        return settled;
    }

    private async executeStep(run: BrainWorkflowRun, definition: BrainWorkflowDefinition, step: WorkflowStep, state: BrainWorkflowStepRun, actor: BrainActor, settings: Awaited<ReturnType<BrainPolicyService["get"]>>, outputs: Record<string, unknown>): Promise<BrainWorkflowStepRun> {
        const update = async (data: Parameters<IUnitOfWork["brainWorkforce"]["updateStepRun"]>[1]) => (await this.unit.brainWorkforce.updateStepRun(state.id, data)) ?? state;
        const action = this.actions.get(step.action);
        if (!action) return update({ status: S.failed, error: `Unknown action "${step.action}".`, errorClass: BRAIN_ERROR_CLASSES.permanent, finishedAt: new Date() });
        if (step.condition && !evaluateCondition(step.condition, outputs)) return update({ status: S.skipped, output: { skipped: true, reason: "Condition not met" }, finishedAt: new Date() });
        const resolved = resolveTemplates(step.input, { inputs: run.inputs, steps: Object.fromEntries(Object.entries(outputs).map(([key, output]) => [key, { output }])), run: { id: run.id }, now: new Date().toISOString().slice(0, 10) });
        const parsed = action.input.safeParse(resolved);
        if (!parsed.success) return update({ status: S.failed, input: resolved as Record<string, unknown>, error: `The step input is not valid: ${parsed.error.issues.slice(0, 2).map(issue => `${issue.path.join(".")} ${issue.message}`).join("; ")}`, errorClass: BRAIN_ERROR_CLASSES.permanent, finishedAt: new Date() });
        const input = parsed.data as Record<string, unknown>;
        const policy = decide(actor, action, settings);
        if (policy.decision === BRAIN_POLICY_DECISIONS.deny) return update({ status: S.failed, input, error: policy.reason, errorClass: BRAIN_ERROR_CLASSES.policy, finishedAt: new Date() });
        const payloadHash = hashOf({ action: action.key, input });
        const idempotencyKey = sha256(`${run.id}:${step.key}:${payloadHash}`);
        if (policy.decision === BRAIN_POLICY_DECISIONS.requireApproval) {
            const gate = await this.approvalGate(run, definition, step, state, action, input, payloadHash, policy, settings.approvalTtlHours, actor);
            if (gate !== "approved") return gate;
        }
        // Duplicate prevention: the same side effect with the same payload already succeeded in this workspace.
        const previous = await this.unit.brainWorkforce.findSucceededStepByIdempotencyKey(run.workspaceId, idempotencyKey);
        if (previous && previous.id !== state.id) return update({ status: S.succeeded, input, idempotencyKey, output: { ...(previous.output ?? {}), deduplicated: true }, finishedAt: new Date() });
        const attempt = state.attempts + 1;
        await update({ status: S.running, input, idempotencyKey, attempts: attempt, startedAt: state.startedAt ?? new Date(), nextAttemptAt: null });
        const controller = new AbortController();
        const timeout = (step.timeoutSeconds ? step.timeoutSeconds * 1_000 : BRAIN_LIMITS.workflowStepTimeoutMs);
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const output = await Promise.race([
                action.handler({ actor, run, stepKey: step.key, idempotencyKey, signal: controller.signal }, input),
                new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new AppError(504, "The step timed out.")), { once: true })),
            ]);
            await this.audit.recordQuietly(entryFor(actor, "workflow.step.succeeded", "workflow_run", run.id, { decision: policy.decision, correlationId: run.correlationId, metadata: { step: step.key, action: action.key, attempt, tier: policy.tier, idempotencyKey } }));
            return update({ status: S.succeeded, output, error: null, errorClass: null, finishedAt: new Date() });
        } catch (error) {
            const errorClass = classifyError(error);
            await this.audit.recordQuietly(entryFor(actor, "workflow.step.failed", "workflow_run", run.id, { outcome: "failure", correlationId: run.correlationId, metadata: { step: step.key, action: action.key, attempt, errorClass, error: safeError(error) } }));
            return update(this.retryState({ ...state, attempts: attempt }, safeError(error), errorClass, step));
        } finally {
            clearTimeout(timer);
        }
    }

    /** Next state after a failed attempt: retry with exponential backoff while transient and attempts remain, else fail. */
    private retryState(state: BrainWorkflowStepRun, error: string, errorClass: BrainErrorClass, step: WorkflowStep | undefined) {
        const maxAttempts = step?.retry?.maxAttempts ?? BRAIN_LIMITS.defaultWorkflowStepAttempts;
        const history: BrainRetryEntry[] = [...state.retryHistory, { attempt: state.attempts, error, errorClass, at: new Date().toISOString() }].slice(-20);
        if (errorClass === BRAIN_ERROR_CLASSES.transient && state.attempts < maxAttempts) {
            const base = (step?.retry?.backoffSeconds ?? 30) * 1_000;
            return { status: S.pending, error, errorClass, retryHistory: history, nextAttemptAt: new Date(Date.now() + base * 2 ** Math.max(state.attempts - 1, 0)) };
        }
        return { status: S.failed, error, errorClass, retryHistory: history, finishedAt: new Date() };
    }

    /**
     * Ensures a valid approval exists for exactly this payload. A changed payload invalidates an earlier approval
     * and asks again (PRD 11.1); a rejection fails the step; an expired approval expires the run.
     */
    private async approvalGate(run: BrainWorkflowRun, definition: BrainWorkflowDefinition, step: WorkflowStep, state: BrainWorkflowStepRun, action: WorkflowActionDefinition, input: Record<string, unknown>, payloadHash: string, policy: PolicyOutcome, ttlHours: number, actor: BrainActor): Promise<"approved" | BrainWorkflowStepRun> {
        const update = async (data: Parameters<IUnitOfWork["brainWorkforce"]["updateStepRun"]>[1]) => (await this.unit.brainWorkforce.updateStepRun(state.id, data)) ?? state;
        const existing = state.approvalId ? await this.unit.brainWorkforce.findApproval(state.approvalId, run.workspaceId) : null;
        if (existing) {
            if (existing.status === BRAIN_APPROVAL_STATUSES.approved && existing.payloadHash === payloadHash) return "approved";
            if (existing.status === BRAIN_APPROVAL_STATUSES.pending && existing.payloadHash === payloadHash) return update({ status: S.waitingApproval });
            if (existing.status === BRAIN_APPROVAL_STATUSES.rejected) return update({ status: S.failed, error: "Rejected by an approver.", errorClass: BRAIN_ERROR_CLASSES.policy, finishedAt: new Date() });
            if (existing.status === BRAIN_APPROVAL_STATUSES.expired) return update({ status: S.failed, error: APPROVAL_EXPIRED, errorClass: BRAIN_ERROR_CLASSES.policy, finishedAt: new Date() });
            if (existing.payloadHash !== payloadHash && (existing.status === BRAIN_APPROVAL_STATUSES.approved || existing.status === BRAIN_APPROVAL_STATUSES.pending)) {
                await this.unit.brainWorkforce.updateApproval(existing.id, existing.status, { status: BRAIN_APPROVAL_STATUSES.invalidated, decidedAt: new Date() });
                await this.audit.recordQuietly(entryFor(actor, "approval.invalidated", "approval", existing.id, { correlationId: run.correlationId, metadata: { reason: "payload changed", step: step.key } }));
            }
        }
        const approval = await this.unit.brainWorkforce.createApproval({
            workspaceId: run.workspaceId, runId: run.id, stepKey: step.key, action: action.key, title: `${definition.name}: ${step.name}`.slice(0, 255), riskTier: policy.tier,
            payload: { input }, payloadHash, preview: { workflow: `${definition.key}@v${definition.version}`, step: step.key, action: action.key, ...(action.preview ? action.preview(input as never) : { input }) },
            status: BRAIN_APPROVAL_STATUSES.pending, requiredApprovals: Math.max(1, policy.requiredApprovals), requestedByAgent: null, requestedByUser: run.startedBy,
            expiresAt: new Date(Math.min(Date.now() + ttlHours * 3_600_000, run.expiresAt.getTime())),
        });
        await this.audit.recordQuietly(entryFor(actor, "approval.requested", "approval", approval.id, { decision: policy.decision, correlationId: run.correlationId, metadata: { run: run.id, step: step.key, tier: policy.tier } }));
        await this.audit.publishQuietly(run.workspaceId, BRAIN_EVENT_TYPES.approvalRequested, { approvalId: approval.id, runId: run.id, step: step.key, riskTier: policy.tier }, { actorId: actorId(actor), correlationId: run.correlationId });
        return update({ status: S.waitingApproval, approvalId: approval.id, input });
    }

    private async finished(actor: BrainActor, run: BrainWorkflowRun): Promise<void> {
        await this.audit.publishQuietly(run.workspaceId, BRAIN_EVENT_TYPES.workflowRunFinished, { runId: run.id, definitionId: run.definitionId, status: run.status }, { actorId: actorId(actor), correlationId: run.correlationId });
        await this.audit.recordQuietly(entryFor(actor, `workflow.run.${run.status}`, "workflow_run", run.id, { correlationId: run.correlationId, outcome: run.status === R.succeeded ? "success" : "failure", metadata: { error: run.error } }));
        await this.audit.activity(run.workspaceId, run.startedBy, "automations", `Workflow run ${run.status}`, "brain-workflow-run", run.id, { event: "workflow-run-finished", status: run.status });
    }
}
