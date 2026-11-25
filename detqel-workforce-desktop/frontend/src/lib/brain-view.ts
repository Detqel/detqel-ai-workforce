import {
  BRAIN_TIMEFRAME_OPTIONS,
  formatAssistantTimestamp,
  type BrainActionIconKey,
  type BrainApprovalItem,
  type BrainAssistantMessage,
  type BrainCapabilityIconKey,
  type BrainDomainHealthRow,
  type BrainForecastView,
  type BrainOverviewView,
  type BrainSimulationPreset,
  type BrainTelemetrySegment,
} from "@/constants/brainConstants";
import type { BrainApiMessage, BrainOverviewResponse } from "@/lib/api/brain";

const CAPABILITY_ICONS: ReadonlySet<string> = new Set<BrainCapabilityIconKey>(["trending-up", "flask", "sliders", "search", "lightbulb", "zap", "network", "layers"]);
const ACTION_ICONS: ReadonlySet<string> = new Set<BrainActionIconKey>(["branch", "clipboard", "chart", "sparkles", "zap"]);
const MAX_APPROVAL_ITEMS = 3;
const EMPTY = "—";

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const signed = (value: number, suffix = "") => `${value > 0 ? "+" : ""}${round(value)}${suffix}`;
const percent = (rate: number) => `${round(rate * 100)}%`;

function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${round(value / 1_000_000_000, 2)}B`;
  if (abs >= 1_000_000) return `${round(value / 1_000_000, 2)}M`;
  if (abs >= 10_000) return `${round(value / 1_000, 1)}K`;
  return `${round(value, 2)}`;
}

/** Same compact format the backend uses in answers, so the widgets and the assistant agree. */
export function formatMetricValue(value: number, unit: string, currency?: string | null): string {
  if (!Number.isFinite(value)) return EMPTY;
  if (unit === "currency") return currency && currency !== "USD" ? `${currency} ${compact(value)}` : `$${compact(value)}`;
  if (unit === "percent") return `${round(value, 2)}%`;
  return compact(value);
}

function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

const zoneLabel = (zone: string): BrainDomainHealthRow["zone"] => (zone === "gold" ? "Gold" : zone === "silver" ? "Silver" : "Bronze");
const tierLabel = (tier: string): BrainApprovalItem["riskTier"] =>
  tier === "critical" ? "Critical" : tier === "high" ? "High" : tier === "low" ? "Low" : "Moderate";

function telemetryOf(overview: BrainOverviewResponse): BrainTelemetrySegment[] {
  const { sources, dataProducts, ontology, quality } = overview.telemetry;
  const period = BRAIN_TIMEFRAME_OPTIONS.find((option) => option.id === overview.timeframe.id)?.label.toLowerCase() ?? "selected period";
  return [
    {
      id: "connected-sources", label: "Connected Sources", icon: "database", tone: "blue",
      value: `${sources.connected} / ${sources.total}`,
      delta: sources.addedInPeriod ? `+${sources.addedInPeriod}` : "",
      badge: !sources.total ? "None" : sources.connected === sources.total ? "Live" : "Partial",
      detail: sources.providers.length ? sources.providers.join(", ") : "No connections yet",
      prompt: `Summarize sync status and permissions across our ${sources.total} connected source${sources.total === 1 ? "" : "s"}`,
    },
    {
      id: "gold-products", label: "Gold Data Products", icon: "layers", tone: "emerald",
      value: compact(dataProducts.goldRecords),
      delta: dataProducts.deltaPercent === null ? "" : signed(dataProducts.deltaPercent, "%"),
      badge: dataProducts.datasets.gold ? "Gold" : dataProducts.datasets.silver ? "Silver" : "Pending",
      detail: `${dataProducts.datasets.gold} Gold · ${dataProducts.datasets.silver} Silver · ${dataProducts.runs} runs`,
      prompt: `Inspect Gold data products and Medallion pipeline runs over the ${period}`,
    },
    {
      id: "ontology-entities", label: "Ontology & Rules", icon: "network", tone: "primary",
      value: String(ontology.entityTypes),
      delta: ontology.entityTypesAddedInPeriod ? `+${ontology.entityTypesAddedInPeriod}` : "",
      badge: ontology.pendingMappings ? `${ontology.pendingMappings} to review` : "Governed",
      detail: `${ontology.relationships} relations · ${ontology.rules} rules`,
      prompt: "List governed ontology entities, relationships, and active business rules",
    },
    {
      id: "quality-freshness", label: "Quality & Freshness", icon: "shield", tone: quality.slaMet || !quality.datasetsLoaded ? "emerald" : "amber",
      value: quality.passRate === null ? EMPTY : percent(quality.passRate),
      delta: quality.deltaPoints === null ? "" : signed(quality.deltaPoints, " pt"),
      badge: !quality.datasetsLoaded ? "No data" : quality.slaMet ? "SLA Met" : "SLA Missed",
      detail: quality.lastValidatedAt ? `Fresh ${ago(quality.lastValidatedAt)} · ${quality.flagged} flagged` : "Not validated yet",
      prompt: `Explain data quality checks and the ${quality.flagged} quarantined records over the ${period}`,
    },
  ];
}

function forecastOf(forecast: BrainOverviewResponse["forecast"]): BrainForecastView {
  if (!forecast?.next || !forecast.metric) {
    return {
      value: EMPTY, metricLabel: "No governed forecast yet", deltaLabel: "", isNegative: false, uncertaintyLabel: "",
      modelLabel: "Not run", baselineValue: EMPTY, freshnessLabel: "Approve a metric, then ask for a forecast",
      prompt: "What's our sales forecast for next quarter?",
    };
  }
  const { metric, next, lastObserved } = forecast;
  return {
    value: formatMetricValue(next.value, metric.unit, metric.currency),
    metricLabel: `${metric.name} · period starting ${next.period}`,
    deltaLabel: forecast.changePercent === null ? "" : `${signed(forecast.changePercent, "%")} vs ${lastObserved?.period ?? "last period"}`,
    isNegative: (forecast.changePercent ?? 0) < 0,
    uncertaintyLabel: forecast.uncertaintyPercent === null ? "" : `±${round(forecast.uncertaintyPercent)}% uncertainty`,
    modelLabel: `${forecast.method.key} v${forecast.method.version}`,
    baselineValue: lastObserved ? formatMetricValue(lastObserved.value, metric.unit, metric.currency) : EMPTY,
    freshnessLabel: `Fresh ${ago(forecast.createdAt)} · ${forecast.entities} entities`,
    prompt: `Explain the assumptions and uncertainty behind the ${metric.name} forecast for the period starting ${next.period}`,
  };
}

function simulationsOf(scenarios: BrainOverviewResponse["scenarios"]): BrainSimulationPreset[] {
  return scenarios.map((scenario) => {
    const totals = scenario.lastRun?.totals ?? null;
    const metric = scenario.lastRun?.metric ?? null;
    return {
      id: scenario.id,
      label: scenario.name,
      assumption: scenario.description || scenario.assumptions.map((assumption) => assumption.label).join(" · ") || "No assumptions recorded",
      projectedValue: totals && metric ? formatMetricValue(totals.scenario, metric.unit, metric.currency) : "Not run",
      deltaLabel: totals?.deltaPercent == null ? "" : `${signed(totals.deltaPercent, "%")} vs baseline`,
      confidenceLabel: totals && metric
        ? `Baseline ${formatMetricValue(totals.baseline, metric.unit, metric.currency)} · ${scenario.horizon} periods`
        : `${scenario.horizon} periods`,
      prompt: `Run the saved what-if scenario "${scenario.name}" again and compare it with the baseline`,
    };
  });
}

function healthOf(overview: BrainOverviewResponse): BrainOverviewView["health"] {
  return {
    rows: overview.health.map((dataset) => ({
      id: dataset.datasetId,
      domain: dataset.name,
      entities: dataset.entities.join(", ") || dataset.domain,
      zone: zoneLabel(dataset.zone),
      quality: dataset.passRate === null ? EMPTY : percent(dataset.passRate),
      freshness: dataset.syncing ? "Syncing" : ago(dataset.lastSuccessAt),
      quarantineNote: dataset.quarantined ? `${dataset.quarantined} flagged` : undefined,
      prompt: `Inspect lineage, quality and freshness for the ${dataset.name} dataset`,
    })),
    inspectPrompt: `Explain data quality checks and the ${overview.telemetry.quality.flagged} quarantined records`,
  };
}

function approvalsOf(approvals: BrainOverviewResponse["approvals"]): BrainOverviewView["approvals"] {
  const items: BrainApprovalItem[] = approvals.pending.map((approval) => ({
    id: approval.id,
    title: approval.title,
    reference: approval.runId ? "Workflow step" : approval.taskId ? "Assistant action" : approval.action,
    riskTier: tierLabel(approval.riskTier),
    detail: `${approval.decisions}/${approval.requiredApprovals} approvals · expires ${new Date(approval.expiresAt).toLocaleDateString()}`,
    prompt: `Show the approval preview for "${approval.title}", its risk tier and impact`,
  }));
  if (approvals.pendingMappings) {
    items.push({
      id: "mapping-review",
      title: `Review ${approvals.pendingMappings} entity mapping${approvals.pendingMappings === 1 ? "" : "s"}`,
      reference: "Ontology mappings",
      riskTier: "Moderate",
      detail: "Held for review before they shape entities",
      prompt: "Review the low-confidence entity mappings waiting for approval",
    });
  }
  return {
    items: items.slice(0, MAX_APPROVAL_ITEMS),
    pendingCount: approvals.pendingCount + approvals.pendingMappings,
    verifiedToday: approvals.verifiedToday,
    reviewPrompt: "Show the pending approvals with their previews, risk tiers and impact",
  };
}

export function toBrainOverviewView(overview: BrainOverviewResponse): BrainOverviewView {
  return {
    telemetry: telemetryOf(overview),
    forecast: forecastOf(overview.forecast),
    simulations: simulationsOf(overview.scenarios),
    health: healthOf(overview),
    approvals: approvalsOf(overview.approvals),
  };
}

/** Shown until the first overview arrives, or when it cannot be loaded. */
export function pendingBrainOverview(error: string | null): BrainOverviewView {
  const detail = error ? "Could not load" : "Loading…";
  const segment = (id: string, label: string, icon: BrainTelemetrySegment["icon"], tone: BrainTelemetrySegment["tone"]): BrainTelemetrySegment =>
    ({ id, label, icon, tone, value: EMPTY, delta: "", badge: "", detail, prompt: "Summarize the current state of our business data" });
  return {
    telemetry: [
      segment("connected-sources", "Connected Sources", "database", "blue"),
      segment("gold-products", "Gold Data Products", "layers", "emerald"),
      segment("ontology-entities", "Ontology & Rules", "network", "primary"),
      segment("quality-freshness", "Quality & Freshness", "shield", "emerald"),
    ],
    forecast: { ...forecastOf(null), metricLabel: detail, freshnessLabel: error ?? detail },
    simulations: [],
    health: { rows: [], inspectPrompt: "Explain our data quality checks" },
    approvals: { items: [], pendingCount: 0, verifiedToday: 0, reviewPrompt: "Show the pending approvals" },
  };
}

/** Maps a stored message to the panel's shape; icons outside the panel's set fall back instead of breaking it. */
export function toAssistantMessage(message: BrainApiMessage): BrainAssistantMessage {
  return {
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    timestamp: formatAssistantTimestamp(new Date(message.createdAt)),
    attachments: message.attachments?.length ? message.attachments : undefined,
    metricCard: message.metricCard
      ? { ...message.metricCard, icon: (CAPABILITY_ICONS.has(message.metricCard.icon) ? message.metricCard.icon : "lightbulb") as BrainCapabilityIconKey }
      : undefined,
    insightsTitle: message.insightsTitle,
    insights: message.insights,
    actionsTitle: message.actionsTitle,
    actions: message.actions?.map((action) => ({ ...action, icon: (ACTION_ICONS.has(action.icon) ? action.icon : "sparkles") as BrainActionIconKey })),
  };
}
