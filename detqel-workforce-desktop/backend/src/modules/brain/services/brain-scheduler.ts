import { BRAIN_LIMITS, BRAIN_RUN_TRIGGERS, BRAIN_STEP_STATUSES } from "../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../shared/contracts/unit-of-work.js";
import { createScopedLogger } from "../../../shared/logging/logger.js";
import { systemActor } from "./brain-types.js";
import type { MedallionPipeline } from "./data/medallion-pipeline.service.js";
import type { WorkflowEngine } from "./workflow/workflow-engine.js";
import type { WorkflowService } from "./workflow/workflow.service.js";

const logger = createScopedLogger("brain-scheduler");

/**
 * The in-process worker for durable background work. Each tick recovers interrupted runs, starts due dataset
 * syncs, dispatches outbox events to event-triggered workflows, starts scheduled workflows, advances ready
 * workflow runs and expires stale approvals. All state is in the database and every claim is a lease, so a
 * restart resumes where it stopped and several processes never process the same item (NFR-001, NFR-002).
 */
export class BrainScheduler {
    private timer: NodeJS.Timeout | null = null;
    private current: Promise<void> | null = null;
    private stopped = false;

    constructor(
        private readonly unit: IUnitOfWork,
        private readonly pipeline: MedallionPipeline,
        private readonly workflows: WorkflowService,
        private readonly engine: WorkflowEngine,
        private readonly tickMs: number = BRAIN_LIMITS.schedulerTickMs,
    ) {}

    start(): void {
        if (this.timer || this.stopped) return;
        const schedule = (delay: number) => {
            this.timer = setTimeout(() => {
                this.current = this.tick().finally(() => { this.current = null; if (!this.stopped) schedule(this.tickMs); });
            }, delay);
            this.timer.unref();
        };
        schedule(BRAIN_LIMITS.schedulerStartupDelayMs);
        logger.info({ worker: this.pipeline.workerId, tickMs: this.tickMs }, "Business Brain scheduler started");
    }

    async stop(): Promise<void> {
        this.stopped = true;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        if (this.current) await Promise.race([this.current, new Promise(resolve => setTimeout(resolve, 5_000).unref())]);
    }

    async tick(): Promise<void> {
        await this.step("recover", () => this.pipeline.recoverInterrupted());
        await this.step("datasets", async () => {
            const due = await this.unit.brainData.claimDueDatasets(this.pipeline.workerId, BRAIN_LIMITS.leaseMs, BRAIN_LIMITS.datasetsPerTick);
            await Promise.allSettled(due.map(dataset => this.pipeline.run(dataset, dataset.lastRunId ? BRAIN_RUN_TRIGGERS.schedule : BRAIN_RUN_TRIGGERS.initial, systemActor(dataset.workspaceId))));
        });
        await this.step("events", async () => {
            for (const event of await this.unit.brainGovernance.claimPendingEvents(BRAIN_LIMITS.eventsPerTick)) await this.workflows.handleEvent(event);
        });
        await this.step("scheduled-workflows", () => this.workflows.triggerScheduled(BRAIN_LIMITS.workflowRunsPerTick));
        await this.step("workflow-runs", () => this.engine.tick(BRAIN_LIMITS.workflowRunsPerTick));
        await this.step("approvals", async () => {
            for (const approval of await this.unit.brainWorkforce.expireApprovals(50)) {
                if (approval.runId) await this.engine.resumeAfterDecision(approval);
                else if (approval.taskId) {
                    const step = (await this.unit.brainWorkforce.listSteps(approval.taskId)).find(item => String(item.stepIndex) === approval.stepKey);
                    if (step) await this.unit.brainWorkforce.updateStep(step.id, { status: BRAIN_STEP_STATUSES.failed, error: "The approval expired.", finishedAt: new Date() });
                }
            }
            await this.unit.brainWorkforce.expireWorkflowRuns(20);
        });
    }

    /** One failing stage is logged and does not stop the others. */
    private async step(name: string, work: () => Promise<unknown>): Promise<void> {
        try { await work(); }
        catch (error) { logger.error({ stage: name, error: String(error) }, "Business Brain scheduler stage failed"); }
    }
}
