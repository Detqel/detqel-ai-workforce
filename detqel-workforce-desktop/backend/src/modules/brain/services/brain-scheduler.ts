import { BRAIN_LIMITS, BRAIN_RUN_TRIGGERS, BRAIN_STEP_STATUSES } from "../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../shared/contracts/unit-of-work.js";
import { createScopedLogger } from "../../../shared/logging/logger.js";
import { systemActor } from "./brain-types.js";
import type { MedallionPipeline } from "./data/medallion-pipeline.service.js";
import type { EntityResolutionService } from "./semantic/entity-resolution.service.js";
import type { OntologyBuilder } from "./semantic/ontology-builder.js";
import type { WorkflowEngine } from "./workflow/workflow-engine.js";
import type { WorkflowService } from "./workflow/workflow.service.js";

const logger = createScopedLogger("brain-scheduler");

/**
 * The in-process worker for the Business Brain. It lives inside the API process, so it runs only while the app
 * is open; nothing is installed to run when the app is closed. Each tick recovers interrupted runs, queues any
 * dataset whose last sync is older than a day, dispatches outbox events to event-triggered workflows, starts
 * scheduled workflows, advances workflow runs and expires stale approvals.
 *
 * Dataset syncs run in a pool of a few slots instead of inside the tick: a finished sync immediately starts the
 * next due one, so a queue of many tables drains continuously without flooding the source system. All state is
 * in the database and every claim is a lease, so a restart resumes where it stopped (NFR-001, NFR-002).
 */
export class BrainScheduler {
    private timer: NodeJS.Timeout | null = null;
    private current: Promise<void> | null = null;
    private stopped = false;
    private inFlight = 0;
    /** Fills are serialised so two of them never claim more datasets than there are free slots. */
    private filling: Promise<void> = Promise.resolve();
    private ontologyChecked = false;

    constructor(
        private readonly unit: IUnitOfWork,
        private readonly pipeline: MedallionPipeline,
        private readonly workflows: WorkflowService,
        private readonly engine: WorkflowEngine,
        private readonly ontology: OntologyBuilder,
        private readonly entities: EntityResolutionService,
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
        // The first tick runs shortly after the app opens, so data last synced over a day ago starts syncing at once.
        schedule(BRAIN_LIMITS.schedulerStartupDelayMs);
        logger.info({ worker: this.pipeline.workerId, tickMs: this.tickMs }, "Business Brain scheduler started");
    }

    async stop(): Promise<void> {
        this.stopped = true;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        if (this.current) await Promise.race([this.current, new Promise(resolve => setTimeout(resolve, 5_000).unref())]);
    }

    /** Starts due dataset syncs now instead of at the next tick, for example right after "Sync all". */
    wake(): void {
        if (!this.stopped) this.fillDatasetSlots();
    }

    /** Syncs currently running in this process. */
    get activeSyncs(): number {
        return this.inFlight;
    }

    async tick(): Promise<void> {
        await this.step("recover", () => this.pipeline.recoverInterrupted());
        await this.step("seal-legacy", () => this.pipeline.sealLegacyRecords(BRAIN_LIMITS.legacySealBatch));
        if (!this.ontologyChecked) {
            this.ontologyChecked = true;
            await this.step("ontology-backfill", () => this.backfillOntology());
        }
        await this.step("stale-datasets", async () => {
            const queued = await this.unit.brainData.queueStaleDatasets(new Date(Date.now() - BRAIN_LIMITS.staleAfterMs), BRAIN_LIMITS.staleQueueBatch);
            if (queued) logger.info({ queued }, "Queued datasets whose last sync is older than a day");
        });
        await this.step("datasets", async () => { this.fillDatasetSlots(); await this.filling; });
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

    /**
     * Once per start: brings every workspace ontology up to date, and when that adds mappings for data that was
     * already synced (for example after an upgrade), builds its entities and links from Silver. The sources are
     * not read again.
     */
    private async backfillOntology(): Promise<void> {
        for (const workspaceId of await this.unit.brainData.listDatasetWorkspaces()) {
            const changes = await this.ontology.rebuild(workspaceId);
            if (!changes || (!changes.mappingsCreated && !changes.relationshipsCreated)) continue;
            const published = (await this.unit.brainData.listDatasets(workspaceId)).filter(dataset => dataset.publishedVersion > 0 && dataset.status !== "revoked" && !dataset.leaseOwner);
            for (const dataset of published) {
                if (this.stopped) return;
                await this.entities.materialize(dataset).catch(error => logger.warn({ datasetId: dataset.id, error: String(error) }, "Entities could not be built from Silver"));
            }
            logger.info({ workspaceId, datasets: published.length }, "Built the ontology for data synced before it existed");
        }
    }

    /** Claims due datasets for the free slots and starts them; each finished sync refills its slot. */
    private fillDatasetSlots(): void {
        this.filling = this.filling.then(async () => {
            const free = BRAIN_LIMITS.datasetSyncConcurrency - this.inFlight;
            if (free <= 0 || this.stopped) return;
            const due = await this.unit.brainData.claimDueDatasets(this.pipeline.workerId, BRAIN_LIMITS.leaseMs, free);
            for (const dataset of due) {
                this.inFlight++;
                this.pipeline.run(dataset, dataset.lastRunId ? BRAIN_RUN_TRIGGERS.schedule : BRAIN_RUN_TRIGGERS.initial, systemActor(dataset.workspaceId))
                    .catch(error => logger.error({ datasetId: dataset.id, error: String(error) }, "Dataset sync failed"))
                    .finally(() => { this.inFlight--; this.wake(); });
            }
        }).catch(error => logger.error({ stage: "datasets", error: String(error) }, "Business Brain scheduler stage failed"));
    }

    /** One failing stage is logged and does not stop the others. */
    private async step(name: string, work: () => Promise<unknown>): Promise<void> {
        try { await work(); }
        catch (error) { logger.error({ stage: name, error: String(error) }, "Business Brain scheduler stage failed"); }
    }
}
