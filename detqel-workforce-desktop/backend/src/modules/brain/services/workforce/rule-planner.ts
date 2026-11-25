import { tokens } from "../brain-types.js";
import { BRAIN_TOOL_KEYS } from "./agent-catalog.js";

export const BRAIN_INTENTS = {
    conversational: "conversational", analytics: "analytics", forecast: "forecast", simulation: "simulation", optimisation: "optimisation",
    rootCause: "root_cause", dataHealth: "data_health", ontology: "ontology", approvals: "approvals", report: "report", outreach: "outreach",
    marketing: "marketing", research: "research", automation: "automation",
} as const;
export type BrainIntent = (typeof BRAIN_INTENTS)[keyof typeof BRAIN_INTENTS];

export interface PlannedStep {
    readonly agent: string;
    readonly tool: string;
    readonly purpose: string;
    readonly input: Record<string, unknown>;
    readonly dependsOn: number[];
}
export interface BrainPlan {
    readonly intent: BrainIntent;
    readonly steps: PlannedStep[];
    readonly clarification: string | null;
}
export interface PlanningCatalog {
    readonly metrics: ReadonlyArray<{ key: string; name: string; unit: string; dimensions: string[]; status: string; grain: string }>;
    readonly datasets: ReadonlyArray<{ name: string; domain: string }>;
}

/** Periods to forecast so the horizon covers what the question asks for ("next quarter" at monthly grain is 3). */
export function horizonFor(question: string, grain: string): number {
    const span = /\b(year|annual)\b/i.test(question) ? 365 : /\bquarter\b/i.test(question) ? 91 : /\bmonth\b/i.test(question) ? 30 : /\bweek\b/i.test(question) ? 7 : 91;
    const length: Record<string, number> = { day: 1, week: 7, month: 30, quarter: 91 };
    return Math.min(Math.max(Math.round(span / (length[grain] ?? 30)), 1), 24);
}

const T = BRAIN_TOOL_KEYS;
const has = (text: string, pattern: RegExp) => pattern.test(text);

/** The governed metric a question is most likely about, by word overlap with its key and name. */
export function matchMetric(question: string, metrics: PlanningCatalog["metrics"], preferUnit?: string): PlanningCatalog["metrics"][number] | null {
    if (!metrics.length) return null;
    const words = new Set(tokens(question));
    const synonyms: Record<string, string[]> = { sales: ["revenue", "bookings", "amount"], revenue: ["sales", "income"], pipeline: ["opportunity", "opportunities"], customers: ["accounts", "clients"], tickets: ["support", "cases"], spend: ["cost", "budget"] };
    for (const word of [...words]) for (const synonym of synonyms[word] ?? []) words.add(synonym);
    const scored = metrics.map(metric => {
        const target = new Set([...tokens(metric.key.replace(/_/g, " ")), ...tokens(metric.name)]);
        const overlap = [...target].filter(word => words.has(word)).length;
        return { metric, score: overlap + (metric.status === "approved" ? 0.2 : 0) + (preferUnit && metric.unit === preferUnit ? 0.1 : 0) };
    }).sort((a, b) => b.score - a.score);
    return scored[0].score >= 1 ? scored[0].metric : null;
}

function matchDataset(question: string, datasets: PlanningCatalog["datasets"]): string | undefined {
    const words = new Set(tokens(question));
    return datasets.find(dataset => [...tokens(dataset.name), ...tokens(dataset.domain)].some(word => words.has(word) && word.length > 2))?.name;
}

/** A percentage in the question becomes a level assumption; "cut", "reduce" and similar flip its sign. */
function percentAssumption(question: string): { key: string; label: string; type: "level_percent"; value: number } {
    const match = /([+-]?\d+(?:\.\d+)?)\s*%/.exec(question);
    let value = match ? Number(match[1]) : 10;
    if (/\b(cut|reduc|decreas|drop|lower|declin|lose|losing|shrink)\w*/i.test(question) && value > 0) value = -value;
    const label = question.replace(/\s+/g, " ").trim().slice(0, 100) || "Scenario change";
    return { key: "scenario_change", label, type: "level_percent", value };
}

export function detectIntent(question: string): BrainIntent {
    const text = question.toLowerCase();
    if (/^\s*(hi|hello|hey|thanks|thank you|good (morning|afternoon|evening))\b[\s!.,]*$/i.test(text)) return BRAIN_INTENTS.conversational;
    if (has(text, /\b(what[- ]if|simulat|scenario)/)) return BRAIN_INTENTS.simulation;
    if (has(text, /\b(optimi[sz]|allocat|rebalanc|budget split|best mix|highest roi)/)) return BRAIN_INTENTS.optimisation;
    if (has(text, /\b(forecast|predict|projection|project(ed)? |next (quarter|month|year|week)|outlook)/)) return BRAIN_INTENTS.forecast;
    if (has(text, /\b(why|root cause|driver|drivers|explain the (drop|increase|change)|bottleneck|risk|risks|declin|dropp)/)) return BRAIN_INTENTS.rootCause;
    if (has(text, /\b(quarantin|data quality|quality check|lineage|freshness|pipeline run|sync status|connected sources|bronze|silver|gold)/)) return BRAIN_INTENTS.dataHealth;
    if (has(text, /\b(mapping|mappings|ontology|entity|entities|business rule|canonical)/)) return BRAIN_INTENTS.ontology;
    if (has(text, /\b(approval|approve|pending action|waiting for approval)/)) return BRAIN_INTENTS.approvals;
    if (has(text, /\b(automat|workflow|schedule|alert me|recurring)/)) return BRAIN_INTENTS.automation;
    if (has(text, /\b(email|outreach|send (a|an|the)? ?message)/)) return BRAIN_INTENTS.outreach;
    if (has(text, /\b(campaign|marketing|channel)/)) return BRAIN_INTENTS.marketing;
    if (has(text, /\b(report|summary|brief|digest|executive)/)) return BRAIN_INTENTS.report;
    if (has(text, /\b(research|market|competitor|industry|benchmark)/)) return BRAIN_INTENTS.research;
    return BRAIN_INTENTS.analytics;
}

/**
 * Deterministic planner used when no model is configured or a model plan fails validation. It maps the question
 * to an intent and the specialised agent that owns it, so the assistant still answers from governed data.
 */
export function rulePlan(question: string, catalog: PlanningCatalog): BrainPlan {
    const intent = detectIntent(question);
    const currency = matchMetric(question, catalog.metrics, "currency");
    const metric = currency ?? (catalog.metrics.find(item => item.status === "approved") ?? null);
    const metricKey = metric?.key;
    const needsMetric = (purpose: string): BrainPlan | null => metricKey ? null : {
        intent, steps: [{ agent: "business-analyst", tool: T.listMetrics, purpose, input: {}, dependsOn: [] }],
        clarification: catalog.metrics.length ? "Which governed metric should I use? Name one from the list." : null,
    };
    switch (intent) {
        case BRAIN_INTENTS.conversational:
            return { intent, steps: [{ agent: "business-analyst", tool: T.overview, purpose: "Summarise what the Business Brain can see.", input: {}, dependsOn: [] }], clarification: null };
        case BRAIN_INTENTS.forecast:
            return needsMetric("Find a metric to forecast.") ?? { intent, clarification: null, steps: [
                { agent: "forecasting", tool: T.forecast, purpose: `Forecast ${metric!.name}.`, input: { metricKey, horizon: horizonFor(question, metric!.grain) }, dependsOn: [] },
            ] };
        case BRAIN_INTENTS.simulation:
            return needsMetric("Find a metric to simulate.") ?? { intent, clarification: null, steps: [
                { agent: "simulation", tool: T.simulate, purpose: `Simulate the scenario for ${metric!.name}.`, input: { metricKey, horizon: 3, assumptions: [percentAssumption(question)] }, dependsOn: [] },
            ] };
        case BRAIN_INTENTS.optimisation: {
            const spend = catalog.metrics.find(item => /spend|cost|budget/i.test(`${item.key} ${item.name}`));
            const returns = catalog.metrics.find(item => item !== spend && /revenue|sales|return|pipeline/i.test(`${item.key} ${item.name}`));
            const dimension = spend?.dimensions.find(item => returns?.dimensions.includes(item));
            if (!spend || !returns || !dimension) {
                return { intent, steps: [{ agent: "optimisation", tool: T.listMetrics, purpose: "Find spend and return metrics with a shared dimension.", input: {}, dependsOn: [] }], clarification: "Optimisation needs a spend metric and a return metric that share a dimension (for example channel). Which should I use?" };
            }
            return { intent, clarification: null, steps: [{ agent: "optimisation", tool: T.optimise, purpose: `Reallocate ${spend.name} across ${dimension} for ${returns.name}.`, input: { spendMetricKey: spend.key, returnMetricKey: returns.key, dimension }, dependsOn: [] }] };
        }
        case BRAIN_INTENTS.rootCause:
            return needsMetric("Find a metric to investigate.") ?? { intent, clarification: null, steps: [
                { agent: "root-cause", tool: T.rootCause, purpose: `Attribute the latest change in ${metric!.name}.`, input: { metricKey }, dependsOn: [] },
                { agent: "data-steward", tool: T.qualityReport, purpose: "Check that data quality is not the cause.", input: {}, dependsOn: [] },
            ] };
        case BRAIN_INTENTS.dataHealth: {
            const datasetName = matchDataset(question, catalog.datasets);
            const lineage = /\blineage\b/i.test(question) && datasetName;
            return { intent, clarification: null, steps: [
                { agent: "data-steward", tool: T.pipelineStatus, purpose: "Report pipeline and freshness status.", input: datasetName ? { datasetName } : {}, dependsOn: [] },
                lineage
                    ? { agent: "data-steward", tool: T.lineage, purpose: `Trace lineage for ${datasetName}.`, input: { datasetName }, dependsOn: [] }
                    : { agent: "data-steward", tool: T.qualityReport, purpose: "Explain quality results and quarantine reasons.", input: datasetName ? { datasetName } : {}, dependsOn: [] },
            ] };
        }
        case BRAIN_INTENTS.ontology:
            return { intent, clarification: null, steps: [
                { agent: "ontology-steward", tool: T.describeOntology, purpose: "Summarise the ontology and rules.", input: {}, dependsOn: [] },
                { agent: "ontology-steward", tool: T.pendingMappings, purpose: "List mappings that need review.", input: { limit: 10 }, dependsOn: [] },
            ] };
        case BRAIN_INTENTS.approvals:
            return { intent, clarification: null, steps: [{ agent: "workflow", tool: T.listApprovals, purpose: "List actions waiting for approval.", input: {}, dependsOn: [] }] };
        case BRAIN_INTENTS.automation:
            return { intent, clarification: null, steps: [
                { agent: "workflow", tool: T.draftWorkflow, purpose: "Draft a governed workflow from the closest template.", input: { template: /\b(quality|anomal|fresh|alert)\b/i.test(question) ? "data-quality-alert" : /\b(email|outreach)\b/i.test(question) ? "approved-outreach" : "weekly-forecast-report", name: question.replace(/\s+/g, " ").trim().slice(0, 120) }, dependsOn: [] },
            ] };
        case BRAIN_INTENTS.report:
            return { intent, clarification: null, steps: [
                { agent: "document", tool: T.overview, purpose: "Collect the Business Brain overview.", input: {}, dependsOn: [] },
                ...(metricKey ? [{ agent: "document", tool: T.queryMetric, purpose: `Collect ${metric!.name}.`, input: { metricKey, periods: 6 }, dependsOn: [] }] : []),
            ] };
        case BRAIN_INTENTS.outreach:
            return { intent, clarification: "Who should receive the message, and through which connected email or messaging integration should it be sent once approved?", steps: [] };
        case BRAIN_INTENTS.marketing:
            return { intent, clarification: null, steps: [
                ...(metricKey ? [{ agent: "marketing", tool: T.queryMetric, purpose: `Read ${metric!.name} by segment.`, input: { metricKey, periods: 6, ...(metric!.dimensions[0] ? { dimension: metric!.dimensions[0] } : {}) }, dependsOn: [] }] : []),
                { agent: "marketing", tool: T.searchKnowledge, purpose: "Find approved campaign and positioning knowledge.", input: { query: question.slice(0, 300) }, dependsOn: [] },
            ] };
        case BRAIN_INTENTS.research:
            return { intent, clarification: null, steps: [{ agent: "research", tool: T.searchKnowledge, purpose: "Search approved internal knowledge.", input: { query: question.slice(0, 300) }, dependsOn: [] }] };
        default:
            return { intent, clarification: null, steps: [
                metricKey
                    ? { agent: "business-analyst", tool: T.queryMetric, purpose: `Read ${metric!.name}.`, input: { metricKey, periods: 6, ...(metric!.dimensions[0] ? { dimension: metric!.dimensions[0] } : {}) }, dependsOn: [] }
                    : { agent: "business-analyst", tool: T.overview, purpose: "Summarise the Business Brain.", input: {}, dependsOn: [] },
                { agent: "business-analyst", tool: T.searchKnowledge, purpose: "Find related approved knowledge.", input: { query: question.slice(0, 300) }, dependsOn: [] },
            ] };
    }
}
