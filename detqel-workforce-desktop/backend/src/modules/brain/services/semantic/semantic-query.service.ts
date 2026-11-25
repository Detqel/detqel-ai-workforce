import {
    BRAIN_ERRORS, BRAIN_FRESHNESS_STATES, BRAIN_LIMITS, BRAIN_METRIC_STATUSES, BRAIN_POLICY_RESOURCES, type BrainTimeGrain,
} from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import type { BrainAccessPolicy, BrainDataset, BrainFilter, BrainMetricDefinition } from "../../../../shared/types/entities.js";
import { roleAllows } from "../../../workspaces/services/workspace-access.service.js";
import type { BrainActor, BrainEvidence } from "../brain-types.js";
import { freshnessState } from "../data/quality-engine.js";
import { combineAccess, evaluateAccess, type AccessDecision } from "./access-policy.js";
import { isGoldReady, metricFormula } from "./metric.service.js";

export interface SeriesPoint { readonly period: string; readonly value: number; readonly sampleCount: number }
export interface MetricQuery {
    readonly metricKey: string;
    readonly grain?: BrainTimeGrain;
    readonly periods?: number;
    readonly from?: string;
    readonly to?: string;
    readonly dimension?: string;
    readonly dimensionValue?: string;
}
export interface ResolvedMetric {
    readonly metric: BrainMetricDefinition;
    readonly dataset: BrainDataset;
    readonly access: AccessDecision;
}
export interface MetricQueryResult {
    readonly metric: { key: string; name: string; unit: string; currency: string | null; aggregation: string; status: string; version: number; formula: string; higherIsBetter: boolean; dimensions: string[] };
    readonly series: SeriesPoint[];
    readonly breakdown: Array<{ value: string; total: number; share: number }> | null;
    readonly dataset: { id: string; name: string; domain: string; version: number; zone: string; lastSuccessAt: string | null; freshness: string };
    readonly plan: { source: "gold" | "silver"; grain: string; dimension: string | null; filters: BrainFilter[]; rowPolicyApplied: boolean };
    readonly evidence: BrainEvidence[];
    readonly caveats: string[];
}

/**
 * The authorised semantic query interface (FR-BRAIN-007). Every result is resolved through the metric's governed
 * definition and the caller's row and column policies before any value is returned. Precomputed Gold values are
 * used only when no row policy narrows the caller's view; otherwise the value is computed from the permitted
 * Silver rows, so an aggregate can never reveal rows the caller may not see.
 */
export class SemanticQueryService {
    constructor(private readonly unit: IUnitOfWork) {}

    async resolve(actor: BrainActor, metricKey: string, policies?: BrainAccessPolicy[]): Promise<ResolvedMetric> {
        const metric = await this.unit.brainSemantic.findMetricByKey(actor.workspaceId, metricKey);
        const notFound = new AppError(404, BRAIN_ERRORS.metricNotFound);
        if (!metric || metric.status === BRAIN_METRIC_STATUSES.retired) throw notFound;
        const dataset = await this.unit.brainData.findDataset(metric.datasetId, actor.workspaceId);
        if (!dataset) throw notFound;
        const rules = policies ?? await this.unit.brainSemantic.listPolicies(actor.workspaceId);
        const access = combineAccess(
            evaluateAccess(rules, actor.role, BRAIN_POLICY_RESOURCES.metric, metric.id),
            evaluateAccess(rules, actor.role, BRAIN_POLICY_RESOURCES.dataset, dataset.id),
        );
        if (!access.allowed) throw notFound;
        // Drafts are previews for the people who govern them; everyone else sees approved definitions only.
        if (metric.status !== BRAIN_METRIC_STATUSES.approved && !(actor.role === "system" || roleAllows(actor.role, "write"))) throw notFound;
        return { metric, dataset, access };
    }

    /** Every metric the caller may query, evaluated in one pass with the same rules as `resolve`. */
    async visibleMetrics(actor: BrainActor): Promise<BrainMetricDefinition[]> {
        const [metrics, datasets, policies] = await Promise.all([
            this.unit.brainSemantic.listMetrics(actor.workspaceId),
            this.unit.brainData.listDatasets(actor.workspaceId),
            this.unit.brainSemantic.listPolicies(actor.workspaceId),
        ]);
        const datasetIds = new Set(datasets.map(dataset => dataset.id));
        const previews = actor.role === "system" || roleAllows(actor.role, "write");
        return metrics.filter(metric => metric.status !== BRAIN_METRIC_STATUSES.retired && datasetIds.has(metric.datasetId)
            && (metric.status === BRAIN_METRIC_STATUSES.approved || previews)
            && combineAccess(
                evaluateAccess(policies, actor.role, BRAIN_POLICY_RESOURCES.metric, metric.id),
                evaluateAccess(policies, actor.role, BRAIN_POLICY_RESOURCES.dataset, metric.datasetId),
            ).allowed);
    }

    async query(actor: BrainActor, query: MetricQuery): Promise<MetricQueryResult> {
        const { metric, dataset, access } = await this.resolve(actor, query.metricKey);
        const grain = query.grain ?? (metric.timeGrain as BrainTimeGrain);
        const periods = Math.min(Math.max(query.periods ?? 24, 1), BRAIN_LIMITS.maxObservationPeriods);
        const dimension = query.dimension ?? null;
        if (dimension && !metric.dimensions.includes(dimension)) throw new AppError(400, `"${dimension}" is not a defined dimension of this metric.`);
        if (dimension && access.maskedFields.includes(dimension)) throw new AppError(403, "This breakdown is not available to you.");
        const caveats: string[] = [];
        const filters: BrainFilter[] = dimension && query.dimensionValue !== undefined ? [{ field: dimension, op: "eq", value: query.dimensionValue }] : [];
        const useGold = !access.rowFilters.length && grain === metric.timeGrain && metric.status === BRAIN_METRIC_STATUSES.approved && Boolean(metric.computedAt) && isGoldReady(dataset);
        let series: SeriesPoint[];
        let breakdown: MetricQueryResult["breakdown"] = null;
        if (useGold) {
            const rows = await this.unit.brainSemantic.listObservations(metric.id, {
                grain, dimension: dimension && query.dimensionValue !== undefined ? dimension : "", from: query.from, to: query.to, limit: periods * (dimension && query.dimensionValue === undefined ? 1 : 50),
            });
            const matching = dimension && query.dimensionValue !== undefined ? rows.filter(row => row.dimensionValue === query.dimensionValue) : rows;
            series = matching.slice(0, periods).map(row => ({ period: row.periodStart, value: row.value, sampleCount: row.sampleCount })).reverse();
            if (dimension && query.dimensionValue === undefined && series.length) {
                const latest = series[series.length - 1].period;
                const parts = await this.unit.brainSemantic.listObservations(metric.id, { grain, dimension, from: latest, to: latest, limit: 200 });
                breakdown = shares(parts.map(row => ({ value: row.dimensionValue, total: row.value })));
            }
        } else {
            const base = { datasetId: dataset.id, aggregation: metric.aggregation, valueField: metric.valueField, timeField: metric.timeField, grain, filters: [...metric.filters, ...filters], from: query.from, to: query.to };
            const totals = await this.unit.brainSemantic.aggregate({ ...base, dimension: null }, access.rowFilters);
            series = totals.slice(-periods).map(row => ({ period: row.periodStart, value: row.value, sampleCount: row.sampleCount }));
            if (dimension && query.dimensionValue === undefined && series.length) {
                const latest = series[series.length - 1].period;
                const rows = await this.unit.brainSemantic.aggregate({ ...base, dimension }, access.rowFilters);
                breakdown = shares(rows.filter(row => row.periodStart === latest).map(row => ({ value: row.dimensionValue, total: row.value })));
            }
            if (access.rowFilters.length) caveats.push("Results include only the records you are permitted to see.");
            if (!isGoldReady(dataset)) caveats.push("This dataset has not been published to Gold; values come from validated Silver records.");
        }
        if (metric.status !== BRAIN_METRIC_STATUSES.approved) caveats.push("This metric definition is a draft and is not yet approved.");
        const freshness = freshnessState(dataset);
        if (freshness !== BRAIN_FRESHNESS_STATES.validated) caveats.push(freshnessCaveat(freshness));
        return {
            metric: { key: metric.key, name: metric.name, unit: metric.unit, currency: metric.currency, aggregation: metric.aggregation, status: metric.status, version: metric.version, formula: metricFormula(metric), higherIsBetter: metric.higherIsBetter, dimensions: metric.dimensions.filter(item => !access.maskedFields.includes(item)) },
            series,
            breakdown,
            dataset: { id: dataset.id, name: dataset.name, domain: dataset.domain, version: dataset.publishedVersion, zone: dataset.publishedZone, lastSuccessAt: dataset.lastSuccessAt?.toISOString() ?? null, freshness },
            plan: { source: useGold ? "gold" : "silver", grain, dimension, filters: [...metric.filters, ...filters], rowPolicyApplied: access.rowFilters.length > 0 },
            evidence: [
                { type: "metric", title: metric.name, reference: `metric:${metric.key}@v${metric.version}`, version: metric.version },
                { type: "dataset", title: dataset.name, reference: `dataset:${dataset.id}@v${dataset.publishedVersion}`, freshness: dataset.lastSuccessAt?.toISOString() ?? null, version: dataset.publishedVersion },
            ],
            caveats,
        };
    }

    /**
     * Per-period values of one dimension across a range of periods, under the same policy checks as `query`. Used
     * by root-cause analysis and optimisation, which compare dimension values over time.
     */
    async breakdownSeries(actor: BrainActor, metricKey: string, dimension: string, fromPeriod: string, toPeriod: string): Promise<BreakdownRow[]> {
        const { metric, dataset, access } = await this.resolve(actor, metricKey);
        if (!metric.dimensions.includes(dimension)) throw new AppError(400, `"${dimension}" is not a defined dimension of this metric.`);
        if (access.maskedFields.includes(dimension)) throw new AppError(403, "This breakdown is not available to you.");
        const gold = !access.rowFilters.length && metric.status === BRAIN_METRIC_STATUSES.approved && Boolean(metric.computedAt) && isGoldReady(dataset);
        if (gold) {
            const rows = await this.unit.brainSemantic.listObservations(metric.id, { grain: metric.timeGrain, dimension, from: fromPeriod, to: toPeriod, limit: 5_000 });
            return rows.map(row => ({ period: row.periodStart, value: row.dimensionValue, total: row.value }));
        }
        const rows = await this.unit.brainSemantic.aggregate({ datasetId: dataset.id, aggregation: metric.aggregation, valueField: metric.valueField, timeField: metric.timeField, grain: metric.timeGrain, filters: metric.filters, dimension }, access.rowFilters);
        return rows.filter(row => row.periodStart >= fromPeriod && row.periodStart <= toPeriod).map(row => ({ period: row.periodStart, value: row.dimensionValue, total: row.value }));
    }
}

export interface BreakdownRow { readonly period: string; readonly value: string; readonly total: number }

function shares(rows: Array<{ value: string; total: number }>): Array<{ value: string; total: number; share: number }> {
    const sum = rows.reduce((total, row) => total + Math.abs(row.total), 0);
    return rows.sort((a, b) => b.total - a.total).slice(0, 20).map(row => ({ ...row, share: sum ? row.total / sum : 0 }));
}

export function freshnessCaveat(state: string): string {
    switch (state) {
        case BRAIN_FRESHNESS_STATES.missing: return "The source dataset has never completed a validated load.";
        case BRAIN_FRESHNESS_STATES.stale: return "The source dataset is older than its freshness SLA.";
        case BRAIN_FRESHNESS_STATES.delayed: return "The source dataset's scheduled sync is behind.";
        case BRAIN_FRESHNESS_STATES.partial: return "The latest load was partial; some records were held back by quality checks.";
        default: return "";
    }
}
