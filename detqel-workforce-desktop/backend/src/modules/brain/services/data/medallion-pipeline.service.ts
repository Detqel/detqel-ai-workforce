import { randomUUID } from "node:crypto";
import {
    BRAIN_DATASET_STATUSES, BRAIN_DRIFT_POLICIES, BRAIN_ERRORS, BRAIN_EVENT_TYPES, BRAIN_LIMITS, BRAIN_QUALITY_RULE_TYPES,
    BRAIN_QUALITY_SEVERITIES, BRAIN_REASON_CODES, BRAIN_RUN_STATUSES, BRAIN_TRANSFORMATION_VERSION, BRAIN_ZONES, type BrainRunTrigger,
} from "../../../../constants/brainConstants.js";
import { redactValue } from "../../../../shared/agents/context/data-guard.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../../shared/logging/logger.js";
import type { BrainDataset, BrainPipelineRun, BrainQualityRule, BrainReason, BrainSchemaField } from "../../../../shared/types/entities.js";
import type { BronzeInsert, QuarantineInsert, SilverUpsert } from "../../repositories/brain-data.repository.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import { actorId, hashOf, round, type BrainActor } from "../brain-types.js";
import type { EntityResolutionService } from "../semantic/entity-resolution.service.js";
import type { MetricService } from "../semantic/metric.service.js";
import { evaluateRecord, normalizeRecord, recordTooLarge, sourceKeyOf } from "./quality-engine.js";
import { diffSchema, hasChanges, isBreaking, profileSchema } from "./schema-profiler.js";
import type { SourceExtractor } from "./source-extractor.js";

const logger = createScopedLogger("brain-pipeline");

export interface StartedRun { readonly run: BrainPipelineRun; readonly completion: Promise<BrainPipelineRun> }

/** Failures worth retrying automatically: unreachable sources, timeouts, rate limits. Validation and policy failures are not. */
export function isTransient(error: unknown): boolean {
    if (error instanceof AppError) return [408, 425, 429, 502, 503, 504].includes(error.statusCode);
    const text = `${(error as { code?: string })?.code ?? ""} ${(error as Error)?.name ?? ""} ${(error as Error)?.message ?? ""}`;
    return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|AbortError|TimeoutError|timeout|socket hang up|connection terminated/i.test(text);
}
const userMessage = (error: unknown): string => error instanceof AppError && (error.statusCode < 500 || error.expose) ? error.message : "The source could not be read. Check the connector and retry.";
const errorCode = (error: unknown): string => error instanceof AppError ? `http_${error.statusCode}` : isTransient(error) ? "source_unreachable" : "processing_error";

/** The dataset settings a run is reproducible from (FR-DATA-013). */
export const configHash = (dataset: BrainDataset) => hashOf({
    sourceKind: dataset.sourceKind, sourceConfig: dataset.sourceConfig, primaryKeyField: dataset.primaryKeyField, watermarkField: dataset.watermarkField,
    timeField: dataset.timeField, syncMode: dataset.syncMode, qualityThreshold: dataset.qualityThreshold, transformation: BRAIN_TRANSFORMATION_VERSION,
});

interface Candidate { readonly key: string; readonly data: Record<string, unknown>; readonly raw: Record<string, unknown>; readonly reasons: BrainReason[]; warnings: number }

/**
 * One governed run through the Medallion zones. Bronze keeps what the source returned (with credentials and card
 * numbers masked, never stored); Silver holds normalised records that passed quality checks; everything that
 * failed is quarantined with reason codes, never silently dropped. Gold is republished, and governed metrics
 * recomputed, only when the run's pass rate meets the dataset's threshold, so bad records never reach a metric.
 */
export class MedallionPipeline {
    constructor(
        private readonly unit: IUnitOfWork,
        private readonly extractor: SourceExtractor,
        private readonly metrics: MetricService,
        private readonly entities: EntityResolutionService,
        private readonly audit: BrainAuditService,
        readonly workerId: string,
    ) {}

    /** Takes the dataset's lease and starts a run in the background, returning the run record immediately. */
    async claimAndStart(actor: BrainActor, datasetId: string, trigger: BrainRunTrigger): Promise<StartedRun> {
        const existing = await this.unit.brainData.findDataset(datasetId, actor.workspaceId);
        if (!existing) throw new AppError(404, BRAIN_ERRORS.datasetNotFound);
        if (existing.status === BRAIN_DATASET_STATUSES.revoked || !existing.connectionId) throw new AppError(409, BRAIN_ERRORS.datasetRevoked);
        const leased = await this.unit.brainData.claimDataset(datasetId, actor.workspaceId, this.workerId, BRAIN_LIMITS.leaseMs);
        if (!leased) throw new AppError(409, BRAIN_ERRORS.datasetBusy);
        return this.start(leased, trigger, actor);
    }

    /** Starts a run for a dataset this worker has already leased. */
    async start(dataset: BrainDataset, trigger: BrainRunTrigger, actor: BrainActor): Promise<StartedRun> {
        const run = await this.unit.brainData.createRun({
            workspaceId: dataset.workspaceId, datasetId: dataset.id, trigger, status: BRAIN_RUN_STATUSES.running,
            attempt: dataset.consecutiveFailures + 1, transformationVersion: BRAIN_TRANSFORMATION_VERSION, configHash: configHash(dataset),
            cursorFrom: dataset.cursor, schemaVersion: dataset.schemaVersion, correlationId: randomUUID(), startedBy: actor.userId,
        });
        const completion = this.process(dataset, run, actor).catch(async error => {
            logger.error({ datasetId: dataset.id, runId: run.id, error: String(error) }, "Pipeline run failed unexpectedly");
            await this.unit.brainData.releaseDataset(dataset.id, this.workerId, {}).catch(() => undefined);
            return run;
        });
        return { run, completion };
    }

    async run(dataset: BrainDataset, trigger: BrainRunTrigger, actor: BrainActor): Promise<BrainPipelineRun> {
        return (await this.start(dataset, trigger, actor)).completion;
    }

    /** Restart recovery (NFR-001): runs whose worker stopped are marked failed and the dataset is rescheduled. */
    async recoverInterrupted(): Promise<number> {
        const stale = await this.unit.brainData.listExpiredLeases(20);
        for (const dataset of stale) {
            await this.unit.brainData.failRunningRuns(dataset.id, "worker_interrupted", "The run stopped before it finished; it will be retried.");
            await this.unit.brainData.releaseDataset(dataset.id, dataset.leaseOwner!, {
                lastRunStatus: BRAIN_RUN_STATUSES.failed, consecutiveFailures: dataset.consecutiveFailures + 1,
                nextSyncAt: dataset.status === BRAIN_DATASET_STATUSES.active ? new Date(Date.now() + BRAIN_LIMITS.retryBaseDelayMs) : dataset.nextSyncAt,
            });
        }
        return stale.length;
    }

    private async process(dataset: BrainDataset, run: BrainPipelineRun, actor: BrainActor): Promise<BrainPipelineRun> {
        try {
            const extraction = await this.extractor.extract(dataset);
            const records = extraction.records.map(record => redactValue(record) as Record<string, unknown>);
            const schema = await this.resolveSchema(dataset, run, records, actor);
            const quarantine: QuarantineInsert[] = [];
            const bronze: BronzeInsert[] = [];
            const keyed: Array<{ key: string; record: Record<string, unknown> }> = [];
            for (const record of records) {
                if (recordTooLarge(record)) {
                    quarantine.push({ sourceKey: hashOf(record).slice(0, 64), payload: { fields: Object.keys(record).slice(0, 50) }, reasons: [{ code: BRAIN_REASON_CODES.recordTooLarge, message: `The record exceeds ${BRAIN_LIMITS.maxRecordBytes} bytes.` }] });
                    continue;
                }
                const key = sourceKeyOf(record, dataset.primaryKeyField);
                if (!key) {
                    quarantine.push({ sourceKey: hashOf(record).slice(0, 64), payload: record, reasons: [{ code: BRAIN_REASON_CODES.missingKey, field: dataset.primaryKeyField ?? undefined, message: "The record has no usable primary key." }] });
                    continue;
                }
                bronze.push({ sourceKey: key, payload: record, payloadHash: hashOf(record) });
                keyed.push({ key, record });
            }
            const bronzeInserted = await this.unit.brainData.insertBronze(dataset.workspaceId, dataset.id, run.id, schema.version, bronze);
            if (schema.held) {
                if (quarantine.length) await this.unit.brainData.insertQuarantine(dataset.workspaceId, dataset.id, run.id, quarantine);
                return this.finish(dataset, run, actor, {
                    status: BRAIN_RUN_STATUSES.failed, extracted: records.length, bronzeInserted, silverUpserted: 0, quarantined: quarantine.length, warnings: 0, passRate: null,
                    cursor: dataset.cursor, schema, published: false, errorCode: "schema_drift_held", errorMessage: BRAIN_ERRORS.schemaDriftHeld, pause: true,
                });
            }
            const rules = (await this.unit.brainData.listQualityRules(dataset.id)).filter(rule => rule.enabled);
            const candidates = await this.checkQuality(dataset, keyed, schema.fields, rules, quarantine);
            const passed = candidates.filter(candidate => !candidate.reasons.length);
            for (const candidate of candidates) if (candidate.reasons.length) quarantine.push({ sourceKey: candidate.key, payload: candidate.raw, reasons: candidate.reasons });
            const silver: SilverUpsert[] = passed.map(candidate => ({
                sourceKey: candidate.key, data: candidate.data, recordHash: hashOf(candidate.data),
                observedAt: observedAt(dataset.timeField ? candidate.data[dataset.timeField] : null),
            }));
            const silverUpserted = await this.unit.brainData.upsertSilver(dataset.workspaceId, dataset.id, run.id, silver);
            if (quarantine.length) await this.unit.brainData.insertQuarantine(dataset.workspaceId, dataset.id, run.id, quarantine);
            const evaluated = passed.length + quarantine.length;
            const passRate = evaluated ? round(passed.length / evaluated, 4) : null;
            const publish = passRate !== null ? passRate >= dataset.qualityThreshold : false;
            return this.finish(dataset, run, actor, {
                status: passRate === null || publish ? BRAIN_RUN_STATUSES.succeeded : BRAIN_RUN_STATUSES.partial,
                extracted: records.length, bronzeInserted, silverUpserted, quarantined: quarantine.length,
                warnings: candidates.reduce((total, candidate) => total + candidate.warnings, 0), passRate,
                cursor: { ...extraction.cursor, ...(extraction.truncated ? { truncated: true } : {}) }, schema, published: publish,
                errorCode: publish || passRate === null ? null : "quality_below_threshold",
                errorMessage: publish || passRate === null ? null : BRAIN_ERRORS.qualityBelowThreshold,
            });
        } catch (error) {
            return this.fail(dataset, run, actor, error);
        }
    }

    /** Infers the batch schema, records any drift as a new version, and applies the dataset's drift policy (FR-DATA-006). */
    private async resolveSchema(dataset: BrainDataset, run: BrainPipelineRun, records: Record<string, unknown>[], actor: BrainActor): Promise<{ fields: BrainSchemaField[]; version: number; held: boolean }> {
        if (!records.length) return { fields: dataset.currentSchema, version: dataset.schemaVersion, held: false };
        const observed = profileSchema(records);
        if (!dataset.currentSchema.length) {
            await this.unit.brainData.createSchemaVersion({ workspaceId: dataset.workspaceId, datasetId: dataset.id, version: dataset.schemaVersion + 1, fields: observed, changes: { added: observed.map(field => field.name), removed: [], changed: [] }, runId: run.id });
            return { fields: observed, version: dataset.schemaVersion + 1, held: false };
        }
        const { changes, merged } = diffSchema(dataset.currentSchema, observed, records.length);
        if (!hasChanges(changes)) return { fields: merged, version: dataset.schemaVersion, held: false };
        const version = dataset.schemaVersion + 1;
        await this.unit.brainData.createSchemaVersion({ workspaceId: dataset.workspaceId, datasetId: dataset.id, version, fields: merged, changes, runId: run.id });
        await this.audit.publishQuietly(dataset.workspaceId, BRAIN_EVENT_TYPES.schemaDrift, { datasetId: dataset.id, version, ...changes }, { actorId: actorId(actor), correlationId: run.correlationId });
        if (isBreaking(changes) && dataset.driftPolicy === BRAIN_DRIFT_POLICIES.hold) return { fields: dataset.currentSchema, version: dataset.schemaVersion, held: true };
        return { fields: merged, version, held: false };
    }

    private async checkQuality(dataset: BrainDataset, keyed: Array<{ key: string; record: Record<string, unknown> }>, schema: BrainSchemaField[], rules: BrainQualityRule[], quarantine: QuarantineInsert[]): Promise<Candidate[]> {
        // A key that appears twice in one extraction means the source key is not unique: keep the latest, quarantine the rest.
        const lastIndex = new Map<string, number>();
        keyed.forEach((item, index) => lastIndex.set(item.key, index));
        const candidates: Candidate[] = [];
        keyed.forEach((item, index) => {
            if (lastIndex.get(item.key) !== index) {
                quarantine.push({ sourceKey: item.key, payload: item.record, reasons: [{ code: BRAIN_REASON_CODES.duplicateKey, field: dataset.primaryKeyField ?? undefined, message: "The source returned this key more than once; the latest record was kept." }] });
                return;
            }
            const normalized = normalizeRecord(item.record, schema);
            const outcome = evaluateRecord(normalized.data, normalized.typeErrors, rules, dataset);
            candidates.push({ key: item.key, data: normalized.data, raw: item.record, reasons: [...outcome.errors], warnings: outcome.warnings.length });
        });
        for (const rule of rules) {
            if (rule.ruleType === BRAIN_QUALITY_RULE_TYPES.unique) await this.checkUnique(dataset, rule, candidates);
            if (rule.ruleType === BRAIN_QUALITY_RULE_TYPES.referential) await this.checkReferential(rule, candidates);
        }
        return candidates;
    }

    private async checkUnique(dataset: BrainDataset, rule: BrainQualityRule, candidates: Candidate[]): Promise<void> {
        const owners = new Map<string, string>();
        const flagged = new Set<Candidate>();
        for (const candidate of candidates) {
            const value = candidate.data[rule.field];
            if (value === null || value === undefined) continue;
            const text = String(value);
            const owner = owners.get(text);
            if (owner && owner !== candidate.key) flagged.add(candidate);
            else owners.set(text, candidate.key);
        }
        const stored = await this.unit.brainData.findSilverValueOwners(dataset.id, rule.field, [...owners.keys()]);
        for (const candidate of candidates) {
            const value = candidate.data[rule.field];
            if (value === null || value === undefined) continue;
            const owner = stored.get(String(value));
            if (owner && owner !== candidate.key) flagged.add(candidate);
        }
        for (const candidate of flagged) this.flag(candidate, rule, { code: BRAIN_REASON_CODES.notUnique, field: rule.field, ruleId: rule.id, message: `"${rule.field}" must be unique.` });
    }

    private async checkReferential(rule: BrainQualityRule, candidates: Candidate[]): Promise<void> {
        const target = String((rule.config as Record<string, unknown>).datasetId ?? "");
        if (!target) return;
        const values = [...new Set(candidates.map(candidate => candidate.data[rule.field]).filter(value => value !== null && value !== undefined).map(String))];
        const existing = await this.unit.brainData.findExistingSilverKeys(target, values);
        for (const candidate of candidates) {
            const value = candidate.data[rule.field];
            if (value !== null && value !== undefined && !existing.has(String(value))) {
                this.flag(candidate, rule, { code: BRAIN_REASON_CODES.referenceMissing, field: rule.field, ruleId: rule.id, message: `"${rule.field}" refers to a record that does not exist.` });
            }
        }
    }

    private flag(candidate: Candidate, rule: BrainQualityRule, reason: BrainReason): void {
        if (rule.severity === BRAIN_QUALITY_SEVERITIES.warning) candidate.warnings++;
        else candidate.reasons.push(reason);
    }

    private async finish(dataset: BrainDataset, run: BrainPipelineRun, actor: BrainActor, outcome: {
        status: string; extracted: number; bronzeInserted: number; silverUpserted: number; quarantined: number; warnings: number; passRate: number | null;
        cursor: Record<string, unknown>; schema: { fields: BrainSchemaField[]; version: number }; published: boolean; errorCode: string | null; errorMessage: string | null; pause?: boolean;
    }): Promise<BrainPipelineRun> {
        const publishedVersion = outcome.published ? dataset.publishedVersion + 1 : dataset.publishedVersion;
        const publishedZone = outcome.published ? BRAIN_ZONES.gold : dataset.publishedVersion > 0 ? dataset.publishedZone : outcome.silverUpserted > 0 ? BRAIN_ZONES.silver : dataset.publishedZone;
        const now = new Date();
        const finished = await this.unit.brainData.updateRun(run.id, {
            status: outcome.status, extractedCount: outcome.extracted, bronzeInserted: outcome.bronzeInserted, silverUpserted: outcome.silverUpserted,
            quarantinedCount: outcome.quarantined, warningCount: outcome.warnings, passRate: outcome.passRate, published: outcome.published,
            publishedVersion: outcome.published ? publishedVersion : null, cursorTo: outcome.cursor, schemaVersion: outcome.schema.version,
            errorCode: outcome.errorCode, errorMessage: outcome.errorMessage, finishedAt: now,
        });
        const updated: BrainDataset = { ...dataset, publishedVersion, publishedZone, currentSchema: outcome.schema.fields, schemaVersion: outcome.schema.version };
        if (outcome.published) {
            await this.metrics.recomputeDataset(updated).catch(error => logger.warn({ datasetId: dataset.id, error: String(error) }, "Gold metrics could not be recomputed"));
            await this.entities.materialize(updated).catch(error => logger.warn({ datasetId: dataset.id, error: String(error) }, "Entities could not be materialized"));
        }
        const succeeded = outcome.status === BRAIN_RUN_STATUSES.succeeded;
        await this.unit.brainData.releaseDataset(dataset.id, this.workerId, {
            cursor: outcome.status === BRAIN_RUN_STATUSES.failed ? dataset.cursor : outcome.cursor,
            currentSchema: outcome.schema.fields, schemaVersion: outcome.schema.version,
            publishedVersion, publishedZone, lastRunId: run.id, lastRunStatus: outcome.status,
            ...(succeeded ? { lastSuccessAt: now } : {}),
            consecutiveFailures: 0,
            status: outcome.pause ? BRAIN_DATASET_STATUSES.paused : dataset.status === BRAIN_DATASET_STATUSES.error ? BRAIN_DATASET_STATUSES.active : dataset.status,
            nextSyncAt: dataset.syncIntervalMinutes && !outcome.pause ? new Date(now.getTime() + dataset.syncIntervalMinutes * 60_000) : null,
        });
        const eventType = outcome.status === BRAIN_RUN_STATUSES.failed ? BRAIN_EVENT_TYPES.pipelineFailed : BRAIN_EVENT_TYPES.pipelineCompleted;
        await this.audit.publishQuietly(dataset.workspaceId, eventType, { resource_id: dataset.id, datasetId: dataset.id, runId: run.id, status: outcome.status, passRate: outcome.passRate, published: outcome.published }, { actorId: actorId(actor), correlationId: run.correlationId });
        await this.audit.recordQuietly(entryFor(actor, "dataset.pipeline.run", "dataset", dataset.id, {
            correlationId: run.correlationId, outcome: outcome.status === BRAIN_RUN_STATUSES.failed ? "failure" : "success",
            metadata: { runId: run.id, status: outcome.status, extracted: outcome.extracted, quarantined: outcome.quarantined, passRate: outcome.passRate, published: outcome.published },
        }));
        logger.info({ datasetId: dataset.id, runId: run.id, status: outcome.status, extracted: outcome.extracted, quarantined: outcome.quarantined }, "Pipeline run finished");
        return finished ?? run;
    }

    private async fail(dataset: BrainDataset, run: BrainPipelineRun, actor: BrainActor, error: unknown): Promise<BrainPipelineRun> {
        const transient = isTransient(error);
        const failures = dataset.consecutiveFailures + 1;
        const retry = transient && failures <= BRAIN_LIMITS.maxTransientRetries && dataset.status === BRAIN_DATASET_STATUSES.active;
        const message = userMessage(error);
        logger.warn({ datasetId: dataset.id, runId: run.id, transient, failures, error: String(error) }, "Pipeline run failed");
        const finished = await this.unit.brainData.updateRun(run.id, { status: BRAIN_RUN_STATUSES.failed, errorCode: errorCode(error), errorMessage: message, finishedAt: new Date() });
        await this.unit.brainData.releaseDataset(dataset.id, this.workerId, {
            lastRunId: run.id, lastRunStatus: BRAIN_RUN_STATUSES.failed, consecutiveFailures: failures,
            // Transient failures back off exponentially; permanent ones wait for a person to fix the source and retry.
            status: retry || dataset.status !== BRAIN_DATASET_STATUSES.active ? dataset.status : BRAIN_DATASET_STATUSES.error,
            nextSyncAt: retry ? new Date(Date.now() + BRAIN_LIMITS.retryBaseDelayMs * 2 ** (failures - 1)) : null,
        });
        await this.audit.publishQuietly(dataset.workspaceId, BRAIN_EVENT_TYPES.pipelineFailed, { resource_id: dataset.id, datasetId: dataset.id, runId: run.id, status: "failed", transient }, { actorId: actorId(actor), correlationId: run.correlationId });
        await this.audit.recordQuietly(entryFor(actor, "dataset.pipeline.run", "dataset", dataset.id, { correlationId: run.correlationId, outcome: "failure", metadata: { runId: run.id, error: message, transient } }));
        return finished ?? run;
    }
}

function observedAt(value: unknown): Date | null {
    if (value === null || value === undefined || value === "") return null;
    const time = Date.parse(String(value));
    return Number.isNaN(time) ? null : new Date(time);
}
