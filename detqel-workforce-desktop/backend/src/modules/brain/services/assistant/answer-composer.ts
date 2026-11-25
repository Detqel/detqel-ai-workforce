import { formatPercent, formatValue, type BrainEvidence, type BrainHeadline, type BrainStatement } from "../brain-types.js";
import type { BrainIntent } from "../workforce/rule-planner.js";
import type { FollowUp, ToolOutput } from "../workforce/tool-registry.js";

export interface StepResult {
    readonly index: number;
    readonly agent: string;
    readonly agentName: string;
    readonly tool: string;
    readonly purpose: string;
    readonly status: "succeeded" | "failed" | "blocked" | "waiting_approval" | "skipped";
    readonly output: ToolOutput | null;
    readonly error: string | null;
    readonly approvalId: string | null;
}

/** The assistant message shape the Business Brain page renders. */
export interface AssistantPayload {
    readonly content: string;
    readonly metricCard?: { primaryValue: string; primaryLabel: string; deltaValue: string; deltaLabel: string; icon: string };
    readonly insightsTitle?: string;
    readonly insights?: string[];
    readonly actionsTitle?: string;
    readonly actions?: Array<{ id: string; label: string; prompt: string; icon: FollowUp["icon"] }>;
    readonly statements: BrainStatement[];
    readonly evidence: BrainEvidence[];
    readonly agents: string[];
    readonly approvals: string[];
    readonly planner: "model" | "rules";
    readonly verification: { verified: boolean; notes: string[] };
}

export const STATEMENT_LABELS: Readonly<Record<string, string>> = {
    fact: "Observed fact", estimate: "Estimate", assumption: "Assumption", recommendation: "Recommendation", caveat: "Caveat",
};
const ORDER = ["fact", "estimate", "assumption", "recommendation", "caveat"];

const OPENINGS: Readonly<Record<string, string>> = {
    conversational: "Here is what the Business Brain can see right now:",
    analytics: "Here is what the governed data shows:",
    forecast: "Here is the governed forecast:",
    simulation: "Here is the scenario compared with its baseline:",
    optimisation: "Here is the recommended allocation under the stated bounds:",
    root_cause: "Here are the drivers behind the latest change:",
    data_health: "Here is the current data pipeline and quality status:",
    ontology: "Here is the state of the business ontology:",
    approvals: "Here are the actions waiting for a decision:",
    report: "Here is an executive summary from governed data:",
    outreach: "Outreach goes through an approval-gated workflow:",
    marketing: "Here is the context for campaign planning:",
    research: "Here is what approved knowledge says:",
    automation: "I drafted a governed workflow:",
};

const DEFAULT_ACTIONS: Readonly<Record<string, FollowUp[]>> = {
    forecast: [{ label: "Run a what-if analysis", prompt: "Run a what-if simulation on this forecast with 10% more growth", icon: "branch" }, { label: "Explore the drivers", prompt: "What is driving the latest change?", icon: "chart" }],
    simulation: [{ label: "Optimise the allocation", prompt: "Optimise budget allocation for the highest return", icon: "sparkles" }],
    root_cause: [{ label: "Forecast the trend", prompt: "Forecast this metric for next quarter", icon: "branch" }],
    data_health: [{ label: "Review pending mappings", prompt: "Review the low-confidence entity mappings waiting for approval", icon: "clipboard" }],
    ontology: [{ label: "Check data quality", prompt: "Explain data quality checks and quarantined records", icon: "chart" }],
    analytics: [{ label: "Forecast next quarter", prompt: "Forecast this metric for next quarter", icon: "branch" }, { label: "Identify risks", prompt: "Identify risks and root causes in the latest change", icon: "chart" }],
    report: [{ label: "Schedule a weekly digest", prompt: "Create a weekly executive forecast report automation", icon: "zap" }],
};

function metricCard(headline: BrainHeadline): AssistantPayload["metricCard"] {
    const value = headline.value === null ? "n/a" : formatValue(headline.value, headline.unit, headline.currency);
    const delta = headline.delta === null || headline.delta === undefined ? "—" : headline.deltaIsPercent ? formatPercent(headline.delta) : formatValue(headline.delta, headline.unit, headline.currency);
    return { primaryValue: value, primaryLabel: headline.label, deltaValue: delta, deltaLabel: headline.deltaLabel ?? "", icon: headline.icon };
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "action";

/**
 * Composes the answer from tool results alone. Every insight carries its label, failures and pending approvals
 * stay visible, and the text never says work is done when a step failed or waits for approval (PRD 10.1).
 */
export function composeAnswer(intent: BrainIntent, results: ReadonlyArray<StepResult>, options: { planner: "model" | "rules"; clarification: string | null; notes?: string[]; narrative?: string | null; highlights?: BrainStatement[] }): AssistantPayload {
    const succeeded = results.filter(result => result.status === "succeeded" && result.output);
    const statements: BrainStatement[] = [];
    const seen = new Set<string>();
    for (const result of succeeded) for (const statement of result.output!.statements) {
        if (seen.has(statement.text)) continue;
        seen.add(statement.text);
        statements.push(statement);
    }
    for (const result of results) {
        if (result.status === "failed" || result.status === "blocked") statements.push({ kind: "caveat", text: `${result.agentName} could not ${result.purpose.charAt(0).toLowerCase()}${result.purpose.slice(1).replace(/\.$/, "")}: ${result.error ?? result.status}.` });
        if (result.status === "waiting_approval") statements.push({ kind: "caveat", text: `${result.agentName}'s step "${result.purpose.replace(/\.$/, "")}" is waiting for human approval and has not run.` });
        if (result.status === "skipped") statements.push({ kind: "caveat", text: `${result.agentName} skipped "${result.purpose.replace(/\.$/, "")}" because an earlier step did not finish.` });
    }
    statements.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
    const evidence = succeeded.flatMap(result => result.output!.evidence).filter((item, index, list) => list.findIndex(other => other.reference === item.reference) === index).slice(0, 12);
    const headline = succeeded.map(result => result.output!.headline).find((item): item is BrainHeadline => Boolean(item));
    const followUps = [...succeeded.flatMap(result => result.output!.followUps ?? []), ...(DEFAULT_ACTIONS[intent] ?? [])];
    if (results.some(result => result.status === "waiting_approval")) followUps.unshift({ label: "Review pending approvals", prompt: "Show pending approvals with their previews", icon: "clipboard" });
    const actions = followUps.filter((item, index, list) => list.findIndex(other => other.prompt === item.prompt) === index).slice(0, 3).map(item => ({ id: slug(item.label), ...item }));
    const insights = (options.highlights?.length ? options.highlights : statements).slice(0, 8).map(statement => `${STATEMENT_LABELS[statement.kind] ?? "Note"}: ${statement.text}`);
    const agents = [...new Set(results.map(result => result.agentName))];
    let content: string;
    if (options.clarification && !results.length) content = options.clarification;
    else if (!succeeded.length) content = results.length ? "I could not complete this request with governed data. The details below say what stopped it." : "I could not find governed data to answer this yet. Connect a source and register a dataset to get started.";
    else content = options.narrative?.trim() || OPENINGS[intent] || OPENINGS.analytics;
    if (options.clarification && results.length) content = `${content} ${options.clarification}`;
    const notes = options.notes ?? [];
    return {
        content,
        ...(headline ? { metricCard: metricCard(headline) } : {}),
        ...(insights.length ? { insightsTitle: "Evidence-backed summary:", insights } : {}),
        ...(actions.length ? { actionsTitle: "Would you like to:", actions } : {}),
        statements, evidence, agents,
        approvals: results.map(result => result.approvalId).filter((id): id is string => Boolean(id)),
        planner: options.planner,
        verification: { verified: results.length > 0 && results.every(result => result.status === "succeeded"), notes },
    };
}
