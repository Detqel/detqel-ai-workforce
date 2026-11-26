export type BrainTimeframeId = "7d" | "30d" | "90d" | "ytd";

export interface BrainTimeframeOption {
  id: BrainTimeframeId;
  label: string;
}

export type BrainWidgetId =
  | "telemetry"
  | "toolbox"
  | "forecast"
  | "simulation"
  | "health"
  | "approvals";

export interface BrainWidgetLayout {
  id: BrainWidgetId;
  visible: boolean;
  /** Width percentage of row (clamped between minWidthPct and 100). */
  widthPct: number;
  /** Custom minimum height in pixels, or null for automatic content height. */
  heightPx: number | null;
}

export interface BrainWidgetDefinition {
  id: BrainWidgetId;
  label: string;
  removable: boolean;
  lockedItems?: boolean;
  minWidthPct: number;
  maxWidthPct: number;
  minHeightPx: number;
  maxHeightPx: number;
}

export const BRAIN_GRID_GAP_PX = 14;
export const BRAIN_MIN_WIDGET_PIXEL_WIDTH = 220;
export const BRAIN_LAYOUT_STORAGE_KEY = "detqel_brain_left_layout_v2";

export const BRAIN_WIDGET_DEFINITIONS: Record<BrainWidgetId, BrainWidgetDefinition> = {
  telemetry: {
    id: "telemetry",
    label: "Governed Telemetry",
    removable: true,
    minWidthPct: 30,
    maxWidthPct: 100,
    minHeightPx: 92,
    maxHeightPx: 320,
  },
  toolbox: {
    id: "toolbox",
    label: "Intelligence & Brain Toolbox",
    removable: true,
    lockedItems: true,
    minWidthPct: 30,
    maxWidthPct: 100,
    minHeightPx: 120,
    maxHeightPx: 460,
  },
  forecast: {
    id: "forecast",
    label: "Governed Forecast",
    removable: true,
    minWidthPct: 28,
    maxWidthPct: 100,
    minHeightPx: 148,
    maxHeightPx: 420,
  },
  simulation: {
    id: "simulation",
    label: "What-If Simulation",
    removable: true,
    minWidthPct: 30,
    maxWidthPct: 100,
    minHeightPx: 196,
    maxHeightPx: 480,
  },
  health: {
    id: "health",
    label: "Data & Ontology Health",
    removable: true,
    minWidthPct: 32,
    maxWidthPct: 100,
    minHeightPx: 210,
    maxHeightPx: 520,
  },
  approvals: {
    id: "approvals",
    label: "Workforce & Approvals",
    removable: true,
    minWidthPct: 32,
    maxWidthPct: 100,
    minHeightPx: 210,
    maxHeightPx: 520,
  },
};

export const DEFAULT_BRAIN_LAYOUT: BrainWidgetLayout[] = [
  { id: "telemetry", visible: true, widthPct: 100, heightPx: null },
  { id: "toolbox", visible: true, widthPct: 100, heightPx: null },
  { id: "forecast", visible: true, widthPct: 50, heightPx: null },
  { id: "simulation", visible: true, widthPct: 50, heightPx: null },
  { id: "health", visible: true, widthPct: 50, heightPx: null },
  { id: "approvals", visible: true, widthPct: 50, heightPx: null },
];

export function clampWidgetLayout(item: BrainWidgetLayout): BrainWidgetLayout {
  const def = BRAIN_WIDGET_DEFINITIONS[item.id];
  const widthPct = Math.min(
    def.maxWidthPct,
    Math.max(def.minWidthPct, Math.round(item.widthPct * 10) / 10),
  );
  const heightPx =
    item.heightPx === null
      ? null
      : Math.min(def.maxHeightPx, Math.max(def.minHeightPx, Math.round(item.heightPx)));

  return {
    id: item.id,
    visible: Boolean(item.visible),
    widthPct,
    heightPx,
  };
}

export function sanitizeBrainLayout(raw: unknown): BrainWidgetLayout[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_BRAIN_LAYOUT;
  }

  const seen = new Set<BrainWidgetId>();
  const sanitized: BrainWidgetLayout[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Partial<BrainWidgetLayout>;
    if (!candidate.id || !(candidate.id in BRAIN_WIDGET_DEFINITIONS) || seen.has(candidate.id)) {
      continue;
    }
    const defaults = DEFAULT_BRAIN_LAYOUT.find((item) => item.id === candidate.id)!;
    seen.add(candidate.id);
    sanitized.push(
      clampWidgetLayout({
        id: candidate.id,
        visible: typeof candidate.visible === "boolean" ? candidate.visible : defaults.visible,
        widthPct:
          typeof candidate.widthPct === "number" && Number.isFinite(candidate.widthPct)
            ? candidate.widthPct
            : defaults.widthPct,
        heightPx:
          candidate.heightPx === null ||
          (typeof candidate.heightPx === "number" && Number.isFinite(candidate.heightPx))
            ? candidate.heightPx
            : defaults.heightPx,
      }),
    );
  }

  for (const fallback of DEFAULT_BRAIN_LAYOUT) {
    if (!seen.has(fallback.id)) {
      sanitized.push(fallback);
    }
  }

  return sanitized;
}

export type BrainTelemetryIconKey = "database" | "layers" | "network" | "shield";
export type BrainTelemetryTone = "blue" | "emerald" | "primary" | "amber";

export interface BrainTelemetrySegment {
  id: string;
  label: string;
  value: string;
  delta: string;
  badge: string;
  detail: string;
  icon: BrainTelemetryIconKey;
  tone: BrainTelemetryTone;
  prompt: string;
}

export type BrainCapabilityId =
  | "forecasting"
  | "simulations"
  | "optimization"
  | "root-cause"
  | "recommendations"
  | "automations"
  | "data-layer"
  | "ontology"
  | "lineage"
  | "admin";

export type BrainCapabilityIconKey =
  | "trending-up"
  | "flask"
  | "sliders"
  | "search"
  | "lightbulb"
  | "zap"
  | "network"
  | "layers"
  | "database"
  | "shield";

export interface BrainCapabilityItem {
  id: BrainCapabilityId;
  title: string;
  subtitle: string;
  description: string;
  icon: BrainCapabilityIconKey;
  toneClass: string;
  badgeClass: string;
}

export interface BrainSimulationPreset {
  id: string;
  label: string;
  assumption: string;
  projectedValue: string;
  deltaLabel: string;
  confidenceLabel: string;
}

export interface BrainDomainHealthRow {
  id: string;
  domain: string;
  entities: string;
  zone: "Gold" | "Silver" | "Bronze";
  quality: string;
  freshness: string;
  quarantineNote?: string;
}

export interface BrainApprovalItem {
  id: string;
  title: string;
  reference: string;
  riskTier: "Critical" | "High" | "Moderate" | "Low";
  detail: string;
}

export interface BrainForecastView {
  value: string;
  metricLabel: string;
  deltaLabel: string;
  isNegative: boolean;
  uncertaintyLabel: string;
  modelLabel: string;
  baselineValue: string;
  freshnessLabel: string;
}

/** The approvals card item that stands for proposed ontology mappings rather than an action approval. */
export const MAPPING_REVIEW_ID = "mapping-review";

export interface BrainApprovalsView {
  items: BrainApprovalItem[];
  pendingCount: number;
  verifiedToday: number;
}

/** Everything the left workspace widgets display, from the governed overview or the design preview. */
export interface BrainOverviewView {
  telemetry: BrainTelemetrySegment[];
  forecast: BrainForecastView;
  simulations: BrainSimulationPreset[];
  health: BrainDomainHealthRow[];
  approvals: BrainApprovalsView;
}

export type BrainActionIconKey = "branch" | "clipboard" | "chart" | "sparkles" | "zap";

export interface BrainAssistantMetricCard {
  primaryValue: string;
  primaryLabel: string;
  deltaValue: string;
  deltaLabel: string;
  icon: BrainCapabilityIconKey;
}

export interface BrainAssistantAction {
  id: string;
  label: string;
  prompt: string;
  icon: BrainActionIconKey;
}

export interface BrainAssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: string[];
  metricCard?: BrainAssistantMetricCard;
  insightsTitle?: string;
  insights?: string[];
  actionsTitle?: string;
  actions?: BrainAssistantAction[];
}

export interface BrainQuickSuggestion {
  id: string;
  label: string;
  prompt: string;
}

export const BRAIN_TIMEFRAME_OPTIONS: BrainTimeframeOption[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "ytd", label: "Year to date" },
];

export const BRAIN_TELEMETRY_BY_TIMEFRAME: Record<
  BrainTimeframeId,
  BrainTelemetrySegment[]
> = {
  "7d": [
    {
      id: "connected-sources",
      label: "Connected Sources",
      value: "12 / 12",
      delta: "+1",
      badge: "Live",
      detail: "CRM, ERP, Billing, Support",
      icon: "database",
      tone: "blue",
      prompt: "Summarize sync status and permissions across our 12 connected sources",
    },
    {
      id: "gold-products",
      label: "Gold Data Products",
      value: "58.4M",
      delta: "+6.2%",
      badge: "Gold",
      detail: "Bronze → Silver → Gold",
      icon: "layers",
      tone: "emerald",
      prompt: "Inspect Gold data products and transformation runs from the last 7 days",
    },
    {
      id: "ontology-entities",
      label: "Ontology & Rules",
      value: "48",
      delta: "+1",
      badge: "Governed",
      detail: "142 relations · 18 rules",
      icon: "network",
      tone: "primary",
      prompt: "List governed ontology entities, relationships, and active business rules",
    },
    {
      id: "quality-freshness",
      label: "Quality & Freshness",
      value: "99.4%",
      delta: "+0.2%",
      badge: "SLA Met",
      detail: "Fresh 8m ago · 4 flagged",
      icon: "shield",
      tone: "emerald",
      prompt: "Explain data quality checks and the 4 quarantined records this week",
    },
  ],
  "30d": [
    {
      id: "connected-sources",
      label: "Connected Sources",
      value: "12 / 12",
      delta: "+1",
      badge: "Live",
      detail: "CRM, ERP, Finance, Support",
      icon: "database",
      tone: "blue",
      prompt: "Summarize sync status and permissions across our 12 connected sources",
    },
    {
      id: "gold-products",
      label: "Gold Data Products",
      value: "245M",
      delta: "+8%",
      badge: "Gold",
      detail: "Bronze → Silver → Gold",
      icon: "layers",
      tone: "emerald",
      prompt: "Inspect Gold data products and Medallion pipeline runs over the last 30 days",
    },
    {
      id: "ontology-entities",
      label: "Ontology & Rules",
      value: "48",
      delta: "+2",
      badge: "Governed",
      detail: "142 relations · 18 rules",
      icon: "network",
      tone: "primary",
      prompt: "List governed ontology entities, relationships, and active business rules",
    },
    {
      id: "quality-freshness",
      label: "Quality & Freshness",
      value: "99.2%",
      delta: "+0.1%",
      badge: "SLA Met",
      detail: "Fresh 12m ago · 14 flagged",
      icon: "shield",
      tone: "emerald",
      prompt: "Explain data quality checks and the 14 quarantined records in Silver",
    },
  ],
  "90d": [
    {
      id: "connected-sources",
      label: "Connected Sources",
      value: "12 / 12",
      delta: "+3",
      badge: "Live",
      detail: "CRM, ERP, Finance, Support",
      icon: "database",
      tone: "blue",
      prompt: "Summarize sync status and permissions across our 12 connected sources",
    },
    {
      id: "gold-products",
      label: "Gold Data Products",
      value: "712M",
      delta: "+14%",
      badge: "Gold",
      detail: "Bronze → Silver → Gold",
      icon: "layers",
      tone: "emerald",
      prompt: "Inspect Gold data products and Medallion pipeline runs over the last 90 days",
    },
    {
      id: "ontology-entities",
      label: "Ontology & Rules",
      value: "48",
      delta: "+6",
      badge: "Governed",
      detail: "142 relations · 18 rules",
      icon: "network",
      tone: "primary",
      prompt: "List governed ontology entities, relationships, and active business rules",
    },
    {
      id: "quality-freshness",
      label: "Quality & Freshness",
      value: "98.9%",
      delta: "+0.4%",
      badge: "SLA Met",
      detail: "Fresh 12m ago · 39 flagged",
      icon: "shield",
      tone: "emerald",
      prompt: "Explain data quality checks and quarantined records over the last 90 days",
    },
  ],
  ytd: [
    {
      id: "connected-sources",
      label: "Connected Sources",
      value: "12 / 12",
      delta: "+5",
      badge: "Live",
      detail: "CRM, ERP, Finance, Support",
      icon: "database",
      tone: "blue",
      prompt: "Summarize sync status and permissions across our 12 connected sources",
    },
    {
      id: "gold-products",
      label: "Gold Data Products",
      value: "2.4B",
      delta: "+22%",
      badge: "Gold",
      detail: "Bronze → Silver → Gold",
      icon: "layers",
      tone: "emerald",
      prompt: "Inspect Gold data products processed year to date",
    },
    {
      id: "ontology-entities",
      label: "Ontology & Rules",
      value: "48",
      delta: "+14",
      badge: "Governed",
      detail: "142 relations · 18 rules",
      icon: "network",
      tone: "primary",
      prompt: "List governed ontology entities, relationships, and active business rules",
    },
    {
      id: "quality-freshness",
      label: "Quality & Freshness",
      value: "99.1%",
      delta: "+0.8%",
      badge: "SLA Met",
      detail: "Fresh 12m ago · 84 flagged",
      icon: "shield",
      tone: "emerald",
      prompt: "Explain year-to-date data quality pass rates and lineage health",
    },
  ],
};

export const BRAIN_CAPABILITIES: BrainCapabilityItem[] = [
  {
    id: "forecasting",
    title: "Forecasting",
    subtitle: "Bounds & uncertainty",
    description:
      "Estimate future revenue, demand, and capacity using versioned statistical/ML methods with explicit uncertainty bounds.",
    icon: "trending-up",
    toneClass: "text-primary",
    badgeClass: "bg-primary-muted text-primary border-primary-border",
  },
  {
    id: "simulations",
    title: "Simulations",
    subtitle: "What-if baselines",
    description:
      "Compare baseline snapshots against scenario assumptions with validated metric units, bounds, and reproducible run versions.",
    icon: "flask",
    toneClass: "text-blue-600 dark:text-blue-400",
    badgeClass:
      "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/60",
  },
  {
    id: "optimization",
    title: "Optimisation",
    subtitle: "Constraint solver",
    description:
      "Recommend feasible budget, territory, and capacity allocations under explicit business rules and constraints.",
    icon: "sliders",
    toneClass: "text-sky-600 dark:text-sky-400",
    badgeClass:
      "bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border-sky-100 dark:border-sky-900/60",
  },
  {
    id: "root-cause",
    title: "Root Cause",
    subtitle: "Driver attribution",
    description:
      "Identify candidate drivers behind KPI movements and pipeline bottlenecks with source evidence and caveats.",
    icon: "search",
    toneClass: "text-primary",
    badgeClass: "bg-primary-muted text-primary border-primary-border",
  },
  {
    id: "recommendations",
    title: "Recommendations",
    subtitle: "Action proposals",
    description:
      "Translate analytical outcomes into scoped proposals detailing expected impact, dependencies, risks, and approval paths.",
    icon: "lightbulb",
    toneClass: "text-amber-500 dark:text-amber-400",
    badgeClass:
      "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/60",
  },
  {
    id: "automations",
    title: "Automations",
    subtitle: "Workflow delegation",
    description:
      "Delegate approved proposals to specialised AI Workforce agents and durable workflows with risk-tiered approval gates.",
    icon: "zap",
    toneClass: "text-emerald-600 dark:text-emerald-400",
    badgeClass:
      "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/60",
  },
  {
    id: "data-layer",
    title: "Data Layer",
    subtitle: "Business sources",
    description:
      "Choose which workspace connections are business sources, then load their tables or endpoints into the Bronze, Silver and Gold pipeline. Only linked sources are queried and counted.",
    icon: "database",
    toneClass: "text-blue-600 dark:text-blue-400",
    badgeClass:
      "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/60",
  },
  {
    id: "ontology",
    title: "Ontology & Rules",
    subtitle: "Canonical model",
    description:
      "Inspect canonical entities, typed relationships, semantic mappings, governed metric formulas, and approval status.",
    icon: "network",
    toneClass: "text-primary",
    badgeClass: "bg-primary-muted text-primary border-primary-border",
  },
  {
    id: "lineage",
    title: "Data Lineage",
    subtitle: "Bronze → Gold flow",
    description:
      "Trace datasets across Bronze, Silver, and Gold zones, inspect quarantined records, and verify freshness SLAs.",
    icon: "layers",
    toneClass: "text-emerald-600 dark:text-emerald-400",
    badgeClass:
      "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/60",
  },
  {
    id: "admin",
    title: "Admin",
    subtitle: "Policies & audit",
    description:
      "Set action-risk approval rules, row and column access policies for datasets, metrics and entity types, and review the Business Brain audit trail.",
    icon: "shield",
    toneClass: "text-slate-600 dark:text-slate-300",
    badgeClass:
      "bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  },
];

export const BRAIN_SIMULATION_PRESETS: BrainSimulationPreset[] = [
  {
    id: "apac-outbound",
    label: "APAC Outbound (+15%)",
    assumption: "Reallocate 15% outbound focus to APAC partner pipeline",
    projectedValue: "$27.8M",
    deltaLabel: "+13.5% vs baseline",
    confidenceLabel: "High confidence · Baseline $24.5M",
  },
  {
    id: "discount-cap",
    label: "Discount Cap (10%)",
    assumption: "Enforce 10% Enterprise discount rule requiring VP approval above cap",
    projectedValue: "$25.9M",
    deltaLabel: "+5.7% margin lift",
    confidenceLabel: "Moderate confidence · Policy-bound",
  },
  {
    id: "sdr-capacity",
    label: "SDR Capacity (+4)",
    assumption: "Add 4 Enterprise SDRs starting Month 1 with 45-day ramp",
    projectedValue: "$26.4M",
    deltaLabel: "+7.8% vs baseline",
    confidenceLabel: "High confidence · 48 entities",
  },
];

export const BRAIN_DOMAIN_HEALTH_ROWS: BrainDomainHealthRow[] = [
  {
    id: "crm-pipeline",
    domain: "CRM Pipeline",
    entities: "Account, Opportunity",
    zone: "Gold",
    quality: "99.6%",
    freshness: "8m ago",
  },
  {
    id: "erp-billing",
    domain: "ERP Billing",
    entities: "Invoice, Revenue",
    zone: "Gold",
    quality: "99.4%",
    freshness: "15m ago",
  },
  {
    id: "support-desk",
    domain: "Support Desk",
    entities: "Ticket, SLA Policy",
    zone: "Silver",
    quality: "98.1%",
    freshness: "22m ago",
    quarantineNote: "14 flagged",
  },
  {
    id: "product-telemetry",
    domain: "Product Usage",
    entities: "Tenant, FeatureEvent",
    zone: "Gold",
    quality: "99.8%",
    freshness: "4m ago",
  },
];

export const BRAIN_PENDING_APPROVALS: BrainApprovalItem[] = [
  {
    id: "wf-412",
    title: "Approve Q1 APAC outreach sequence",
    reference: "WF-412 · Email Agent preview",
    riskTier: "High",
    detail: "42 Enterprise recipients · Requires human preview approval",
  },
  {
    id: MAPPING_REVIEW_ID,
    title: "Review 3 low-confidence entity mappings",
    reference: "FR-BRAIN-003 · CRM → Account",
    riskTier: "Moderate",
    detail: "Ambiguous subsidiary IDs held before Gold publish",
  },
];

export const BRAIN_QUICK_SUGGESTIONS: BrainQuickSuggestion[] = [
  {
    id: "sales-forecast",
    label: "Sales forecast",
    prompt: "What's our sales forecast for next quarter?",
  },
  {
    id: "identify-risks",
    label: "Identify risks",
    prompt: "Identify risks and bottlenecks across our business metrics",
  },
  {
    id: "run-simulation",
    label: "Run a simulation",
    prompt: "Run a what-if simulation for next quarter growth targets",
  },
  {
    id: "create-report",
    label: "Create a report",
    prompt: "Create an executive summary report of our current business intelligence",
  },
];

export const BRAIN_PLACEHOLDER_FORECAST: BrainForecastView = {
  value: "$24.5M",
  metricLabel: "Expected sales · Q1 2027",
  deltaLabel: "+18% vs Q4",
  isNegative: false,
  uncertaintyLabel: "±4.2% uncertainty",
  modelLabel: "Model v2.4",
  baselineValue: "$20.8M",
  freshnessLabel: "Fresh 12m ago · 48 entities",
};

/** The design preview, shown only while no workspace is selected. */
export function placeholderBrainOverview(timeframe: BrainTimeframeId): BrainOverviewView {
  return {
    telemetry: BRAIN_TELEMETRY_BY_TIMEFRAME[timeframe],
    forecast: BRAIN_PLACEHOLDER_FORECAST,
    simulations: BRAIN_SIMULATION_PRESETS,
    health: BRAIN_DOMAIN_HEALTH_ROWS,
    approvals: {
      items: BRAIN_PENDING_APPROVALS,
      pendingCount: 2,
      verifiedToday: 14,
    },
  };
}

export function formatAssistantTimestamp(date: Date = new Date()): string {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Suggested business domains for loaded data; any other label can be typed. */
export const BRAIN_DOMAIN_SUGGESTIONS = [
  "Sales",
  "Finance",
  "Procurement",
  "Operations",
  "Supply Chain",
  "Inventory",
  "Customer Support",
  "Marketing",
  "Human Resources",
  "Product",
  "Legal & Compliance",
] as const;
