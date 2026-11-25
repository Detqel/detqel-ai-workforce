import { z } from "zod";
import { BRAIN_LIMITS, BRAIN_MAPPING_STATUSES, BRAIN_RISK_TIERS } from "../../../../constants/brainConstants.js";
import type { IWorkspaceWebSearch } from "../../../../shared/agents/tools/workspace-web-search.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import type { BrainAuditService } from "../brain-audit.service.js";
import { formatPercent, formatValue, tokens, type BrainActor, type BrainEvidence, type BrainHeadline, type BrainStatement } from "../brain-types.js";
import type { DatasetService } from "../data/dataset.service.js";
import type { AnalysisRunView, IntelligenceService } from "../intelligence/intelligence.service.js";
import type { EntityResolutionService } from "../semantic/entity-resolution.service.js";
import type { OntologyService } from "../semantic/ontology.service.js";
import type { SemanticQueryService } from "../semantic/semantic-query.service.js";
import { BRAIN_TOOL_KEYS, type BrainToolKey } from "./agent-catalog.js";
import type { ActionDescriptor, BrainPolicyService } from "./policy-engine.js";

export interface ToolContext {
    readonly actor: BrainActor;
    readonly taskId: string | null;
    readonly correlationId: string;
    readonly agentKey: string;
    readonly signal?: AbortSignal;
}
export interface FollowUp { readonly label: string; readonly prompt: string; readonly icon: "branch" | "clipboard" | "chart" | "sparkles" | "zap" }
/** Structured tool output. `statements` are already labelled; documents and web text stay inside `data` as untrusted content. */
export interface ToolOutput {
    readonly data: Record<string, unknown>;
    readonly summary: string;
    readonly statements: BrainStatement[];
    readonly evidence: BrainEvidence[];
    readonly headline?: BrainHeadline | null;
    readonly followUps?: FollowUp[];
    /** Text retrieved from documents or the web; handed to models only inside untrusted-data blocks. */
    readonly untrusted?: Array<{ source: string; text: string }>;
}
export interface ToolDefinition<I = unknown> extends ActionDescriptor {
    readonly key: BrainToolKey;
    readonly version: string;
    readonly description: string;
    readonly input: z.ZodType<I>;
    /** A JSON example the planner can follow; inputs are validated against `input` regardless. */
    readonly example: string;
    readonly handler: (context: ToolContext, input: I) => Promise<ToolOutput>;
    /** What a reviewer sees before approving (recipients, content, affected records, impact). */
    readonly preview?: (input: I) => Record<string, unknown>;
}

/** The overview numbers an agent can cite. */
export interface OverviewPort { summary(actor: BrainActor): Promise<{ statements: BrainStatement[]; data: Record<string, unknown> }> }
/** Workflow operations agents may request; the workflow engine stays authoritative for execution and approvals. */
export interface WorkflowPort {
    draftFromTemplate(actor: BrainActor, input: { template: string; name: string; description?: string }): Promise<{ id: string; key: string; name: string; status: string }>;
    requestExternalAction(actor: BrainActor, input: { connectionName: string; path: string; payload: Record<string, unknown>; title: string; summary: string; recipients: string[] }, context: { taskId: string | null; correlationId: string }): Promise<{ runId: string; approvalId: string | null; status: string }>;
    pendingApprovals(actor: BrainActor): Promise<Array<{ id: string; title: string; riskTier: string; action: string; createdAt: Date; expiresAt: Date }>>;
}
export interface ToolDependencies {
    readonly unit: IUnitOfWork;
    readonly semantic: SemanticQueryService;
    readonly intelligence: IntelligenceService;
    readonly datasets: DatasetService;
    readonly ontology: OntologyService;
    readonly entities: EntityResolutionService;
    readonly overview: () => OverviewPort;
    readonly workflows: () => WorkflowPort;
    readonly webSearch: IWorkspaceWebSearch;
    readonly policies: BrainPolicyService;
    readonly audit: BrainAuditService;
}

const key = z.string().trim().min(1).max(80);
const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();
const assumptionSchema = z.object({
    key: z.string().trim().min(1).max(40), label: z.string().trim().min(1).max(120),
    type: z.enum(["level_percent", "level_absolute", "growth_percent", "ramp_percent"]), value: z.number().finite(),
    startPeriod: z.number().int().min(1).max(BRAIN_LIMITS.maxForecastHorizon).optional(), rampPeriods: z.number().int().min(1).max(BRAIN_LIMITS.maxForecastHorizon).optional(),
}).strict();

function analysisOutput(run: AnalysisRunView, kind: string): ToolOutput {
    const result = run.result as Record<string, unknown>;
    const recommendations = (result.recommendations as Array<{ title: string; followUpPrompt: string }> | undefined) ?? [];
    const statements = (result.statements as BrainStatement[] | undefined) ?? [];
    return {
        data: { runId: run.id, status: run.status, method: run.method, summary: result.summary ?? result.totals ?? null, recommendations: recommendations.map(item => ({ title: item.title })) },
        summary: run.status === "succeeded" ? `${kind} run ${run.id.slice(0, 8)} completed with ${run.method.key}@${run.method.version}.` : `${kind} run withheld: ${String(result.reason ?? "insufficient data")}`,
        statements: [...statements, ...recommendations.map(item => ({ kind: "recommendation" as const, text: item.title }))],
        evidence: [{ type: "analysis", title: `${kind} run`, reference: `analysis:${run.id}`, version: `${run.method.key}@${run.method.version}` }],
        headline: (result.headline as BrainHeadline | null | undefined) ?? null,
        followUps: recommendations.slice(0, 2).map(item => ({ label: item.title.slice(0, 80), prompt: item.followUpPrompt, icon: "branch" as const })),
    };
}

async function findDataset(deps: ToolDependencies, actor: BrainActor, name: string | undefined) {
    const datasets = await deps.datasets.list(actor);
    if (!name) return datasets;
    const wanted = name.toLowerCase();
    return datasets.filter(dataset => dataset.name.toLowerCase().includes(wanted) || dataset.domain.toLowerCase().includes(wanted));
}

/** Builds the tool registry. Tools call governed services only, so the same row/column policies apply to agents. */
export function createBrainTools(deps: ToolDependencies): Map<string, ToolDefinition> {
    const tools: ToolDefinition<any>[] = [
        {
            key: BRAIN_TOOL_KEYS.overview, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Workspace-wide Business Brain status: sources, data products, ontology, quality, approvals.",
            input: z.object({}).strict(), example: "{}",
            handler: async context => {
                const overview = await deps.overview().summary(context.actor);
                return { data: overview.data, summary: "Read the Business Brain overview.", statements: overview.statements, evidence: [{ type: "dataset", title: "Business Brain overview", reference: "brain:overview" }] };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.listMetrics, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "List the governed metrics (KPIs) the user may query, with units and dimensions.",
            input: z.object({}).strict(), example: "{}",
            handler: async context => {
                const metrics = await deps.semantic.visibleMetrics(context.actor);
                return {
                    data: { metrics: metrics.map(metric => ({ key: metric.key, name: metric.name, unit: metric.unit, status: metric.status, dimensions: metric.dimensions, grain: metric.timeGrain })) },
                    summary: `${metrics.length} governed metrics are available.`,
                    statements: [{ kind: "fact", text: `${metrics.length} governed metric(s) are available: ${metrics.slice(0, 8).map(metric => metric.name).join(", ") || "none yet"}.` }],
                    evidence: metrics.slice(0, 8).map(metric => ({ type: "metric" as const, title: metric.name, reference: `metric:${metric.key}@v${metric.version}`, version: metric.version })),
                };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.queryMetric, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Read a governed metric's recent values, optionally broken down by one of its dimensions.",
            input: z.object({ metricKey: key, periods: z.number().int().min(2).max(60).optional(), dimension: optionalText(120) }).strict(),
            example: "{\"metricKey\":\"net_revenue\",\"periods\":6,\"dimension\":\"region\"}",
            handler: async (context, input: { metricKey: string; periods?: number; dimension?: string }) => {
                const result = await deps.semantic.query(context.actor, { metricKey: input.metricKey, periods: input.periods ?? 6, dimension: input.dimension });
                const fmt = (value: number) => formatValue(value, result.metric.unit, result.metric.currency);
                const latest = result.series[result.series.length - 1];
                const previous = result.series[result.series.length - 2];
                const change = latest && previous && previous.value ? (latest.value - previous.value) / Math.abs(previous.value) * 100 : null;
                const statements: BrainStatement[] = latest ? [
                    { kind: "fact", text: `${result.metric.name} was ${fmt(latest.value)} in the period starting ${latest.period}${previous ? `, versus ${fmt(previous.value)} the period before (${change === null ? "n/a" : formatPercent(change)})` : ""}.` },
                    { kind: "fact", text: `Definition: ${result.metric.formula} (v${result.metric.version}, ${result.metric.status}); source ${result.dataset.name} v${result.dataset.version}, ${result.dataset.freshness}.` },
                    ...(result.breakdown ?? []).slice(0, 3).map(row => ({ kind: "fact" as const, text: `${input.dimension} "${row.value}": ${fmt(row.total)} (${Math.round(row.share * 100)}% of the latest period).` })),
                    ...result.caveats.map(text => ({ kind: "caveat" as const, text })),
                ] : [{ kind: "caveat", text: `${result.metric.name} has no validated values yet.` }];
                return {
                    data: { metric: result.metric, series: result.series, breakdown: result.breakdown, dataset: result.dataset, plan: result.plan },
                    summary: `Read ${result.series.length} periods of ${result.metric.name}.`, statements, evidence: result.evidence,
                    headline: latest ? { value: latest.value, label: `${result.metric.name} (${latest.period})`, unit: result.metric.unit, currency: result.metric.currency, delta: change, deltaLabel: previous ? `vs ${previous.period}` : "", deltaIsPercent: true, icon: "trending-up" } : null,
                };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.describeOntology, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Summarise the governed ontology: entity types, relationships, business rules and pending mappings.",
            input: z.object({}).strict(), example: "{}",
            handler: async context => {
                const summary = await deps.ontology.summary(context.actor);
                return {
                    data: summary, summary: "Read the ontology summary.",
                    statements: [
                        { kind: "fact", text: `The ontology has ${summary.entityTypes} entity type(s), ${summary.relationshipTypes} relationship type(s) linking ${summary.relationships} entity pair(s), ${summary.entities} canonical entities and ${summary.rules} active business rule(s).` },
                        ...(summary.pendingMappings ? [{ kind: "caveat" as const, text: `${summary.pendingMappings} mapping(s) are waiting for review before they are used.` }] : []),
                    ],
                    evidence: [{ type: "entity", title: "Ontology registry", reference: "ontology:summary" }],
                };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.pendingMappings, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "List source-to-canonical mappings that need human review because of low or ambiguous confidence.",
            input: z.object({ limit: z.number().int().min(1).max(25).optional() }).strict(), example: "{\"limit\":10}",
            handler: async (context, input: { limit?: number }) => {
                const [mappings, types] = await Promise.all([deps.ontology.listMappings(context.actor, { status: BRAIN_MAPPING_STATUSES.proposed, limit: input.limit ?? 10 }), deps.unit.brainSemantic.listEntityTypes(context.actor.workspaceId)]);
                const typeKey = new Map(types.map(type => [type.id, type.key]));
                return {
                    data: { mappings: mappings.map(mapping => ({ id: mapping.id, sourceField: mapping.sourceField, target: `${typeKey.get(mapping.entityTypeId)}.${mapping.attributeKey}`, confidence: mapping.confidence, method: mapping.method })) },
                    summary: `${mappings.length} mapping(s) await review.`,
                    statements: mappings.length ? mappings.map(mapping => ({ kind: "fact" as const, text: `${mapping.sourceField} → ${typeKey.get(mapping.entityTypeId)}.${mapping.attributeKey} (confidence ${mapping.confidence.toFixed(2)}, ${mapping.method}).` })) : [{ kind: "fact", text: "No mappings are waiting for review." }],
                    evidence: [{ type: "entity", title: "Mapping review queue", reference: "ontology:mappings:proposed" }],
                    followUps: mappings.length ? [{ label: "Review mappings in the ontology studio", prompt: "Explain the evidence for the pending mappings", icon: "clipboard" }] : [],
                };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.searchEntities, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Find canonical business entities (accounts, customers, products) by name or identifier.",
            input: z.object({ query: z.string().trim().min(1).max(120), entityType: optionalText(80) }).strict(), example: "{\"query\":\"Acme\",\"entityType\":\"Account\"}",
            handler: async (context, input: { query: string; entityType?: string }) => {
                const entities = await deps.entities.search(context.actor, { query: input.query, entityTypeKey: input.entityType, limit: 10 });
                return {
                    data: { entities }, summary: `${entities.length} matching entities.`,
                    statements: entities.length ? entities.slice(0, 5).map(entity => ({ kind: "fact" as const, text: `${entity.entityType} "${entity.displayName}" (${entity.canonicalKey}), from ${entity.sources} source record(s).` })) : [{ kind: "fact", text: `No canonical entities match "${input.query}".` }],
                    evidence: entities.slice(0, 5).map(entity => ({ type: "entity" as const, title: entity.displayName, reference: `entity:${entity.id}` })),
                };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.pipelineStatus, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Report datasets' Medallion zone, freshness state, last run and quarantine counts.",
            input: z.object({ datasetName: optionalText(255) }).strict(), example: "{\"datasetName\":\"CRM\"}",
            handler: async (context, input: { datasetName?: string }) => {
                const datasets = await findDataset(deps, context.actor, input.datasetName);
                return {
                    data: { datasets: datasets.map(dataset => ({ id: dataset.id, name: dataset.name, domain: dataset.domain, zone: dataset.zone, freshness: dataset.freshness, lastRunStatus: dataset.lastRunStatus, lastSuccessAt: dataset.lastSuccessAt, quarantined: dataset.counts?.quarantinedOpen ?? 0 })) },
                    summary: `${datasets.length} dataset(s) reported.`,
                    statements: datasets.length ? datasets.slice(0, 8).map(dataset => ({ kind: "fact" as const, text: `${dataset.name} (${dataset.domain}): ${dataset.zone} zone, ${dataset.freshness}, last run ${dataset.lastRunStatus ?? "never"}${dataset.lastSuccessAt ? ` (validated ${dataset.lastSuccessAt.toISOString()})` : ""}, ${dataset.counts?.quarantinedOpen ?? 0} open quarantined record(s).` })) : [{ kind: "fact", text: "No datasets are registered yet. Connect a source and register a dataset to start the pipeline." }],
                    evidence: datasets.slice(0, 8).map(dataset => ({ type: "dataset" as const, title: dataset.name, reference: `dataset:${dataset.id}@v${dataset.publishedVersion}`, freshness: dataset.lastSuccessAt?.toISOString() ?? null })),
                };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.qualityReport, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Explain data-quality results: pass rates and the reason codes of quarantined records.",
            input: z.object({ datasetName: optionalText(255) }).strict(), example: "{\"datasetName\":\"Support\"}",
            handler: async (context, input: { datasetName?: string }) => {
                const datasets = await findDataset(deps, context.actor, input.datasetName);
                const ids = new Set(datasets.map(dataset => dataset.id));
                const [reasons, runs] = await Promise.all([deps.unit.brainData.quarantineReasons(context.actor.workspaceId), deps.unit.brainData.listRuns(context.actor.workspaceId, { limit: 50 })]);
                const names = new Map(datasets.map(dataset => [dataset.id, dataset.name]));
                const relevant = reasons.filter(row => ids.has(row.datasetId));
                const latest = datasets.map(dataset => runs.find(run => run.datasetId === dataset.id)).filter((run): run is NonNullable<typeof run> => Boolean(run));
                return {
                    data: { reasons: relevant.map(row => ({ dataset: names.get(row.datasetId), code: row.code, count: row.count })), latestRuns: latest.map(run => ({ dataset: names.get(run.datasetId), status: run.status, passRate: run.passRate, quarantined: run.quarantinedCount })) },
                    summary: `Quality report for ${datasets.length} dataset(s).`,
                    statements: [
                        ...latest.map(run => ({ kind: "fact" as const, text: `${names.get(run.datasetId)}: last run ${run.status}, pass rate ${run.passRate === null ? "n/a" : `${(run.passRate * 100).toFixed(1)}%`}, ${run.quarantinedCount} record(s) quarantined.` })),
                        ...relevant.slice(0, 6).map(row => ({ kind: "fact" as const, text: `${names.get(row.datasetId)}: ${row.count} open record(s) quarantined for ${row.code.replaceAll("_", " ")}.` })),
                        { kind: "fact", text: "Quarantined records are held with reason codes and never reach Gold metrics." },
                    ],
                    evidence: latest.map(run => ({ type: "dataset" as const, title: `${names.get(run.datasetId)} run`, reference: `pipeline-run:${run.id}` })),
                };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.lineage, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Trace a dataset from its source connector through Bronze, Silver and Gold to mappings and metrics.",
            input: z.object({ datasetName: z.string().trim().min(1).max(255) }).strict(), example: "{\"datasetName\":\"CRM Opportunities\"}",
            handler: async (context, input: { datasetName: string }) => {
                const [dataset] = await findDataset(deps, context.actor, input.datasetName);
                if (!dataset) return { data: {}, summary: "Dataset not found.", statements: [{ kind: "caveat", text: `No dataset named "${input.datasetName}" is visible to you.` }], evidence: [] };
                const lineage = await deps.datasets.lineage(context.actor, dataset.id);
                return {
                    data: lineage as unknown as Record<string, unknown>, summary: `Lineage for ${dataset.name}.`,
                    statements: [
                        { kind: "fact", text: `${dataset.name} is read from ${lineage.source.connectionName ?? "a revoked connection"} (${lineage.source.kind}).` },
                        { kind: "fact", text: `Bronze holds ${lineage.zones.bronze.records} raw record(s); Silver holds ${lineage.zones.silver.records} validated record(s) with ${lineage.zones.silver.quarantinedOpen} open in quarantine; Gold is at version ${lineage.zones.gold.publishedVersion}.` },
                        ...lineage.zones.gold.metrics.slice(0, 4).map(metric => ({ kind: "fact" as const, text: `Feeds metric ${metric.name} (${metric.status}, v${metric.version}): ${metric.formula}.` })),
                    ],
                    evidence: [{ type: "dataset", title: dataset.name, reference: `dataset:${dataset.id}@v${dataset.publishedVersion}`, freshness: dataset.lastSuccessAt?.toISOString() ?? null }],
                };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.forecast, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Run a governed forecast of an approved metric with prediction intervals.",
            input: z.object({ metricKey: key, horizon: z.number().int().min(1).max(BRAIN_LIMITS.maxForecastHorizon).optional(), method: z.enum(["auto", "holt-linear", "ols-linear-trend"]).optional() }).strict(),
            example: "{\"metricKey\":\"net_revenue\",\"horizon\":3}",
            handler: async (context, input: { metricKey: string; horizon?: number; method?: "auto" | "holt-linear" | "ols-linear-trend" }) =>
                analysisOutput(await deps.intelligence.forecast(context.actor, input, { taskId: context.taskId, correlationId: context.correlationId }), "Forecast"),
        },
        {
            key: BRAIN_TOOL_KEYS.simulate, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Run a what-if scenario of an approved metric against a forecast baseline.",
            input: z.object({ metricKey: key, horizon: z.number().int().min(1).max(BRAIN_LIMITS.maxForecastHorizon).optional(), assumptions: z.array(assumptionSchema).min(1).max(BRAIN_LIMITS.maxScenarioAssumptions) }).strict(),
            example: "{\"metricKey\":\"net_revenue\",\"horizon\":3,\"assumptions\":[{\"key\":\"apac\",\"label\":\"APAC outbound focus\",\"type\":\"level_percent\",\"value\":15}]}",
            handler: async (context, input: { metricKey: string; horizon?: number; assumptions: Array<z.infer<typeof assumptionSchema>> }) =>
                analysisOutput(await deps.intelligence.simulate(context.actor, input, { taskId: context.taskId, correlationId: context.correlationId }), "Simulation"),
        },
        {
            key: BRAIN_TOOL_KEYS.optimise, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Recommend a budget allocation across a shared dimension of a spend metric and a return metric.",
            input: z.object({ spendMetricKey: key, returnMetricKey: key, dimension: z.string().trim().min(1).max(120), budget: z.number().positive().optional(), periods: z.number().int().min(1).max(12).optional() }).strict(),
            example: "{\"spendMetricKey\":\"marketing_spend\",\"returnMetricKey\":\"net_revenue\",\"dimension\":\"channel\"}",
            handler: async (context, input: { spendMetricKey: string; returnMetricKey: string; dimension: string; budget?: number; periods?: number }) =>
                analysisOutput(await deps.intelligence.optimise(context.actor, input, { taskId: context.taskId, correlationId: context.correlationId }), "Optimisation"),
        },
        {
            key: BRAIN_TOOL_KEYS.rootCause, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Attribute an approved metric's latest change to the values of one of its dimensions.",
            input: z.object({ metricKey: key, dimension: optionalText(120) }).strict(), example: "{\"metricKey\":\"net_revenue\",\"dimension\":\"segment\"}",
            handler: async (context, input: { metricKey: string; dimension?: string }) =>
                analysisOutput(await deps.intelligence.rootCause(context.actor, input, { taskId: context.taskId, correlationId: context.correlationId }), "Root-cause"),
        },
        {
            key: BRAIN_TOOL_KEYS.searchKnowledge, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Search the workspace's business knowledge documents and decision memory.",
            input: z.object({ query: z.string().trim().min(2).max(300) }).strict(), example: "{\"query\":\"discount approval policy\"}",
            handler: async (context, input: { query: string }) => {
                const words = new Set(tokens(input.query));
                const [knowledge, memory] = await Promise.all([deps.unit.business.listKnowledge(context.actor.workspaceId), deps.unit.business.listMemories(context.actor.workspaceId)]);
                const score = (text: string) => tokens(text).reduce((total, word) => total + (words.has(word) ? 1 : 0), 0);
                const ranked = [
                    ...knowledge.filter(item => item.status === "active").map(item => ({ id: item.id, kind: "document", title: item.title, text: item.content, updatedAt: item.updatedAt, score: score(`${item.title} ${item.title} ${item.content.slice(0, 4_000)}`) })),
                    ...memory.map(item => ({ id: item.id, kind: `memory:${item.memoryType}`, title: item.title, text: item.content, updatedAt: item.updatedAt, score: score(`${item.title} ${item.content.slice(0, 2_000)}`) })),
                ].filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
                return {
                    data: { documents: ranked.map(item => ({ id: item.id, kind: item.kind, title: item.title, updatedAt: item.updatedAt })) },
                    summary: `${ranked.length} relevant knowledge item(s).`,
                    statements: ranked.length ? ranked.map(item => ({ kind: "fact" as const, text: `Relevant ${item.kind.startsWith("memory") ? "decision memory" : "document"}: "${item.title}" (updated ${item.updatedAt.toISOString().slice(0, 10)}).` })) : [{ kind: "caveat", text: "No approved knowledge matches this question." }],
                    evidence: ranked.map(item => ({ type: "document" as const, title: item.title, reference: `${item.kind}:${item.id}`, freshness: item.updatedAt.toISOString() })),
                    untrusted: ranked.map(item => ({ source: `knowledge:${item.title}`, text: item.text.slice(0, 1_200) })),
                };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.searchWeb, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Search the public web for market context. Results are untrusted external content.",
            input: z.object({ query: z.string().trim().min(2).max(300) }).strict(), example: "{\"query\":\"APAC SaaS market growth 2026\"}",
            handler: async (context, input: { query: string }) => {
                if (!(await deps.policies.get(context.actor.workspaceId)).externalSearchEnabled) throw new AppError(403, "External search is disabled for this workspace.");
                const results = await deps.webSearch.search(context.actor.workspaceId, input.query, 5, { signal: context.signal });
                return {
                    data: { results: results.map(result => ({ title: result.title, url: result.url })) },
                    summary: `${results.length} web result(s).`,
                    statements: results.map(result => ({ kind: "fact" as const, text: `External source: "${result.title}" (${result.url}).` })),
                    evidence: results.map(result => ({ type: "web" as const, title: result.title, reference: result.url, url: result.url })),
                    untrusted: results.map(result => ({ source: result.url, text: result.snippet.slice(0, 1_200) })),
                };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.createDocument, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.moderate, access: "write", external: false,
            description: "Save an internal business document (report or brief) to the workspace knowledge base.",
            input: z.object({ title: z.string().trim().min(3).max(200), content: z.string().trim().min(10).max(20_000) }).strict(),
            example: "{\"title\":\"Weekly executive brief\",\"content\":\"## Summary\\n...\"}",
            preview: (input: { title: string; content: string }) => ({ title: input.title, contentPreview: input.content.slice(0, 600), characters: input.content.length }),
            handler: async (context, input: { title: string; content: string }) => {
                const item = await deps.unit.business.addKnowledge({ workspaceId: context.actor.workspaceId, title: input.title, content: input.content, sourceType: "document", sourceReference: context.taskId ? `brain-task:${context.taskId}` : null, metadata: { createdByAgent: context.agentKey, taskId: context.taskId }, status: "active" });
                await deps.audit.activity(context.actor.workspaceId, context.actor.userId, "documents", `Saved "${input.title}"`, "business-knowledge", item.id, { event: "brain-document-created" });
                return { data: { documentId: item.id, title: item.title }, summary: `Saved document "${item.title}".`, statements: [{ kind: "fact", text: `Saved the internal document "${item.title}" to the knowledge base.` }], evidence: [{ type: "document", title: item.title, reference: `document:${item.id}` }] };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.prepareMessage, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Draft an outbound message and validate its recipients. Drafting never sends anything.",
            input: z.object({ recipients: z.array(z.string().trim().email().max(254)).min(1).max(50), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10_000) }).strict(),
            example: "{\"recipients\":[\"buyer@example.com\"],\"subject\":\"Q1 proposal\",\"body\":\"Hello...\"}",
            handler: async (_context, input: { recipients: string[]; subject: string; body: string }) => {
                const recipients = [...new Set(input.recipients.map(address => address.toLowerCase()))];
                return {
                    data: { draft: { recipients, subject: input.subject, body: input.body } }, summary: `Drafted a message to ${recipients.length} recipient(s).`,
                    statements: [{ kind: "fact", text: `Drafted "${input.subject}" for ${recipients.length} validated recipient(s); nothing was sent.` }, { kind: "recommendation", text: "Sending is an external action and needs approval of this exact draft." }],
                    evidence: [], followUps: [{ label: "Send through an approval workflow", prompt: `Request approval to send "${input.subject}" to ${recipients.length} recipients`, icon: "zap" }],
                };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.draftWorkflow, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.moderate, access: "write", external: false,
            description: "Draft a governed workflow from an approved template. Drafts never run until activated.",
            input: z.object({ template: z.enum(["weekly-forecast-report", "data-quality-alert", "approved-outreach"]), name: z.string().trim().min(3).max(200), description: optionalText(1_000) }).strict(),
            example: "{\"template\":\"weekly-forecast-report\",\"name\":\"Weekly executive forecast\"}",
            preview: (input: { template: string; name: string }) => ({ template: input.template, name: input.name }),
            handler: async (context, input: { template: string; name: string; description?: string }) => {
                const workflow = await deps.workflows().draftFromTemplate(context.actor, input);
                return { data: workflow, summary: `Drafted workflow ${workflow.name}.`, statements: [{ kind: "fact", text: `Drafted workflow "${workflow.name}" (${workflow.key}); it stays a draft until someone authorised activates it.` }], evidence: [{ type: "workflow", title: workflow.name, reference: `workflow:${workflow.id}` }] };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.requestExternalAction, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.moderate, access: "write", external: false,
            description: "Start an approval-gated workflow that posts a payload to a connected HTTP integration once a person approves the exact payload.",
            input: z.object({ connectionName: z.string().trim().min(1).max(255), path: z.string().trim().max(500), payloadJson: z.string().trim().min(2).max(20_000), title: z.string().trim().min(3).max(200), summary: z.string().trim().min(3).max(1_000), recipients: z.array(z.string().trim().email()).max(200).optional() }).strict(),
            example: "{\"connectionName\":\"Email service\",\"path\":\"/v1/send\",\"payloadJson\":\"{\\\"to\\\":[\\\"a@example.com\\\"]}\",\"title\":\"Send Q1 outreach\",\"summary\":\"42 recipients\"}",
            handler: async (context, input: { connectionName: string; path: string; payloadJson: string; title: string; summary: string; recipients?: string[] }) => {
                let payload: unknown;
                try { payload = JSON.parse(input.payloadJson); } catch { throw new AppError(400, "The payload must be valid JSON."); }
                if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new AppError(400, "The payload must be a JSON object.");
                const run = await deps.workflows().requestExternalAction(context.actor, { connectionName: input.connectionName, path: input.path, payload: payload as Record<string, unknown>, title: input.title, summary: input.summary, recipients: input.recipients ?? [] }, { taskId: context.taskId, correlationId: context.correlationId });
                return {
                    data: run, summary: `Started workflow run ${run.runId.slice(0, 8)}; it waits for approval before anything is sent.`,
                    statements: [{ kind: "fact", text: `"${input.title}" is waiting for approval in workflow run ${run.runId.slice(0, 8)}. Nothing has been sent; changing the payload after approval invalidates it.` }],
                    evidence: [{ type: "workflow", title: input.title, reference: `workflow-run:${run.runId}` }],
                    followUps: [{ label: "Review the approval queue", prompt: "Show pending approvals with their previews", icon: "clipboard" }],
                };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.listApprovals, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "List actions waiting for human approval with their risk tier.",
            input: z.object({}).strict(), example: "{}",
            handler: async context => {
                const pending = await deps.workflows().pendingApprovals(context.actor);
                return {
                    data: { approvals: pending }, summary: `${pending.length} pending approval(s).`,
                    statements: pending.length ? pending.slice(0, 6).map(item => ({ kind: "fact" as const, text: `${item.riskTier} risk: "${item.title}" (${item.action}), expires ${item.expiresAt.toISOString().slice(0, 16).replace("T", " ")} UTC.` })) : [{ kind: "fact", text: "No actions are waiting for approval." }],
                    evidence: pending.slice(0, 6).map(item => ({ type: "approval" as const, title: item.title, reference: `approval:${item.id}` })),
                };
            },
        },
        {
            key: BRAIN_TOOL_KEYS.bulkUpdate, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.critical, access: "write", external: true,
            description: "Bulk-update source-system records. Critical: disabled unless the workspace enables multi-party approval.",
            input: z.object({ connectionName: z.string().trim().min(1).max(255), description: z.string().trim().min(3).max(1_000), recordCount: z.number().int().min(1).max(100_000) }).strict(),
            example: "{\"connectionName\":\"CRM\",\"description\":\"Close stale opportunities\",\"recordCount\":120}",
            preview: (input: { connectionName: string; description: string; recordCount: number }) => ({ target: input.connectionName, affectedRecords: input.recordCount, change: input.description }),
            handler: async () => { throw new AppError(422, "No write integration is configured for bulk record updates."); },
        },
        {
            key: BRAIN_TOOL_KEYS.transferFunds, version: "1.0.0", riskTier: BRAIN_RISK_TIERS.critical, access: "write", external: true,
            description: "Move money between accounts. Critical: disabled unless the workspace enables multi-party approval.",
            input: z.object({ amount: z.number().positive(), currency: z.string().length(3), destination: z.string().trim().min(3).max(120), reason: z.string().trim().min(3).max(500) }).strict(),
            example: "{\"amount\":1000,\"currency\":\"USD\",\"destination\":\"Vendor 42\",\"reason\":\"Invoice 77\"}",
            preview: (input: { amount: number; currency: string; destination: string; reason: string }) => ({ amount: input.amount, currency: input.currency, destination: input.destination, reason: input.reason }),
            handler: async () => { throw new AppError(422, "No payment integration is configured."); },
        },
    ];
    return new Map(tools.map(tool => [tool.key, tool]));
}

