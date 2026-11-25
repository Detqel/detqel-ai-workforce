import { BRAIN_APPROVAL_STATUSES, BRAIN_FRESHNESS_STATES, BRAIN_LIMITS, BRAIN_MAPPING_STATUSES, BRAIN_TASK_STATUSES, BRAIN_ZONES } from "../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../shared/contracts/unit-of-work.js";
import { formatValue, round, type BrainActor, type BrainStatement } from "./brain-types.js";
import type { DatasetService } from "./data/dataset.service.js";
import type { IntelligenceService } from "./intelligence/intelligence.service.js";
import type { OntologyService } from "./semantic/ontology.service.js";
import type { OverviewPort } from "./workforce/tool-registry.js";

export const BRAIN_TIMEFRAMES = ["7d", "30d", "90d", "ytd"] as const;
export type BrainTimeframe = (typeof BRAIN_TIMEFRAMES)[number];

/** The reporting window and the equally long window before it, for period-over-period deltas. */
export function timeframeRange(timeframe: BrainTimeframe, now = new Date()) {
    const to = now;
    const from = timeframe === "ytd" ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1)) : new Date(now.getTime() - Number.parseInt(timeframe, 10) * 86_400_000);
    const length = to.getTime() - from.getTime();
    return { from, to, previousFrom: new Date(from.getTime() - length), previousTo: from };
}

const passRateOf = (stats: { extracted: number; quarantined: number }) => stats.extracted ? round(Math.max(0, 1 - stats.quarantined / stats.extracted), 4) : null;
const percentChange = (current: number, previous: number) => previous ? round((current - previous) / previous * 100, 1) : null;

/**
 * The Business Brain page's governed telemetry: sources, data products, ontology, quality and freshness, the
 * latest forecast, saved scenarios, domain health and the approval queue. Values are computed from the stores
 * and filtered by the caller's policies; results are cached briefly per workspace, role and timeframe.
 */
export class BrainOverviewService implements OverviewPort {
    private readonly cache = new Map<string, { expires: number; value: unknown }>();

    constructor(
        private readonly unit: IUnitOfWork,
        private readonly datasets: DatasetService,
        private readonly ontology: OntologyService,
        private readonly intelligence: IntelligenceService,
    ) {}

    async overview(actor: BrainActor, timeframe: BrainTimeframe) {
        const key = `${actor.workspaceId}:${actor.role}:${actor.userId}:${timeframe}`;
        const cached = this.cache.get(key);
        if (cached && cached.expires > Date.now()) return cached.value as Awaited<ReturnType<BrainOverviewService["compute"]>>;
        const value = await this.compute(actor, timeframe);
        this.cache.set(key, { expires: Date.now() + BRAIN_LIMITS.overviewCacheMs, value });
        if (this.cache.size > 256) this.cache.delete(this.cache.keys().next().value!);
        return value;
    }

    /** Drops cached overviews for a workspace after a change the user should see at once. */
    invalidate(workspaceId: string): void {
        for (const key of this.cache.keys()) if (key.startsWith(`${workspaceId}:`)) this.cache.delete(key);
    }

    private async compute(actor: BrainActor, timeframe: BrainTimeframe) {
        const range = timeframeRange(timeframe);
        const startOfDay = new Date(new Date().setUTCHours(0, 0, 0, 0));
        const [connections, datasets, ontology, entityTypes, current, previous, forecast, scenarios, approvals, pendingMappings, verifiedToday, mappings, runs] = await Promise.all([
            this.unit.connections.listByWorkspace(actor.workspaceId),
            this.datasets.list(actor),
            this.ontology.summary(actor),
            this.unit.brainSemantic.listEntityTypes(actor.workspaceId),
            this.unit.brainData.periodStats(actor.workspaceId, range.from, range.to),
            this.unit.brainData.periodStats(actor.workspaceId, range.previousFrom, range.previousTo),
            this.intelligence.latestForecast(actor),
            this.intelligence.listScenarios(actor),
            this.unit.brainWorkforce.listApprovals(actor.workspaceId, { status: BRAIN_APPROVAL_STATUSES.pending, limit: 5 }),
            this.unit.brainSemantic.countMappings(actor.workspaceId, BRAIN_MAPPING_STATUSES.proposed),
            this.unit.brainWorkforce.countTasks(actor.workspaceId, BRAIN_TASK_STATUSES.succeeded, startOfDay),
            this.unit.brainSemantic.listMappings(actor.workspaceId, { status: BRAIN_MAPPING_STATUSES.approved, limit: 1_000 }),
            this.unit.brainData.listRuns(actor.workspaceId, { limit: 100 }),
        ]);
        const typeKeys = new Map(entityTypes.map(type => [type.id, type.name]));
        const goldDatasets = datasets.filter(dataset => dataset.zone === BRAIN_ZONES.gold);
        const loaded = datasets.filter(dataset => dataset.lastSuccessAt);
        const withinSla = loaded.filter(dataset => dataset.freshness === BRAIN_FRESHNESS_STATES.validated || dataset.freshness === BRAIN_FRESHNESS_STATES.partial);
        const lastValidatedAt = loaded.map(dataset => dataset.lastSuccessAt!).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
        const passRate = passRateOf(current);
        const previousPassRate = passRateOf(previous);
        const forecastResult = forecast?.result as Record<string, any> | undefined;
        return {
            generatedAt: new Date().toISOString(),
            timeframe: { id: timeframe, from: range.from.toISOString(), to: range.to.toISOString() },
            telemetry: {
                sources: {
                    connected: connections.filter(connection => connection.status === "connected").length,
                    total: connections.length,
                    addedInPeriod: connections.filter(connection => connection.createdAt >= range.from).length,
                    providers: [...new Set(connections.map(connection => connection.name))].slice(0, 4),
                },
                dataProducts: {
                    goldRecords: goldDatasets.reduce((total, dataset) => total + (dataset.counts?.silver ?? 0), 0),
                    processedInPeriod: current.extracted,
                    processedPreviousPeriod: previous.extracted,
                    deltaPercent: percentChange(current.extracted, previous.extracted),
                    datasets: { gold: goldDatasets.length, silver: datasets.filter(dataset => dataset.zone === BRAIN_ZONES.silver).length, bronze: datasets.filter(dataset => dataset.zone === BRAIN_ZONES.bronze).length },
                    runs: current.runs, failedRuns: current.failedRuns,
                },
                ontology: {
                    entityTypes: ontology.entityTypes,
                    entityTypesAddedInPeriod: entityTypes.filter(type => type.createdAt >= range.from).length,
                    relationships: ontology.relationships, relationshipTypes: ontology.relationshipTypes,
                    rules: ontology.rules, entities: ontology.entities, pendingMappings,
                },
                quality: {
                    passRate, previousPassRate,
                    deltaPoints: passRate !== null && previousPassRate !== null ? round((passRate - previousPassRate) * 100, 2) : null,
                    flagged: current.quarantined,
                    lastValidatedAt: lastValidatedAt?.toISOString() ?? null,
                    slaMet: loaded.length > 0 && withinSla.length === loaded.length,
                    datasetsWithinSla: withinSla.length, datasetsLoaded: loaded.length,
                },
            },
            forecast: forecast && forecastResult ? {
                runId: forecast.id, createdAt: forecast.createdAt, method: forecast.method, metric: forecastResult.metric ?? null,
                next: forecastResult.summary?.next ?? null, lastObserved: forecastResult.summary?.lastObserved ?? null,
                changePercent: forecastResult.summary?.changePercent ?? null, uncertaintyPercent: forecastResult.summary?.uncertaintyPercent ?? null,
                horizonTotal: forecastResult.summary?.horizonTotal ?? null, confidenceLevel: forecastResult.confidenceLevel ?? null,
                evaluation: forecastResult.evaluation ?? null, datasetVersion: (forecast.snapshot as Record<string, unknown>).datasetVersion ?? null,
                entities: ontology.entities,
            } : null,
            scenarios: scenarios.slice(0, 6).map(scenario => {
                const result = scenario.lastRun?.result as Record<string, any> | undefined;
                return {
                    id: scenario.id, name: scenario.name, description: scenario.description, horizon: scenario.horizon, assumptions: scenario.assumptions,
                    lastRun: scenario.lastRun ? { id: scenario.lastRun.id, status: scenario.lastRun.status, createdAt: scenario.lastRun.createdAt, totals: result?.totals ?? null, metric: result?.metric ?? null, violations: Array.isArray(result?.violations) ? result!.violations.length : 0 } : null,
                };
            }),
            health: datasets.slice(0, 8).map(dataset => ({
                datasetId: dataset.id, domain: dataset.domain, name: dataset.name,
                entities: [...new Set(mappings.filter(mapping => mapping.datasetId === dataset.id).map(mapping => typeKeys.get(mapping.entityTypeId)).filter((name): name is string => Boolean(name)))].slice(0, 3),
                zone: dataset.zone, freshness: dataset.freshness, lastSuccessAt: dataset.lastSuccessAt?.toISOString() ?? null,
                lastRunStatus: dataset.lastRunStatus, quarantined: dataset.counts?.quarantinedOpen ?? 0,
                passRate: runs.find(run => run.datasetId === dataset.id && run.passRate !== null)?.passRate ?? null, syncing: dataset.syncing,
            })),
            approvals: {
                pending: approvals.map(approval => ({ id: approval.id, title: approval.title, riskTier: approval.riskTier, action: approval.action, runId: approval.runId, taskId: approval.taskId, createdAt: approval.createdAt, expiresAt: approval.expiresAt, requiredApprovals: approval.requiredApprovals, decisions: approval.decisions.length })),
                pendingCount: await this.unit.brainWorkforce.countApprovals(actor.workspaceId, BRAIN_APPROVAL_STATUSES.pending),
                pendingMappings,
                verifiedToday,
            },
        };
    }

    /** The overview as labelled statements, for the agents' brain.overview tool. */
    async summary(actor: BrainActor): Promise<{ statements: BrainStatement[]; data: Record<string, unknown> }> {
        const overview = await this.overview(actor, "30d");
        const { sources, dataProducts, ontology, quality } = overview.telemetry;
        const statements: BrainStatement[] = [
            { kind: "fact", text: `${sources.connected} of ${sources.total} connected source(s) are live.` },
            { kind: "fact", text: `${dataProducts.datasets.gold} dataset(s) are published to Gold (${dataProducts.goldRecords} validated records); ${dataProducts.processedInPeriod} records were processed in the last 30 days.` },
            { kind: "fact", text: `The ontology has ${ontology.entityTypes} entity type(s), ${ontology.relationships} relationship(s) and ${ontology.rules} active rule(s).` },
            quality.passRate === null
                ? { kind: "caveat", text: "No pipeline run completed in the last 30 days, so there is no current quality measurement." }
                : { kind: "fact", text: `${(quality.passRate * 100).toFixed(1)}% of records passed quality checks in the last 30 days; ${quality.flagged} were quarantined.` },
            ...(overview.forecast?.next && overview.forecast.metric ? [{ kind: "estimate" as const, text: `Latest governed forecast: ${overview.forecast.metric.name} at ${formatValue(overview.forecast.next.value, overview.forecast.metric.unit, overview.forecast.metric.currency)} for the period starting ${overview.forecast.next.period}.` }] : []),
            ...(overview.approvals.pendingCount ? [{ kind: "fact" as const, text: `${overview.approvals.pendingCount} action(s) are waiting for human approval.` }] : []),
        ];
        return { statements, data: overview.telemetry as unknown as Record<string, unknown> };
    }
}
