import {
    BRAIN_DATASET_STATUSES, BRAIN_DRIFT_POLICIES, BRAIN_ERRORS, BRAIN_LIMITS, BRAIN_POLICY_RESOURCES, BRAIN_QUALITY_RULE_TYPES,
    BRAIN_RUN_TRIGGERS, BRAIN_SOURCE_KINDS, BRAIN_SYNC_MODES, BRAIN_TRANSFORMATION_VERSION,
} from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../../shared/logging/logger.js";
import type { BrainDataset } from "../../../../shared/types/entities.js";
import { readOnlyStatement } from "../../../connections/operations/data-operations.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import type { BrainActor } from "../brain-types.js";
import { SlidingWindowLimiter } from "../rate-limiter.js";
import { evaluateAccess, maskRecord } from "../semantic/access-policy.js";
import { metricFormula } from "../semantic/metric.service.js";
import { freshnessState, isSafePattern } from "./quality-engine.js";
import type { MedallionPipeline } from "./medallion-pipeline.service.js";
import { isSafeIdentifier, type SourceExtractor } from "./source-extractor.js";

const logger = createScopedLogger("brain-datasets");

export interface DatasetInput {
    readonly connectionId: string;
    readonly name: string;
    readonly domain: string;
    readonly description?: string | null;
    readonly source: {
        readonly sql?: string; readonly path?: string; readonly format?: string; readonly recordsPath?: string;
        /** Set by database loads: the source table, and the key's type so full scans page on its index. */
        readonly table?: { readonly schema: string; readonly name: string };
        readonly keyType?: string;
    };
    readonly primaryKeyField?: string | null;
    readonly watermarkField?: string | null;
    readonly timeField?: string | null;
    readonly syncMode: string;
    readonly syncIntervalMinutes?: number | null;
    readonly classification: string;
    readonly freshnessSlaMinutes: number;
    readonly qualityThreshold: number;
    readonly driftPolicy: string;
    readonly ownerUserId?: string | null;
}
/** A dataset prepared by a database load from discovered catalog names. */
export interface DiscoveredDataset extends DatasetInput {
    /** Fields to treat as personal data from the first run, beyond what is detected automatically. */
    readonly protectedFields: string[];
}
export interface QualityRuleInput { readonly ruleType: string; readonly field: string; readonly config: Record<string, unknown>; readonly severity: string; readonly enabled: boolean }

/** What a dataset looks like to users: no lease internals, plus its derived freshness state (FR-DATA-011, FR-DATA-014). */
export function datasetView(dataset: BrainDataset, counts?: { bronze: number; silver: number; quarantinedOpen: number }) {
    return {
        id: dataset.id, name: dataset.name, domain: dataset.domain, description: dataset.description, connectionId: dataset.connectionId,
        sourceKind: dataset.sourceKind, source: dataset.sourceConfig, primaryKeyField: dataset.primaryKeyField, watermarkField: dataset.watermarkField,
        timeField: dataset.timeField, syncMode: dataset.syncMode, syncIntervalMinutes: dataset.syncIntervalMinutes, status: dataset.status,
        classification: dataset.classification, ownerUserId: dataset.ownerUserId, freshnessSlaMinutes: dataset.freshnessSlaMinutes,
        qualityThreshold: dataset.qualityThreshold, driftPolicy: dataset.driftPolicy, schemaVersion: dataset.schemaVersion, schema: dataset.currentSchema,
        protectedFields: dataset.protectedFields,
        zone: dataset.publishedZone, publishedVersion: dataset.publishedVersion, transformationVersion: BRAIN_TRANSFORMATION_VERSION,
        lastRunId: dataset.lastRunId, lastRunStatus: dataset.lastRunStatus, lastSuccessAt: dataset.lastSuccessAt, lastAttemptAt: dataset.lastAttemptAt,
        nextSyncAt: dataset.nextSyncAt, consecutiveFailures: dataset.consecutiveFailures, syncing: Boolean(dataset.leaseExpiresAt && dataset.leaseExpiresAt > new Date()),
        freshness: freshnessState(dataset), counts: counts ?? null, createdAt: dataset.createdAt, updatedAt: dataset.updatedAt,
    };
}

/**
 * Source registration and pipeline control (FR-DATA-001..014): register a dataset on a workspace connection,
 * schedule, pause, resume, retry, revoke or purge it, manage its quality rules and quarantine, and inspect lineage.
 */
export class DatasetService {
    private readonly manualSyncs = new SlidingWindowLimiter(BRAIN_LIMITS.manualSyncsPerMinute, 60_000);

    constructor(
        private readonly unit: IUnitOfWork,
        private readonly audit: BrainAuditService,
        private readonly extractor: SourceExtractor,
        private readonly pipeline: MedallionPipeline,
    ) {}

    async list(actor: BrainActor) {
        const [datasets, policies] = await Promise.all([this.unit.brainData.listDatasets(actor.workspaceId), this.unit.brainSemantic.listPolicies(actor.workspaceId)]);
        const visible = datasets.filter(dataset => evaluateAccess(policies, actor.role, BRAIN_POLICY_RESOURCES.dataset, dataset.id).allowed);
        const counts = await this.unit.brainData.datasetCounts(visible.map(dataset => dataset.id));
        return visible.map(dataset => datasetView(dataset, counts.get(dataset.id)));
    }

    async require(actor: BrainActor, id: string): Promise<BrainDataset> {
        const dataset = await this.unit.brainData.findDataset(id, actor.workspaceId);
        if (!dataset) throw new AppError(404, BRAIN_ERRORS.datasetNotFound);
        const policies = await this.unit.brainSemantic.listPolicies(actor.workspaceId);
        if (!evaluateAccess(policies, actor.role, BRAIN_POLICY_RESOURCES.dataset, dataset.id).allowed) throw new AppError(404, BRAIN_ERRORS.datasetNotFound);
        return dataset;
    }

    async get(actor: BrainActor, id: string) {
        const dataset = await this.require(actor, id);
        const [counts, rules, runs, schemaVersions, reasons] = await Promise.all([
            this.unit.brainData.datasetCounts([dataset.id]),
            this.unit.brainData.listQualityRules(dataset.id),
            this.unit.brainData.listRuns(actor.workspaceId, { datasetId: dataset.id, limit: 10 }),
            this.unit.brainData.listSchemaVersions(dataset.id),
            this.unit.brainData.quarantineReasons(actor.workspaceId, dataset.id),
        ]);
        return { ...datasetView(dataset, counts.get(dataset.id)), qualityRules: rules, recentRuns: runs, schemaVersions, quarantineReasons: reasons };
    }

    async create(actor: BrainActor, input: DatasetInput) {
        if (await this.unit.brainData.countDatasets(actor.workspaceId) >= BRAIN_LIMITS.maxDatasetsPerWorkspace) throw new AppError(422, BRAIN_ERRORS.datasetLimit);
        if (await this.unit.brainData.findDatasetByName(actor.workspaceId, input.name)) throw new AppError(409, "A dataset with this name already exists.");
        const sourceKind = await this.validate(actor, input);
        const dataset = await this.unit.transaction(async repositories => {
            const created = await repositories.brainData.createDataset({
                workspaceId: actor.workspaceId, ...this.values(input), sourceKind, createdBy: actor.userId,
                ownerUserId: input.ownerUserId ?? actor.userId, nextSyncAt: new Date(),
            });
            await this.audit.record(entryFor(actor, "dataset.registered", "dataset", created.id, { metadata: { name: created.name, sourceKind, connectionId: created.connectionId } }), repositories);
            return created;
        });
        // Journey A: registration validates connectivity, then starts the initial ingestion straight away.
        this.background(actor, dataset.id, BRAIN_RUN_TRIGGERS.initial);
        return datasetView(dataset);
    }

    /**
     * Registers datasets prepared by a database load in one transaction, so a failure leaves none half-created.
     * The first few start syncing at once; the rest are due now and the scheduler works through them.
     */
    async registerDiscovered(actor: BrainActor, sourceKind: string, inputs: ReadonlyArray<DiscoveredDataset>) {
        for (const input of inputs) {
            for (const field of [input.primaryKeyField, input.timeField]) if (field && !isSafeIdentifier(field)) throw new AppError(400, BRAIN_ERRORS.invalidField);
            readOnlyStatement(input.source.sql ?? "");
        }
        const created = await this.unit.transaction(async repositories => {
            const rows = [];
            for (const input of inputs) {
                const row = await repositories.brainData.createDataset({
                    workspaceId: actor.workspaceId, ...this.values(input), sourceKind, createdBy: actor.userId,
                    ownerUserId: input.ownerUserId ?? actor.userId, nextSyncAt: new Date(), protectedFields: input.protectedFields,
                });
                await this.audit.record(entryFor(actor, "dataset.registered", "dataset", row.id, { metadata: { name: row.name, domain: row.domain, sourceKind, connectionId: row.connectionId, table: input.source.table } }), repositories);
                rows.push(row);
            }
            return rows;
        });
        for (const dataset of created.slice(0, BRAIN_LIMITS.datasetsPerTick)) this.background(actor, dataset.id, BRAIN_RUN_TRIGGERS.initial);
        return created.map(dataset => datasetView(dataset));
    }

    async update(actor: BrainActor, id: string, input: DatasetInput) {
        const existing = await this.require(actor, id);
        if (existing.status === BRAIN_DATASET_STATUSES.revoked) throw new AppError(409, BRAIN_ERRORS.datasetRevoked);
        const duplicate = await this.unit.brainData.findDatasetByName(actor.workspaceId, input.name);
        if (duplicate && duplicate.id !== id) throw new AppError(409, "A dataset with this name already exists.");
        const sourceKind = await this.validate(actor, input);
        const values = this.values(input);
        const sourceChanged = JSON.stringify(existing.sourceConfig) !== JSON.stringify(values.sourceConfig) || existing.connectionId !== input.connectionId
            || existing.watermarkField !== values.watermarkField || existing.syncMode !== values.syncMode;
        const updated = await this.unit.transaction(async repositories => {
            // A different source or extraction mode starts over with a full load instead of trusting the old cursor.
            const row = await repositories.brainData.updateDataset(id, actor.workspaceId, { ...values, sourceKind, ...(sourceChanged ? { cursor: {}, nextSyncAt: new Date() } : {}) });
            await this.audit.record(entryFor(actor, "dataset.updated", "dataset", id, { metadata: { sourceChanged, previous: datasetView(existing) } }), repositories);
            return row!;
        });
        return datasetView(updated);
    }

    async setPaused(actor: BrainActor, id: string, paused: boolean) {
        const dataset = await this.require(actor, id);
        if (dataset.status === BRAIN_DATASET_STATUSES.revoked) throw new AppError(409, BRAIN_ERRORS.datasetRevoked);
        const updated = await this.unit.brainData.updateDataset(id, actor.workspaceId, paused
            ? { status: BRAIN_DATASET_STATUSES.paused, nextSyncAt: null }
            : { status: BRAIN_DATASET_STATUSES.active, consecutiveFailures: 0, nextSyncAt: new Date() });
        await this.audit.record(entryFor(actor, paused ? "dataset.paused" : "dataset.resumed", "dataset", id));
        return datasetView(updated!);
    }

    /** Manual sync or retry (FR-DATA-005). Returns the started run; the work continues in the background. */
    async sync(actor: BrainActor, id: string, retry: boolean) {
        this.manualSyncs.consume(`${actor.workspaceId}:${actor.userId}`);
        const dataset = await this.require(actor, id);
        if (dataset.status === BRAIN_DATASET_STATUSES.paused) throw new AppError(409, "Resume the dataset before syncing it.");
        if (dataset.status === BRAIN_DATASET_STATUSES.error) await this.unit.brainData.updateDataset(id, actor.workspaceId, { status: BRAIN_DATASET_STATUSES.active, consecutiveFailures: 0 });
        const started = await this.pipeline.claimAndStart(actor, id, retry ? BRAIN_RUN_TRIGGERS.retry : BRAIN_RUN_TRIGGERS.manual);
        void started.completion;
        return started.run;
    }

    /** Stops ingestion for good without deleting what was already processed (FR-DATA-007). */
    async revoke(actor: BrainActor, id: string) {
        await this.require(actor, id);
        const updated = await this.unit.brainData.updateDataset(id, actor.workspaceId, { status: BRAIN_DATASET_STATUSES.revoked, nextSyncAt: null, connectionId: null });
        await this.audit.record(entryFor(actor, "dataset.revoked", "dataset", id));
        return datasetView(updated!);
    }

    /**
     * Deletion workflow (PRD 5.4): removes the raw, conformed, quarantined and curated copies, governed metrics and
     * their Gold values, mappings, and the dataset's references in canonical entities (entities left without any
     * source are deleted). The audit entry records what was removed, never the data.
     */
    async purge(actor: BrainActor, id: string) {
        const dataset = await this.require(actor, id);
        const counts = (await this.unit.brainData.datasetCounts([id])).get(id);
        return this.unit.transaction(async repositories => {
            const entitiesRemoved = await repositories.brainSemantic.removeDatasetReferences(actor.workspaceId, id);
            await repositories.brainData.deleteDataset(id, actor.workspaceId);
            await this.audit.record(entryFor(actor, "dataset.purged", "dataset", id, { metadata: { name: dataset.name, ...counts, entitiesRemoved } }), repositories);
            return { success: true, removed: { ...counts, entities: entitiesRemoved } };
        });
    }

    /** Accepts a held schema change (FR-DATA-006): the newest detected version becomes current and syncing resumes. */
    async acceptSchema(actor: BrainActor, id: string) {
        const dataset = await this.require(actor, id);
        const [latest] = await this.unit.brainData.listSchemaVersions(id);
        if (!latest || latest.version <= dataset.schemaVersion) throw new AppError(409, "There is no pending schema change to accept.");
        const updated = await this.unit.brainData.updateDataset(id, actor.workspaceId, { currentSchema: latest.fields, schemaVersion: latest.version, status: BRAIN_DATASET_STATUSES.active, nextSyncAt: new Date() });
        await this.audit.record(entryFor(actor, "dataset.schema.accepted", "dataset", id, { metadata: { version: latest.version, changes: latest.changes } }));
        return datasetView(updated!);
    }

    async runs(actor: BrainActor, options: { datasetId?: string; limit?: number }) {
        if (options.datasetId) await this.require(actor, options.datasetId);
        return this.unit.brainData.listRuns(actor.workspaceId, { datasetId: options.datasetId, limit: Math.min(options.limit ?? 25, BRAIN_LIMITS.listLimit) });
    }

    async run(actor: BrainActor, runId: string) {
        const run = await this.unit.brainData.findRun(runId, actor.workspaceId);
        if (!run) throw new AppError(404, BRAIN_ERRORS.runNotFound);
        await this.require(actor, run.datasetId);
        return run;
    }

    async listRules(actor: BrainActor, datasetId: string) {
        await this.require(actor, datasetId);
        return this.unit.brainData.listQualityRules(datasetId);
    }

    async createRule(actor: BrainActor, datasetId: string, input: QualityRuleInput) {
        await this.require(actor, datasetId);
        await this.validateRule(actor, input);
        if (await this.unit.brainData.countQualityRules(datasetId) >= BRAIN_LIMITS.maxQualityRulesPerDataset) throw new AppError(422, "This dataset has reached its quality rule limit.");
        const rule = await this.unit.brainData.createQualityRule({ workspaceId: actor.workspaceId, datasetId, ...input });
        await this.audit.record(entryFor(actor, "dataset.quality_rule.created", "quality_rule", rule.id, { metadata: { datasetId, ruleType: rule.ruleType, field: rule.field } }));
        return rule;
    }

    async updateRule(actor: BrainActor, datasetId: string, ruleId: string, input: QualityRuleInput) {
        await this.require(actor, datasetId);
        await this.validateRule(actor, input);
        const rule = await this.unit.brainData.updateQualityRule(ruleId, datasetId, input);
        if (!rule) throw new AppError(404, "Quality rule not found");
        await this.audit.record(entryFor(actor, "dataset.quality_rule.updated", "quality_rule", ruleId, { metadata: { datasetId } }));
        return rule;
    }

    async deleteRule(actor: BrainActor, datasetId: string, ruleId: string) {
        await this.require(actor, datasetId);
        if (!await this.unit.brainData.deleteQualityRule(ruleId, datasetId)) throw new AppError(404, "Quality rule not found");
        await this.audit.record(entryFor(actor, "dataset.quality_rule.deleted", "quality_rule", ruleId, { metadata: { datasetId } }));
        return { success: true };
    }

    async quarantine(actor: BrainActor, options: { datasetId?: string; status?: string; limit?: number }) {
        const [datasets, policies] = await Promise.all([this.unit.brainData.listDatasets(actor.workspaceId), this.unit.brainSemantic.listPolicies(actor.workspaceId)]);
        const decisions = new Map(datasets.map(dataset => [dataset.id, evaluateAccess(policies, actor.role, BRAIN_POLICY_RESOURCES.dataset, dataset.id)]));
        if (options.datasetId && !decisions.get(options.datasetId)?.allowed) throw new AppError(404, BRAIN_ERRORS.datasetNotFound);
        const records = await this.unit.brainData.listQuarantine(actor.workspaceId, { ...options, limit: Math.min(options.limit ?? 50, BRAIN_LIMITS.listLimit) });
        return records.filter(record => decisions.get(record.datasetId)?.allowed).map(record => ({ ...record, payload: maskRecord(record.payload, decisions.get(record.datasetId)!.maskedFields) }));
    }

    async resolveQuarantine(actor: BrainActor, id: string, status: "resolved" | "dismissed") {
        const updated = await this.unit.brainData.updateQuarantine(id, actor.workspaceId, { status, resolvedBy: actor.userId, resolvedAt: new Date() });
        if (!updated) throw new AppError(404, "Quarantined record not found");
        await this.audit.record(entryFor(actor, `dataset.quarantine.${status}`, "quarantine_record", id, { metadata: { datasetId: updated.datasetId } }));
        return { ...updated, payload: {} };
    }

    /** Source-to-Gold lineage at dataset and column level (FR-DATA-012). */
    async lineage(actor: BrainActor, id: string) {
        const dataset = await this.require(actor, id);
        const [counts, runs, mappings, metrics, types, connection] = await Promise.all([
            this.unit.brainData.datasetCounts([id]),
            this.unit.brainData.listRuns(actor.workspaceId, { datasetId: id, limit: 5 }),
            this.unit.brainSemantic.listMappings(actor.workspaceId, { datasetId: id, limit: 500 }),
            this.unit.brainSemantic.listMetricsByDataset(id),
            this.unit.brainSemantic.listEntityTypes(actor.workspaceId),
            dataset.connectionId ? this.unit.connections.findInWorkspace(dataset.connectionId, actor.workspaceId) : Promise.resolve(null),
        ]);
        const typeKeys = new Map(types.map(type => [type.id, type.key]));
        const count = counts.get(id);
        return {
            dataset: datasetView(dataset, count),
            source: { connectionId: dataset.connectionId, connectionName: connection?.name ?? null, provider: connection?.provider ?? null, kind: dataset.sourceKind, object: dataset.sourceConfig },
            zones: {
                bronze: { records: count?.bronze ?? 0 },
                silver: { records: count?.silver ?? 0, quarantinedOpen: count?.quarantinedOpen ?? 0, transformationVersion: BRAIN_TRANSFORMATION_VERSION },
                gold: { publishedVersion: dataset.publishedVersion, zone: dataset.publishedZone, metrics: metrics.map(metric => ({ key: metric.key, name: metric.name, status: metric.status, version: metric.version, formula: metricFormula(metric), computedAt: metric.computedAt })) },
            },
            columns: dataset.currentSchema.map(field => ({
                field: field.name, type: field.type, protected: dataset.protectedFields.includes(field.name),
                mappings: mappings.filter(mapping => mapping.sourceField === field.name).map(mapping => ({ target: `${typeKeys.get(mapping.entityTypeId) ?? "?"}.${mapping.attributeKey}`, status: mapping.status, confidence: mapping.confidence })),
                metrics: metrics.filter(metric => [metric.valueField, metric.timeField, ...metric.dimensions, ...metric.filters.map(filter => filter.field)].includes(field.name)).map(metric => metric.key),
            })),
            recentRuns: runs,
        };
    }

    private background(actor: BrainActor, datasetId: string, trigger: typeof BRAIN_RUN_TRIGGERS.initial) {
        setImmediate(() => {
            this.pipeline.claimAndStart(actor, datasetId, trigger)
                .then(started => started.completion)
                .catch(error => logger.warn({ datasetId, error: String(error) }, "The initial sync could not start; the scheduler will retry it"));
        });
    }

    private async validate(actor: BrainActor, input: DatasetInput): Promise<string> {
        for (const field of [input.primaryKeyField, input.watermarkField, input.timeField]) {
            if (field && !isSafeIdentifier(field)) throw new AppError(400, BRAIN_ERRORS.invalidField);
        }
        if (input.syncMode === BRAIN_SYNC_MODES.incremental && !input.watermarkField) throw new AppError(400, "Incremental syncs need a watermark field.");
        const connection = await this.unit.connections.findInWorkspace(input.connectionId, actor.workspaceId);
        if (!connection) throw new AppError(404, BRAIN_ERRORS.connectionNotFound);
        // Only connections linked in the Data Layer are business sources.
        if (!await this.unit.brainData.findSourceLink(actor.workspaceId, input.connectionId)) throw new AppError(409, BRAIN_ERRORS.sourceNotLinked);
        // Opening the reader verifies the connection is live and decides which kind of source it can supply.
        const sourceKind = await this.extractor.sourceKindFor(input.connectionId, actor.workspaceId);
        if (sourceKind === BRAIN_SOURCE_KINDS.database) {
            if (!input.source.sql) throw new AppError(400, "A database dataset needs a SELECT query.");
            readOnlyStatement(input.source.sql);
        }
        return sourceKind;
    }

    private async validateRule(actor: BrainActor, input: QualityRuleInput): Promise<void> {
        if (!isSafeIdentifier(input.field)) throw new AppError(400, BRAIN_ERRORS.invalidField);
        if (input.ruleType === BRAIN_QUALITY_RULE_TYPES.pattern && !isSafePattern(String(input.config.pattern ?? ""))) {
            throw new AppError(400, "The pattern is invalid or could run too slowly. Use a simpler regular expression.");
        }
        if (input.ruleType === BRAIN_QUALITY_RULE_TYPES.referential) {
            const target = typeof input.config.datasetId === "string" ? await this.unit.brainData.findDataset(input.config.datasetId, actor.workspaceId) : null;
            if (!target) throw new AppError(400, "A referential rule must point at another dataset in this workspace.");
        }
    }

    private values(input: DatasetInput) {
        const source: Record<string, unknown> = {};
        if (input.source.sql) source.sql = input.source.sql.trim();
        if (input.source.path) source.path = input.source.path.trim();
        if (input.source.format) source.format = input.source.format;
        if (input.source.recordsPath) source.recordsPath = input.source.recordsPath.trim();
        if (input.source.table) source.table = { schema: input.source.table.schema, name: input.source.table.name };
        if (input.source.keyType) source.keyType = input.source.keyType;
        return {
            connectionId: input.connectionId, name: input.name.trim(), domain: input.domain.trim(), description: input.description ?? null, sourceConfig: source,
            primaryKeyField: input.primaryKeyField ?? null, watermarkField: input.watermarkField ?? null, timeField: input.timeField ?? null,
            syncMode: input.syncMode, syncIntervalMinutes: input.syncIntervalMinutes ?? null, classification: input.classification,
            freshnessSlaMinutes: input.freshnessSlaMinutes, qualityThreshold: input.qualityThreshold,
            driftPolicy: input.driftPolicy === BRAIN_DRIFT_POLICIES.hold ? BRAIN_DRIFT_POLICIES.hold : BRAIN_DRIFT_POLICIES.accept,
            status: BRAIN_DATASET_STATUSES.active,
        };
    }
}

