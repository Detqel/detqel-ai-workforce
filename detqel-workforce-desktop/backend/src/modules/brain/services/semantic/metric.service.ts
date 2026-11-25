import {
    BRAIN_ERRORS, BRAIN_EVENT_TYPES, BRAIN_LIMITS, BRAIN_METRIC_AGGREGATIONS, BRAIN_METRIC_STATUSES, BRAIN_POLICY_RESOURCES, BRAIN_ZONES,
} from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../../shared/logging/logger.js";
import type { BrainDataset, BrainFilter, BrainMetricDefinition, NewBrainMetricDefinition } from "../../../../shared/types/entities.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import { actorId, type BrainActor } from "../brain-types.js";
import { isSafeIdentifier } from "../data/source-extractor.js";
import type { ObservationInsert } from "../../repositories/brain-semantic.repository.js";
import { combineAccess, evaluateAccess } from "./access-policy.js";

const logger = createScopedLogger("brain-metrics");

export interface MetricInput {
    readonly key: string;
    readonly name: string;
    readonly description?: string | null;
    readonly datasetId: string;
    readonly aggregation: string;
    readonly valueField?: string | null;
    readonly timeField: string;
    readonly filters: BrainFilter[];
    readonly dimensions: string[];
    readonly timeGrain: string;
    readonly unit: string;
    readonly currency?: string | null;
    readonly higherIsBetter: boolean;
    readonly ownerUserId?: string | null;
}

const NUMERIC_TYPES = new Set(["integer", "number"]);
const TIME_TYPES = new Set(["date", "datetime"]);

/** The human-readable formula shown with every governed value (FR-BRAIN-005). */
export function metricFormula(metric: Pick<BrainMetricDefinition, "aggregation" | "valueField" | "filters" | "timeGrain" | "timeField">): string {
    const measure = metric.aggregation === BRAIN_METRIC_AGGREGATIONS.count ? "count(*)" : `${metric.aggregation}(${metric.valueField})`;
    const where = metric.filters.length ? ` where ${metric.filters.map(filter => `${filter.field} ${filter.op} ${JSON.stringify(filter.value)}`).join(" and ")}` : "";
    return `${measure}${where} by ${metric.timeGrain} of ${metric.timeField}`;
}

export function metricView(metric: BrainMetricDefinition) {
    return {
        id: metric.id, key: metric.key, name: metric.name, description: metric.description, datasetId: metric.datasetId,
        aggregation: metric.aggregation, valueField: metric.valueField, timeField: metric.timeField, filters: metric.filters,
        dimensions: metric.dimensions, timeGrain: metric.timeGrain, unit: metric.unit, currency: metric.currency,
        higherIsBetter: metric.higherIsBetter, ownerUserId: metric.ownerUserId, status: metric.status, version: metric.version,
        effectiveFrom: metric.effectiveFrom, approvedBy: metric.approvedBy, approvedAt: metric.approvedAt, computedAt: metric.computedAt,
        formula: metricFormula(metric),
    };
}

/**
 * Governed KPI definitions and their Gold computation. A definition change creates a new version that must be
 * approved again; only approved metrics are computed into Gold and used by the Intelligence Engine.
 */
export class MetricService {
    constructor(private readonly unit: IUnitOfWork, private readonly audit: BrainAuditService) {}

    async list(actor: BrainActor) {
        const [metrics, datasets, policies] = await Promise.all([
            this.unit.brainSemantic.listMetrics(actor.workspaceId),
            this.unit.brainData.listDatasets(actor.workspaceId),
            this.unit.brainSemantic.listPolicies(actor.workspaceId),
        ]);
        const datasetIds = new Set(datasets.map(dataset => dataset.id));
        return metrics.filter(metric => datasetIds.has(metric.datasetId) && combineAccess(
            evaluateAccess(policies, actor.role, BRAIN_POLICY_RESOURCES.metric, metric.id),
            evaluateAccess(policies, actor.role, BRAIN_POLICY_RESOURCES.dataset, metric.datasetId),
        ).allowed).map(metricView);
    }

    async get(actor: BrainActor, id: string): Promise<BrainMetricDefinition> {
        const metric = await this.unit.brainSemantic.findMetric(id, actor.workspaceId);
        if (!metric) throw new AppError(404, BRAIN_ERRORS.metricNotFound);
        const policies = await this.unit.brainSemantic.listPolicies(actor.workspaceId);
        const access = combineAccess(evaluateAccess(policies, actor.role, BRAIN_POLICY_RESOURCES.metric, metric.id), evaluateAccess(policies, actor.role, BRAIN_POLICY_RESOURCES.dataset, metric.datasetId));
        // A denied metric is reported exactly like a missing one, so its existence is not revealed.
        if (!access.allowed) throw new AppError(404, BRAIN_ERRORS.metricNotFound);
        return metric;
    }

    async create(actor: BrainActor, input: MetricInput) {
        const dataset = await this.datasetFor(actor.workspaceId, input.datasetId);
        this.validate(input, dataset);
        if ((await this.unit.brainSemantic.listMetrics(actor.workspaceId)).length >= BRAIN_LIMITS.maxMetrics) throw new AppError(422, "This workspace has reached its metric limit.");
        const metric = await this.unit.transaction(async repositories => {
            const created = await repositories.brainSemantic.createMetric({ workspaceId: actor.workspaceId, ...this.values(input), status: BRAIN_METRIC_STATUSES.draft, version: 1 });
            await this.audit.record(entryFor(actor, "metric.created", "metric", created.id, { metadata: { key: created.key, formula: metricFormula(created) } }), repositories);
            return created;
        });
        return metricView(metric);
    }

    async update(actor: BrainActor, id: string, input: MetricInput) {
        const existing = await this.get(actor, id);
        const dataset = await this.datasetFor(actor.workspaceId, input.datasetId);
        this.validate(input, dataset);
        const metric = await this.unit.transaction(async repositories => {
            // A changed definition is a new version and must be approved again before it is used.
            const updated = await repositories.brainSemantic.updateMetric(id, actor.workspaceId, {
                ...this.values(input), version: existing.version + 1, status: BRAIN_METRIC_STATUSES.draft,
                approvedBy: null, approvedAt: null, effectiveFrom: new Date(),
            });
            if (!updated) throw new AppError(404, BRAIN_ERRORS.metricNotFound);
            await this.audit.record(entryFor(actor, "metric.updated", "metric", id, { metadata: { previous: metricView(existing), version: updated.version } }), repositories);
            return updated;
        });
        return metricView(metric);
    }

    async approve(actor: BrainActor, id: string) {
        const existing = await this.get(actor, id);
        const approved = await this.unit.brainSemantic.updateMetric(id, actor.workspaceId, { status: BRAIN_METRIC_STATUSES.approved, approvedBy: actor.userId, approvedAt: new Date() });
        if (!approved) throw new AppError(404, BRAIN_ERRORS.metricNotFound);
        await this.audit.record(entryFor(actor, "metric.approved", "metric", id, { metadata: { version: existing.version, formula: metricFormula(existing) } }));
        await this.audit.publishQuietly(actor.workspaceId, BRAIN_EVENT_TYPES.metricApproved, { metricId: id, key: approved.key, version: approved.version }, { actorId: actorId(actor) });
        const dataset = await this.unit.brainData.findDataset(approved.datasetId, actor.workspaceId);
        if (dataset && dataset.publishedVersion > 0) await this.recompute(approved, dataset);
        return metricView((await this.unit.brainSemantic.findMetric(id, actor.workspaceId)) ?? approved);
    }

    async retire(actor: BrainActor, id: string) {
        await this.get(actor, id);
        const retired = await this.unit.brainSemantic.updateMetric(id, actor.workspaceId, { status: BRAIN_METRIC_STATUSES.retired });
        await this.audit.record(entryFor(actor, "metric.retired", "metric", id));
        return metricView(retired!);
    }

    /** Recomputes Gold observations for every approved metric of a dataset after it is published. */
    async recomputeDataset(dataset: BrainDataset): Promise<number> {
        const metrics = (await this.unit.brainSemantic.listMetricsByDataset(dataset.id)).filter(metric => metric.status === BRAIN_METRIC_STATUSES.approved);
        let total = 0;
        for (const metric of metrics) {
            try { total += await this.recompute(metric, dataset); }
            catch (error) { logger.warn({ metricId: metric.id, datasetId: dataset.id, error: String(error) }, "A metric could not be recomputed"); }
        }
        return total;
    }

    /** Totals plus one series per dimension, for the most recent periods only. */
    async recompute(metric: BrainMetricDefinition, dataset: BrainDataset): Promise<number> {
        const base = { datasetId: dataset.id, aggregation: metric.aggregation, valueField: metric.valueField, timeField: metric.timeField, grain: metric.timeGrain, filters: metric.filters };
        const totals = await this.unit.brainSemantic.aggregate({ ...base, dimension: null });
        const periods = [...new Set(totals.map(row => row.periodStart))].sort().slice(-BRAIN_LIMITS.maxObservationPeriods);
        const kept = new Set(periods);
        const rows: ObservationInsert[] = totals.filter(row => kept.has(row.periodStart)).map(row => ({ periodStart: row.periodStart, dimension: "", dimensionValue: "", value: row.value, sampleCount: row.sampleCount }));
        for (const dimension of metric.dimensions) {
            const breakdown = await this.unit.brainSemantic.aggregate({ ...base, dimension });
            rows.push(...breakdown.filter(row => kept.has(row.periodStart)).map(row => ({ periodStart: row.periodStart, dimension, dimensionValue: row.dimensionValue, value: row.value, sampleCount: row.sampleCount })));
        }
        return this.unit.brainSemantic.replaceObservations(dataset.workspaceId, metric.id, metric.version, metric.timeGrain, dataset.publishedVersion, rows);
    }

    private async datasetFor(workspaceId: string, datasetId: string): Promise<BrainDataset> {
        const dataset = await this.unit.brainData.findDataset(datasetId, workspaceId);
        if (!dataset) throw new AppError(404, BRAIN_ERRORS.datasetNotFound);
        return dataset;
    }

    private validate(input: MetricInput, dataset: BrainDataset): void {
        const fields = [input.valueField, input.timeField, ...input.dimensions, ...input.filters.map(filter => filter.field)].filter((field): field is string => Boolean(field));
        if (fields.some(field => !isSafeIdentifier(field))) throw new AppError(400, BRAIN_ERRORS.invalidField);
        if (input.aggregation !== BRAIN_METRIC_AGGREGATIONS.count && !input.valueField) throw new AppError(400, BRAIN_ERRORS.metricFieldMissing);
        if (!dataset.currentSchema.length) return;
        const types = new Map(dataset.currentSchema.map(field => [field.name, field.type]));
        const missing = fields.filter(field => !types.has(field));
        if (missing.length) throw new AppError(400, `These fields are not in the dataset schema: ${[...new Set(missing)].join(", ")}.`);
        if (!TIME_TYPES.has(types.get(input.timeField)!)) throw new AppError(400, "The time field must hold dates or timestamps.");
        const numeric = [BRAIN_METRIC_AGGREGATIONS.sum, BRAIN_METRIC_AGGREGATIONS.avg, BRAIN_METRIC_AGGREGATIONS.min, BRAIN_METRIC_AGGREGATIONS.max] as string[];
        if (numeric.includes(input.aggregation) && !NUMERIC_TYPES.has(types.get(input.valueField!)!)) throw new AppError(400, "This aggregation needs a numeric value field.");
    }

    private values(input: MetricInput): Omit<NewBrainMetricDefinition, "workspaceId"> {
        return {
            key: input.key, name: input.name, description: input.description ?? null, datasetId: input.datasetId, aggregation: input.aggregation,
            valueField: input.aggregation === BRAIN_METRIC_AGGREGATIONS.count ? null : input.valueField ?? null, timeField: input.timeField,
            filters: input.filters, dimensions: [...new Set(input.dimensions)], timeGrain: input.timeGrain, unit: input.unit,
            currency: input.currency ?? null, higherIsBetter: input.higherIsBetter, ownerUserId: input.ownerUserId ?? null,
        };
    }
}

export const isGoldReady = (dataset: BrainDataset) => dataset.publishedZone === BRAIN_ZONES.gold && dataset.publishedVersion > 0;
