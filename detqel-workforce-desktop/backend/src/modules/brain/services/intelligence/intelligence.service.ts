import { randomUUID } from "node:crypto";
import {
    BRAIN_ANALYSIS_KINDS, BRAIN_ANALYSIS_STATUSES, BRAIN_ERRORS, BRAIN_EVENT_TYPES, BRAIN_LIMITS, BRAIN_METHODS, BRAIN_METRIC_STATUSES,
    BRAIN_SCENARIO_ASSUMPTION_TYPES, BRAIN_SCENARIO_STATUSES, type BrainAnalysisKind, type BrainTimeGrain,
} from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import type { BrainAnalysisRun } from "../../../../shared/types/entities.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import { actorId, formatPercent, formatValue, hashOf, round, type BrainActor, type BrainHeadline, type BrainStatement } from "../brain-types.js";
import type { MetricQueryResult, SemanticQueryService } from "../semantic/semantic-query.service.js";
import { METHOD_REGISTRY, methodVersion } from "./method-registry.js";
import { forecastSeries, isIncomplete, regularize, relativeUncertainty, type ForecastMethodKey, type ForecastPoint, type SeriesValue } from "./methods/forecasting.js";
import { allocate, type AllocationOption } from "./methods/optimisation.js";
import { forecastRecommendations, optimisationRecommendations, rootCauseRecommendations, simulationRecommendations } from "./methods/recommendations.js";
import { decompose, type DriverInput } from "./methods/root-cause.js";
import { simulate, validateAssumptions, type ScenarioAssumption, type ScenarioConstraint } from "./methods/simulation.js";

export interface RunContext { readonly taskId?: string | null; readonly correlationId?: string }
export interface ForecastRequest { readonly metricKey: string; readonly horizon?: number; readonly method?: ForecastMethodKey; readonly confidence?: number; readonly dimension?: string; readonly dimensionValue?: string; readonly history?: number }
export interface SimulationRequest { readonly scenarioId?: string; readonly metricKey?: string; readonly horizon?: number; readonly assumptions?: ScenarioAssumption[]; readonly baselineRunId?: string; readonly save?: { readonly name: string; readonly description?: string | null } }
export interface OptimisationRequest { readonly spendMetricKey?: string; readonly returnMetricKey?: string; readonly dimension?: string; readonly periods?: number; readonly budget?: number; readonly options?: AllocationOption[] }
export interface RootCauseRequest { readonly metricKey: string; readonly dimension?: string }

/** Backtest error above which a forecast is withheld rather than shown as an estimate (FR-INT-006). */
const MAX_SUPPORTED_MAPE = 60;
const MODERATE_MAPE = 25;

type MetricInfo = MetricQueryResult["metric"];
const ICONS: Record<string, string> = { forecast: "trending-up", simulation: "flask", optimisation: "sliders", root_cause: "search" };

export function runView(run: BrainAnalysisRun) {
    const snapshot = run.inputSnapshot as Record<string, unknown>;
    return {
        id: run.id, kind: run.kind, status: run.status, method: { key: run.methodKey, version: run.methodVersion },
        metricId: run.metricId, scenarioId: run.scenarioId, baselineRunId: run.baselineRunId, inputs: run.inputs,
        snapshot: { points: Array.isArray(snapshot.series) ? snapshot.series.length : Array.isArray(snapshot.baseline) ? snapshot.baseline.length : null, metricVersion: snapshot.metricVersion ?? null, datasetVersion: snapshot.datasetVersion ?? null, observationsHash: snapshot.observationsHash ?? null, window: snapshot.window ?? null },
        result: run.result, warnings: run.warnings, reproducibilityHash: run.reproducibilityHash, requestedBy: run.requestedBy, taskId: run.taskId, createdAt: run.createdAt,
    };
}
export type AnalysisRunView = ReturnType<typeof runView>;

function describeAssumption(assumption: ScenarioAssumption, unit: string, currency: string | null): string {
    const from = assumption.startPeriod && assumption.startPeriod > 1 ? ` from period ${assumption.startPeriod}` : "";
    switch (assumption.type) {
        case BRAIN_SCENARIO_ASSUMPTION_TYPES.levelPercent: return `${assumption.label}: level ${formatPercent(assumption.value)}${from}.`;
        case BRAIN_SCENARIO_ASSUMPTION_TYPES.growthPercent: return `${assumption.label}: ${formatPercent(assumption.value)} extra growth per period${from}.`;
        case BRAIN_SCENARIO_ASSUMPTION_TYPES.rampPercent: return `${assumption.label}: ramps to ${formatPercent(assumption.value)} over ${assumption.rampPeriods} periods${from}.`;
        default: return `${assumption.label}: ${formatValue(assumption.value, unit, currency)} per period${from}.`;
    }
}

const completeSeries = (series: SeriesValue[], grain: BrainTimeGrain): { series: SeriesValue[]; excluded: boolean } =>
    series.length && isIncomplete(series[series.length - 1].period, grain) ? { series: series.slice(0, -1), excluded: true } : { series, excluded: false };

/**
 * The Intelligence Engine (PRD 7). Numbers come only from the deterministic methods in the registry, never from a
 * model. Every run records the tenant, requester, data snapshot, metric and dataset versions, method version and
 * time (FR-INT-001), labels its statements as facts, estimates, assumptions, recommendations or caveats
 * (FR-INT-003), and can be recomputed from its stored snapshot to prove it is reproducible.
 */
export class IntelligenceService {
    constructor(private readonly unit: IUnitOfWork, private readonly semantic: SemanticQueryService, private readonly audit: BrainAuditService) {}

    methods() { return METHOD_REGISTRY; }

    async forecast(actor: BrainActor, request: ForecastRequest, context: RunContext = {}): Promise<AnalysisRunView> {
        const horizon = Math.min(Math.max(request.horizon ?? 3, 1), BRAIN_LIMITS.maxForecastHorizon);
        const confidence = [0.8, 0.9, 0.95].includes(request.confidence ?? 0.8) ? request.confidence ?? 0.8 : 0.8;
        const method = request.method ?? "auto";
        const query = await this.governedQuery(actor, { metricKey: request.metricKey, periods: request.history ?? 36, dimension: request.dimensionValue !== undefined ? request.dimension : undefined, dimensionValue: request.dimensionValue });
        const grain = query.plan.grain as BrainTimeGrain;
        const regular = regularize(query.series.map(point => ({ period: point.period, value: point.value })), grain, query.metric.aggregation);
        const complete = completeSeries(regular.series, grain);
        const series = complete.series;
        const inputs = { metricKey: request.metricKey, horizon, method, confidence, dimension: request.dimension ?? null, dimensionValue: request.dimensionValue ?? null };
        const snapshot = { series, grain, aggregation: query.metric.aggregation, metricVersion: query.metric.version, datasetVersion: query.dataset.version, datasetId: query.dataset.id, observationsHash: hashOf(series), window: series.length ? { from: series[0].period, to: series[series.length - 1].period } : null, source: query.plan.source };
        const caveats = [...query.caveats];
        if (regular.filled) caveats.push(`${regular.filled} period(s) without records were filled ${["sum", "count"].includes(query.metric.aggregation) ? "with zero" : "by interpolation"}.`);
        if (complete.excluded) caveats.push("The current period is still in progress and was excluded from training.");
        const output = forecastSeries(series, grain, horizon, method, confidence);
        const metricId = await this.metricId(actor, request.metricKey);
        if ("insufficient" in output) return this.insufficient(actor, BRAIN_ANALYSIS_KINDS.forecast, BRAIN_METHODS.linearTrend, metricId, inputs, snapshot, output.insufficient, caveats, context);
        if (output.evaluation.mape !== null && output.evaluation.mape > MAX_SUPPORTED_MAPE) {
            return this.insufficient(actor, BRAIN_ANALYSIS_KINDS.forecast, output.method, metricId, inputs, snapshot, `The best approved method's backtest error is ${output.evaluation.mape}%, too high to support a forecast. Add history or fix data gaps first.`, caveats, context);
        }
        const last = series[series.length - 1];
        const next = output.points[0];
        const additive = ["sum", "count"].includes(query.metric.aggregation);
        const horizonTotal = additive ? round(output.points.reduce((total, point) => total + point.value, 0), 2) : null;
        const changePercent = last.value ? round((next.value - last.value) / Math.abs(last.value) * 100, 2) : null;
        const uncertaintyPercent = relativeUncertainty(output.points);
        const fmt = (value: number) => formatValue(value, query.metric.unit, query.metric.currency);
        if (output.clampedAtZero) caveats.push("The model's lower bound was limited to zero because this metric has never been negative.");
        if (output.evaluation.mape !== null && output.evaluation.mape > MODERATE_MAPE) caveats.push(`Backtest error is ${output.evaluation.mape}%, so treat the estimate as indicative.`);
        if (output.evaluation.mape === null) caveats.push("There was too little history to backtest the model's accuracy.");
        const statements: BrainStatement[] = [
            { kind: "fact", text: `${query.metric.name} was ${fmt(last.value)} in the period starting ${last.period} (${query.dataset.name} v${query.dataset.version}).` },
            { kind: "estimate", text: `Forecast for the period starting ${next.period}: ${fmt(next.value)}, ${Math.round(confidence * 100)}% interval ${fmt(next.lower)} to ${fmt(next.upper)}.` },
            ...(horizonTotal !== null && horizon > 1 ? [{ kind: "estimate" as const, text: `Total over the next ${horizon} periods: ${fmt(horizonTotal)}.` }] : []),
            { kind: "assumption", text: `The ${output.method.key}@${output.method.version} model assumes the recent level and trend continue; it was trained on ${series.length} periods.` },
            ...caveats.filter(Boolean).map(text => ({ kind: "caveat" as const, text })),
        ];
        const headline: BrainHeadline = {
            value: next.value, label: `Forecast ${query.metric.name} (${next.period})`, unit: query.metric.unit, currency: query.metric.currency,
            delta: changePercent, deltaLabel: `vs ${last.period}`, deltaIsPercent: true, icon: ICONS.forecast,
        };
        const result = {
            summary: { lastObserved: last, next, horizonTotal, changePercent, uncertaintyPercent },
            points: output.points, history: series.slice(-24), evaluation: output.evaluation, parameters: output.parameters, confidenceLevel: confidence,
            statements, headline, recommendations: forecastRecommendations(query.metric, { changePercent, nextValue: next.value, mape: output.evaluation.mape }),
            resultHash: hashOf({ points: output.points, method: output.method }),
            metric: { key: query.metric.key, name: query.metric.name, unit: query.metric.unit, currency: query.metric.currency },
        };
        return this.persist(actor, { kind: BRAIN_ANALYSIS_KINDS.forecast, metricId, method: output.method, status: BRAIN_ANALYSIS_STATUSES.succeeded, inputs, snapshot, result, warnings: caveats.filter(Boolean) }, context);
    }

    async simulate(actor: BrainActor, request: SimulationRequest, context: RunContext = {}): Promise<AnalysisRunView> {
        let metricKey = request.metricKey;
        let assumptions = request.assumptions ?? [];
        let horizon = request.horizon ?? 3;
        let scenarioId: string | null = null;
        if (request.scenarioId) {
            const scenario = await this.unit.brainIntelligence.findScenario(request.scenarioId, actor.workspaceId);
            if (!scenario) throw new AppError(404, BRAIN_ERRORS.scenarioNotFound);
            const metric = await this.unit.brainSemantic.findMetric(scenario.metricId, actor.workspaceId);
            if (!metric) throw new AppError(404, BRAIN_ERRORS.metricNotFound);
            metricKey = metric.key;
            assumptions = scenario.assumptions as unknown as ScenarioAssumption[];
            horizon = scenario.horizon;
            scenarioId = scenario.id;
        }
        if (!metricKey) throw new AppError(400, "Choose a metric or a saved scenario to simulate.");
        horizon = Math.min(Math.max(horizon, 1), BRAIN_LIMITS.maxForecastHorizon);
        const baseline = await this.baseline(actor, metricKey, horizon, request.baselineRunId, context);
        const metricId = await this.metricId(actor, metricKey);
        const query = await this.governedQuery(actor, { metricKey, periods: 2 });
        const inputs = { metricKey, horizon, assumptions, scenarioId, baselineRunId: baseline.run.id };
        if (baseline.run.status !== BRAIN_ANALYSIS_STATUSES.succeeded) {
            return this.insufficient(actor, BRAIN_ANALYSIS_KINDS.simulation, BRAIN_METHODS.driverSimulation, metricId, inputs, { baseline: [] }, `The baseline forecast could not be produced: ${String((baseline.run.result as Record<string, unknown>).reason ?? "insufficient data")}`, [], context, baseline.run.id);
        }
        const issues = validateAssumptions(assumptions, horizon, baseline.points, query.metric.unit);
        if (issues.length) throw new AppError(400, "The scenario assumptions are not valid.", { issues });
        const constraints = await this.constraintsFor(actor.workspaceId, metricKey);
        const output = simulate(baseline.points, assumptions, constraints);
        const fmt = (value: number) => formatValue(value, query.metric.unit, query.metric.currency);
        const top = output.sensitivity[0];
        const caveats = [
            ...(output.violations.length ? [`${output.violations.length} period(s) break a business constraint: ${[...new Set(output.violations.map(item => item.constraint))].join("; ")}.`] : []),
            ...query.caveats,
        ];
        const statements: BrainStatement[] = [
            { kind: "estimate", text: `Baseline over ${horizon} periods (forecast run ${baseline.run.id.slice(0, 8)}): ${fmt(output.totals.baseline)}.` },
            { kind: "estimate", text: `Scenario over the same horizon: ${fmt(output.totals.scenario)} (${output.totals.deltaPercent === null ? fmt(output.totals.delta) : formatPercent(output.totals.deltaPercent)} vs baseline), range ${fmt(output.totals.scenarioLower)} to ${fmt(output.totals.scenarioUpper)}.` },
            ...assumptions.map(assumption => ({ kind: "assumption" as const, text: describeAssumption(assumption, query.metric.unit, query.metric.currency) })),
            ...(top ? [{ kind: "caveat" as const, text: `The outcome is most sensitive to "${top.label}": halving or adding half again moves the total between ${fmt(top.low)} and ${fmt(top.high)}.` }] : []),
            ...caveats.map(text => ({ kind: "caveat" as const, text })),
        ];
        const headline: BrainHeadline = { value: output.totals.scenario, label: `Scenario ${query.metric.name}, next ${horizon} periods`, unit: query.metric.unit, currency: query.metric.currency, delta: output.totals.deltaPercent, deltaLabel: "vs baseline", deltaIsPercent: true, icon: ICONS.simulation };
        if (request.save?.name) scenarioId = await this.saveScenario(actor, { scenarioId, name: request.save.name, description: request.save.description ?? null, metricId: metricId!, horizon, assumptions });
        const result = {
            ...output, statements, headline,
            recommendations: simulationRecommendations(query.metric, output.totals, top?.label ?? null, output.violations.length),
            resultHash: hashOf({ periods: output.periods, totals: output.totals }),
            metric: { key: query.metric.key, name: query.metric.name, unit: query.metric.unit, currency: query.metric.currency },
        };
        const view = await this.persist(actor, { kind: BRAIN_ANALYSIS_KINDS.simulation, metricId, scenarioId, baselineRunId: baseline.run.id, method: BRAIN_METHODS.driverSimulation, status: BRAIN_ANALYSIS_STATUSES.succeeded, inputs: { ...inputs, scenarioId }, snapshot: { baseline: baseline.points, constraints, metricVersion: query.metric.version, datasetVersion: query.dataset.version }, result, warnings: caveats }, context);
        if (scenarioId) await this.unit.brainIntelligence.updateScenario(scenarioId, actor.workspaceId, { lastRunId: view.id });
        return view;
    }

    async optimise(actor: BrainActor, request: OptimisationRequest, context: RunContext = {}): Promise<AnalysisRunView> {
        let options = request.options ?? [];
        let window: { from: string; to: string } | null = null;
        let metric: MetricInfo | null = null;
        let metricId: string | null = null;
        if (!options.length) {
            if (!request.spendMetricKey || !request.returnMetricKey || !request.dimension) throw new AppError(400, "Optimisation needs explicit options, or a spend metric, a return metric and a shared dimension.");
            const periods = Math.min(Math.max(request.periods ?? 3, 1), 12);
            const spendQuery = await this.governedQuery(actor, { metricKey: request.spendMetricKey, periods: periods + 1 });
            const returnQuery = await this.governedQuery(actor, { metricKey: request.returnMetricKey, periods: periods + 1 });
            const complete = completeSeries(spendQuery.series.map(point => ({ period: point.period, value: point.value })), spendQuery.plan.grain as BrainTimeGrain).series.slice(-periods);
            if (!complete.length) return this.insufficient(actor, BRAIN_ANALYSIS_KINDS.optimisation, BRAIN_METHODS.marginalAllocation, null, { ...request }, {}, BRAIN_ERRORS.insufficientData, spendQuery.caveats, context);
            window = { from: complete[0].period, to: complete[complete.length - 1].period };
            const sum = (rows: Array<{ value: string; total: number }>) => rows.reduce((map, row) => map.set(row.value, (map.get(row.value) ?? 0) + row.total), new Map<string, number>());
            const spend = sum(await this.semantic.breakdownSeries(actor, request.spendMetricKey, request.dimension, window.from, window.to));
            const returns = sum(await this.semantic.breakdownSeries(actor, request.returnMetricKey, request.dimension, window.from, window.to));
            options = [...spend.entries()].filter(([key]) => returns.has(key)).slice(0, BRAIN_LIMITS.maxOptimisationOptions).map(([key, value]) => ({
                key, label: key, currentSpend: round(value, 2), currentReturn: round(returns.get(key) ?? 0, 2), min: round(value * 0.5, 2), max: round(value * 2, 2),
            }));
            metric = returnQuery.metric;
            metricId = await this.metricId(actor, request.returnMetricKey);
        }
        const budget = request.budget ?? round(options.reduce((total, option) => total + option.currentSpend, 0), 2);
        const inputs = { ...request, budget };
        const snapshot = { options, budget, window };
        if (!options.length) return this.insufficient(actor, BRAIN_ANALYSIS_KINDS.optimisation, BRAIN_METHODS.marginalAllocation, metricId, inputs, snapshot, "No dimension value has both spend and return data in the window.", [], context);
        const output = allocate(options, budget);
        const unit = metric?.unit ?? "currency";
        const currency = metric?.currency ?? null;
        const fmt = (value: number) => formatValue(value, unit, currency);
        const statements: BrainStatement[] = [
            { kind: "fact", text: `Current allocation of ${fmt(budget)} returned ${fmt(output.totals.currentReturn)}${window ? ` between ${window.from} and ${window.to}` : ""}.` },
            { kind: "estimate", text: `The recommended allocation returns ${fmt(output.totals.expectedReturn)} (${output.totals.upliftPercent === null ? fmt(output.totals.uplift) : formatPercent(output.totals.upliftPercent)}).` },
            ...output.assumptions.map(text => ({ kind: "assumption" as const, text })),
            ...(request.options ? [] : [{ kind: "assumption" as const, text: "Each option may move between half and double its current spend." }]),
            { kind: output.feasibility.status === "feasible" ? "fact" as const : "caveat" as const, text: output.feasibility.message },
        ];
        const headline: BrainHeadline = { value: output.totals.expectedReturn, label: "Modelled return after reallocation", unit, currency, delta: output.totals.upliftPercent, deltaLabel: "vs current allocation", deltaIsPercent: true, icon: ICONS.optimisation };
        const result = {
            ...output, statements, headline, resultHash: hashOf({ allocations: output.allocations, totals: output.totals }),
            recommendations: optimisationRecommendations(output.totals, output.allocations.map(item => ({ label: item.label, change: item.change })), unit, currency),
            metric: metric ? { key: metric.key, name: metric.name, unit: metric.unit, currency: metric.currency } : null,
        };
        return this.persist(actor, { kind: BRAIN_ANALYSIS_KINDS.optimisation, metricId, method: BRAIN_METHODS.marginalAllocation, status: output.feasibility.status === "infeasible" ? BRAIN_ANALYSIS_STATUSES.failed : BRAIN_ANALYSIS_STATUSES.succeeded, inputs, snapshot, result, warnings: output.feasibility.status === "feasible" ? [] : [output.feasibility.message] }, context);
    }

    async rootCause(actor: BrainActor, request: RootCauseRequest, context: RunContext = {}): Promise<AnalysisRunView> {
        const query = await this.governedQuery(actor, { metricKey: request.metricKey, periods: 4 });
        const metricId = await this.metricId(actor, request.metricKey);
        const grain = query.plan.grain as BrainTimeGrain;
        const series = completeSeries(regularize(query.series.map(point => ({ period: point.period, value: point.value })), grain, query.metric.aggregation).series, grain).series;
        const dimension = request.dimension ?? query.metric.dimensions[0] ?? null;
        const inputs = { metricKey: request.metricKey, dimension };
        if (series.length < 2) return this.insufficient(actor, BRAIN_ANALYSIS_KINDS.rootCause, BRAIN_METHODS.varianceDecomposition, metricId, inputs, {}, "Root-cause analysis needs two completed periods of validated data.", query.caveats, context);
        const [previous, current] = series.slice(-2);
        let rows: DriverInput[] = [];
        if (dimension) {
            const breakdown = await this.semantic.breakdownSeries(actor, request.metricKey, dimension, previous.period, current.period);
            const values = new Map<string, { current: number; previous: number }>();
            for (const row of breakdown) {
                const entry = values.get(row.value) ?? { current: 0, previous: 0 };
                if (row.period === current.period) entry.current += row.total;
                else if (row.period === previous.period) entry.previous += row.total;
                values.set(row.value, entry);
            }
            rows = [...values.entries()].map(([value, entry]) => ({ value, ...entry }));
        }
        const output = decompose(rows, query.metric.aggregation, { current: current.value, previous: previous.value });
        const fmt = (value: number) => formatValue(value, query.metric.unit, query.metric.currency);
        const caveats = [...output.caveats, ...query.caveats, ...(dimension ? [] : ["The metric has no dimensions, so only the total change is shown."])];
        const statements: BrainStatement[] = [
            { kind: "fact", text: `${query.metric.name} moved from ${fmt(previous.value)} (${previous.period}) to ${fmt(current.value)} (${current.period}), ${output.deltaPercent === null ? fmt(output.delta) : formatPercent(output.deltaPercent)}.` },
            ...output.drivers.slice(0, 3).filter(driver => driver.delta !== 0).map(driver => ({ kind: "fact" as const, text: `${dimension} "${driver.value}": ${fmt(driver.previous)} to ${fmt(driver.current)}, ${driver.contributionPercent}% of the change.` })),
            ...(output.drivers.length && output.concentration >= 70 ? [{ kind: "estimate" as const, text: `The change is concentrated: the top three ${dimension} values explain ${output.concentration}% of the movement.` }] : []),
            ...caveats.map(text => ({ kind: "caveat" as const, text })),
        ];
        const headline: BrainHeadline = { value: current.value, label: `${query.metric.name} (${current.period})`, unit: query.metric.unit, currency: query.metric.currency, delta: output.deltaPercent, deltaLabel: `vs ${previous.period}`, deltaIsPercent: true, icon: ICONS.root_cause };
        const result = {
            ...output, dimension, periods: { previous: previous.period, current: current.period }, statements, headline,
            recommendations: rootCauseRecommendations(query.metric, output.drivers, dimension),
            resultHash: hashOf({ drivers: output.drivers, delta: output.delta }),
            metric: { key: query.metric.key, name: query.metric.name, unit: query.metric.unit, currency: query.metric.currency },
        };
        return this.persist(actor, { kind: BRAIN_ANALYSIS_KINDS.rootCause, metricId, method: BRAIN_METHODS.varianceDecomposition, status: BRAIN_ANALYSIS_STATUSES.succeeded, inputs, snapshot: { rows, aggregation: query.metric.aggregation, totals: { current: current.value, previous: previous.value }, metricVersion: query.metric.version, datasetVersion: query.dataset.version }, result, warnings: caveats }, context);
    }

    /** Recomputes a run from its stored snapshot with the same method version and compares the results. */
    async reproduce(actor: BrainActor, runId: string) {
        const run = await this.requireRun(actor, runId);
        const stored = (run.result as Record<string, unknown>).resultHash;
        const current = methodVersion(run.methodKey);
        if (run.status !== BRAIN_ANALYSIS_STATUSES.succeeded) return { runId, reproducible: false, reason: "Only successful runs carry a result to reproduce." };
        if (current !== run.methodVersion) return { runId, reproducible: false, reason: `Method ${run.methodKey}@${run.methodVersion} is no longer available (current ${current ?? "none"}).` };
        const snapshot = run.inputSnapshot as Record<string, unknown>;
        const inputs = run.inputs as Record<string, unknown>;
        let recomputed: string | null = null;
        if (run.kind === BRAIN_ANALYSIS_KINDS.forecast) {
            const output = forecastSeries(snapshot.series as SeriesValue[], snapshot.grain as BrainTimeGrain, Number(inputs.horizon), run.methodKey as ForecastMethodKey, Number(inputs.confidence));
            recomputed = "insufficient" in output ? null : hashOf({ points: output.points, method: output.method });
        } else if (run.kind === BRAIN_ANALYSIS_KINDS.simulation) {
            const output = simulate(snapshot.baseline as ForecastPoint[], inputs.assumptions as ScenarioAssumption[], snapshot.constraints as ScenarioConstraint[]);
            recomputed = hashOf({ periods: output.periods, totals: output.totals });
        } else if (run.kind === BRAIN_ANALYSIS_KINDS.optimisation) {
            const output = allocate(snapshot.options as AllocationOption[], Number(snapshot.budget));
            recomputed = hashOf({ allocations: output.allocations, totals: output.totals });
        } else if (run.kind === BRAIN_ANALYSIS_KINDS.rootCause) {
            const output = decompose(snapshot.rows as DriverInput[], String(snapshot.aggregation), snapshot.totals as { current: number; previous: number });
            recomputed = hashOf({ drivers: output.drivers, delta: output.delta });
        }
        const reproducible = recomputed !== null && recomputed === stored;
        await this.audit.recordQuietly(entryFor(actor, "intelligence.run.reproduced", "analysis_run", runId, { metadata: { reproducible } }));
        return { runId, reproducible, method: `${run.methodKey}@${run.methodVersion}`, originalHash: stored ?? null, recomputedHash: recomputed, reproducibilityHash: run.reproducibilityHash };
    }

    async listRuns(actor: BrainActor, options: { kind?: string; limit?: number }) {
        const runs = await this.unit.brainIntelligence.listRuns(actor.workspaceId, { kind: options.kind, limit: Math.min(options.limit ?? 25, BRAIN_LIMITS.listLimit) });
        const visible = await this.visibleMetricIds(actor);
        return runs.filter(run => !run.metricId || visible.has(run.metricId)).map(runView);
    }

    async getRun(actor: BrainActor, id: string) {
        return runView(await this.requireRun(actor, id));
    }

    /** The latest successful forecast the caller may see, for the overview's governed forecast card. */
    async latestForecast(actor: BrainActor) {
        const visible = await this.visibleMetricIds(actor);
        const runs = await this.unit.brainIntelligence.listRuns(actor.workspaceId, { kind: BRAIN_ANALYSIS_KINDS.forecast, limit: 10 });
        const run = runs.find(item => item.status === BRAIN_ANALYSIS_STATUSES.succeeded && item.metricId && visible.has(item.metricId));
        return run ? runView(run) : null;
    }

    async listScenarios(actor: BrainActor) {
        const [scenarios, visible] = await Promise.all([this.unit.brainIntelligence.listScenarios(actor.workspaceId, 50), this.visibleMetricIds(actor)]);
        const allowed = scenarios.filter(scenario => visible.has(scenario.metricId));
        const runs = await Promise.all(allowed.map(scenario => scenario.lastRunId ? this.unit.brainIntelligence.findRun(scenario.lastRunId, actor.workspaceId) : Promise.resolve(null)));
        return allowed.map((scenario, index) => ({ ...scenario, lastRun: runs[index] ? runView(runs[index]!) : null }));
    }

    async saveScenarioFromInput(actor: BrainActor, input: { name: string; description?: string | null; metricKey: string; horizon: number; assumptions: ScenarioAssumption[] }) {
        const { metric } = await this.semantic.resolve(actor, input.metricKey);
        const issues = validateAssumptions(input.assumptions, input.horizon, [{ period: "", value: 1, lower: 1, upper: 1 }], metric.unit).filter(issue => !issue.includes("ten times"));
        if (issues.length) throw new AppError(400, "The scenario assumptions are not valid.", { issues });
        const id = await this.saveScenario(actor, { scenarioId: null, name: input.name, description: input.description ?? null, metricId: metric.id, horizon: input.horizon, assumptions: input.assumptions });
        return this.unit.brainIntelligence.findScenario(id, actor.workspaceId);
    }

    async deleteScenario(actor: BrainActor, id: string) {
        if (!await this.unit.brainIntelligence.deleteScenario(id, actor.workspaceId)) throw new AppError(404, BRAIN_ERRORS.scenarioNotFound);
        await this.audit.record(entryFor(actor, "intelligence.scenario.deleted", "scenario", id));
        return { success: true };
    }

    private async saveScenario(actor: BrainActor, input: { scenarioId: string | null; name: string; description: string | null; metricId: string; horizon: number; assumptions: ScenarioAssumption[] }): Promise<string> {
        const values = { name: input.name.trim(), description: input.description, metricId: input.metricId, horizon: input.horizon, assumptions: input.assumptions as unknown as Array<Record<string, unknown>>, status: BRAIN_SCENARIO_STATUSES.saved };
        const existing = input.scenarioId ? await this.unit.brainIntelligence.findScenario(input.scenarioId, actor.workspaceId) : null;
        if (existing) {
            await this.unit.brainIntelligence.updateScenario(existing.id, actor.workspaceId, values);
            await this.audit.recordQuietly(entryFor(actor, "intelligence.scenario.updated", "scenario", existing.id));
            return existing.id;
        }
        const created = await this.unit.brainIntelligence.createScenario({ workspaceId: actor.workspaceId, ...values, createdBy: actor.userId });
        await this.audit.recordQuietly(entryFor(actor, "intelligence.scenario.saved", "scenario", created.id, { metadata: { name: created.name } }));
        return created.id;
    }

    private async baseline(actor: BrainActor, metricKey: string, horizon: number, baselineRunId: string | undefined, context: RunContext): Promise<{ run: BrainAnalysisRun; points: ForecastPoint[] }> {
        if (baselineRunId) {
            const run = await this.requireRun(actor, baselineRunId);
            const points = ((run.result as Record<string, unknown>).points ?? []) as ForecastPoint[];
            const metric = (run.result as Record<string, unknown>).metric as { key?: string } | undefined;
            if (run.kind !== BRAIN_ANALYSIS_KINDS.forecast || metric?.key !== metricKey) throw new AppError(400, "The baseline must be a forecast run of the same metric.");
            return { run, points: points.slice(0, horizon) };
        }
        const view = await this.forecast(actor, { metricKey, horizon }, context);
        const run = (await this.unit.brainIntelligence.findRun(view.id, actor.workspaceId))!;
        return { run, points: ((run.result as Record<string, unknown>).points ?? []) as ForecastPoint[] };
    }

    /** Business rules of type "constraint" bound to this metric, for scenario checks (FR-INT-002). */
    private async constraintsFor(workspaceId: string, metricKey: string): Promise<ScenarioConstraint[]> {
        const rules = await this.unit.business.listRules(workspaceId);
        return rules.filter(rule => rule.status === "active" && rule.ruleType === "constraint" && (rule.ruleDefinition as Record<string, unknown>).metricKey === metricKey).map(rule => {
            const definition = rule.ruleDefinition as Record<string, unknown>;
            return { label: rule.name, ...(typeof definition.min === "number" ? { min: definition.min } : {}), ...(typeof definition.max === "number" ? { max: definition.max } : {}) };
        });
    }

    /** Analysis needs an approved, governed definition: drafts can be queried but never forecast (trusted metrics only). */
    private async governedQuery(actor: BrainActor, query: Parameters<SemanticQueryService["query"]>[1]): Promise<MetricQueryResult> {
        const result = await this.semantic.query(actor, query);
        if (result.metric.status !== BRAIN_METRIC_STATUSES.approved) throw new AppError(422, BRAIN_ERRORS.metricNotApproved);
        return result;
    }

    private async metricId(actor: BrainActor, metricKey: string): Promise<string | null> {
        return (await this.unit.brainSemantic.findMetricByKey(actor.workspaceId, metricKey))?.id ?? null;
    }

    private async visibleMetricIds(actor: BrainActor): Promise<Set<string>> {
        return new Set((await this.semantic.visibleMetrics(actor)).map(metric => metric.id));
    }

    private async requireRun(actor: BrainActor, id: string): Promise<BrainAnalysisRun> {
        const run = await this.unit.brainIntelligence.findRun(id, actor.workspaceId);
        if (!run) throw new AppError(404, BRAIN_ERRORS.analysisNotFound);
        if (run.metricId && !(await this.visibleMetricIds(actor)).has(run.metricId)) throw new AppError(404, BRAIN_ERRORS.analysisNotFound);
        return run;
    }

    private insufficient(actor: BrainActor, kind: BrainAnalysisKind, method: { key: string; version: string }, metricId: string | null, inputs: Record<string, unknown>, snapshot: Record<string, unknown>, reason: string, caveats: string[], context: RunContext, baselineRunId?: string) {
        // No estimate is shown when data cannot support one (FR-INT-006); the reason is the result.
        const statements: BrainStatement[] = [{ kind: "caveat", text: reason }, ...caveats.filter(Boolean).map(text => ({ kind: "caveat" as const, text }))];
        return this.persist(actor, { kind, metricId, baselineRunId, method, status: BRAIN_ANALYSIS_STATUSES.insufficientData, inputs, snapshot, result: { reason, statements, headline: null }, warnings: [reason, ...caveats.filter(Boolean)] }, context);
    }

    private async persist(actor: BrainActor, data: { kind: BrainAnalysisKind; metricId: string | null; scenarioId?: string | null; baselineRunId?: string; method: { key: string; version: string }; status: string; inputs: Record<string, unknown>; snapshot: Record<string, unknown>; result: Record<string, unknown>; warnings: string[] }, context: RunContext): Promise<AnalysisRunView> {
        const correlationId = context.correlationId ?? randomUUID();
        const run = await this.unit.brainIntelligence.createRun({
            workspaceId: actor.workspaceId, kind: data.kind, metricId: data.metricId, scenarioId: data.scenarioId ?? null, baselineRunId: data.baselineRunId ?? null,
            methodKey: data.method.key, methodVersion: data.method.version, status: data.status, inputs: data.inputs, inputSnapshot: data.snapshot,
            result: data.result, warnings: data.warnings, reproducibilityHash: hashOf({ kind: data.kind, method: data.method, inputs: data.inputs, snapshot: data.snapshot }),
            requestedBy: actor.userId, taskId: context.taskId ?? null, correlationId,
        });
        await this.audit.recordQuietly(entryFor(actor, `intelligence.${data.kind}.run`, "analysis_run", run.id, { correlationId, metadata: { method: `${data.method.key}@${data.method.version}`, status: data.status } }));
        await this.audit.publishQuietly(actor.workspaceId, BRAIN_EVENT_TYPES.analysisCompleted, { runId: run.id, kind: data.kind, status: data.status, metricId: data.metricId }, { actorId: actorId(actor), correlationId });
        if (data.kind === BRAIN_ANALYSIS_KINDS.forecast || data.kind === BRAIN_ANALYSIS_KINDS.simulation) {
            await this.audit.activity(actor.workspaceId, actor.userId, data.kind === BRAIN_ANALYSIS_KINDS.forecast ? "predictions" : "simulations", data.kind === BRAIN_ANALYSIS_KINDS.forecast ? "Forecast run" : "Simulation run", "brain-analysis", run.id, { event: `${data.kind}-run`, status: data.status });
        }
        return runView(run);
    }
}
