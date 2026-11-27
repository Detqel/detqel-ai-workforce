import { API_PATHS } from "@/constants/apiConstants";
import type { BrainTimeframeId } from "@/constants/brainConstants";
import { apiRequest } from "@/lib/api/resource-client";

export interface BrainMetricRef {
  key: string;
  name: string;
  unit: string;
  currency?: string | null;
}
export interface BrainPeriodValue {
  period: string;
  value: number;
  lower?: number;
  upper?: number;
}
export interface BrainScenarioTotals {
  baseline: number;
  scenario: number;
  delta: number;
  deltaPercent: number | null;
}
/** The governed telemetry behind the Business Brain page (GET /overview). */
export interface BrainOverviewResponse {
  generatedAt: string;
  timeframe: { id: BrainTimeframeId; from: string; to: string };
  telemetry: {
    sources: { connected: number; total: number; addedInPeriod: number; providers: string[] };
    dataProducts: {
      goldRecords: number;
      processedInPeriod: number;
      processedPreviousPeriod: number;
      deltaPercent: number | null;
      datasets: { gold: number; silver: number; bronze: number };
      runs: number;
      failedRuns: number;
    };
    ontology: {
      entityTypes: number;
      entityTypesAddedInPeriod: number;
      relationships: number;
      relationshipTypes: number;
      rules: number;
      entities: number;
    };
    quality: {
      passRate: number | null;
      previousPassRate: number | null;
      deltaPoints: number | null;
      flagged: number;
      lastValidatedAt: string | null;
      slaMet: boolean;
      datasetsWithinSla: number;
      datasetsLoaded: number;
    };
  };
  forecast: {
    runId: string;
    createdAt: string;
    method: { key: string; version: string };
    metric: BrainMetricRef | null;
    next: BrainPeriodValue | null;
    lastObserved: BrainPeriodValue | null;
    changePercent: number | null;
    uncertaintyPercent: number | null;
    horizonTotal: number | null;
    confidenceLevel: number | null;
    entities: number;
  } | null;
  scenarios: Array<{
    id: string;
    name: string;
    description: string | null;
    horizon: number;
    assumptions: Array<{ key: string; label: string; type: string; value: number }>;
    lastRun: { id: string; status: string; createdAt: string; totals: BrainScenarioTotals | null; metric: BrainMetricRef | null; violations: number } | null;
  }>;
  health: Array<{
    datasetId: string;
    domain: string;
    name: string;
    entities: string[];
    zone: string;
    freshness: string;
    lastSuccessAt: string | null;
    lastRunStatus: string | null;
    quarantined: number;
    passRate: number | null;
    syncing: boolean;
  }>;
  approvals: {
    pending: Array<{
      id: string;
      title: string;
      riskTier: string;
      action: string;
      runId: string | null;
      taskId: string | null;
      createdAt: string;
      expiresAt: string;
      requiredApprovals: number;
      decisions: number;
    }>;
    pendingCount: number;
    verifiedToday: number;
  };
}

/** A stored assistant conversation message, in the shape the assistant panel renders. */
export interface BrainApiMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  taskId: string | null;
  attachments?: string[];
  metricCard?: { primaryValue: string; primaryLabel: string; deltaValue: string; deltaLabel: string; icon: string };
  insightsTitle?: string;
  insights?: string[];
  actionsTitle?: string;
  actions?: Array<{ id: string; label: string; prompt: string; icon: string }>;
}
export interface BrainAskResponse {
  conversation: { id: string; title: string };
  taskId: string;
  status: string;
  /** The stored question, then the answer. */
  messages: BrainApiMessage[];
}
export interface BrainAskInput {
  conversationId?: string;
  message: string;
  attachments?: string[];
}

export type BrainSourceKind = "database" | "api" | "files";

/** A workspace connection as the Data Layer sees it. */
export interface BrainDataSource {
  connectionId: string;
  name: string;
  provider: string;
  status: string;
  /** Null when the connector cannot supply business data (for example a code repository). */
  sourceKind: BrainSourceKind | null;
  linked: boolean;
  linkedAt: string | null;
  datasets: number;
}
export interface BrainSourceTable {
  schema: string;
  name: string;
  type: "table" | "view";
}
export interface BrainSourceColumn {
  name: string;
  type: string;
  primaryKey: boolean;
  /** Whether the name can be a dataset key or time field (letters, digits and underscores). */
  selectable: boolean;
  /** Personal data by its name; stored only as pseudonyms. */
  personal: boolean;
}
export interface BrainDatabaseLoadInput {
  scope: "database" | "tables";
  tables?: Array<{ schema: string; name: string }>;
  /** Business domain for every table, unless its schema has an entry in schemaDomains. */
  domain: string;
  schemaDomains?: Record<string, string>;
  includeViews?: boolean;
  syncIntervalMinutes?: number | null;
}
export interface BrainDatabaseLoadResult {
  created: BrainDatasetView[];
  skipped: Array<{ table: string; reason: string }>;
}
export interface BrainSchemaField {
  name: string;
  type: string;
  nullable: boolean;
}
export interface BrainDatasetView {
  id: string;
  name: string;
  domain: string;
  description: string | null;
  connectionId: string | null;
  sourceKind: BrainSourceKind;
  source: { sql?: string; path?: string; format?: string; recordsPath?: string };
  primaryKeyField: string | null;
  timeField: string | null;
  syncMode: string;
  syncIntervalMinutes: number | null;
  status: "active" | "paused" | "error" | "revoked";
  classification: string;
  qualityThreshold: number;
  schemaVersion: number;
  schema: BrainSchemaField[];
  /** Personal-data fields stored only as pseudonyms outside the sealed raw copy. */
  protectedFields: string[];
  zone: "bronze" | "silver" | "gold";
  publishedVersion: number;
  lastRunStatus: string | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  nextSyncAt: string | null;
  consecutiveFailures: number;
  syncing: boolean;
  /** Due and waiting for a free sync slot. */
  queued: boolean;
  freshness: string;
  counts: { bronze: number; silver: number; quarantinedOpen: number } | null;
}
export interface BrainPipelineRun {
  id: string;
  trigger: string;
  status: string;
  extractedCount: number;
  bronzeInserted: number;
  silverUpserted: number;
  quarantinedCount: number;
  passRate: number | null;
  published: boolean;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}
export interface BrainDatasetDetail extends BrainDatasetView {
  recentRuns: BrainPipelineRun[];
  quarantineReasons: Array<{ datasetId: string; code: string; count: number }>;
}
export interface BrainLineage {
  dataset: BrainDatasetView;
  source: { connectionId: string | null; connectionName: string | null; provider: string | null; kind: string; object: Record<string, unknown> };
  zones: {
    bronze: { records: number };
    silver: { records: number; quarantinedOpen: number; transformationVersion: string };
    gold: { publishedVersion: number; zone: string; metrics: Array<{ key: string; name: string; status: string; version: number; formula: string; computedAt: string | null }> };
  };
  columns: Array<{ field: string; type: string; protected: boolean; mappings: Array<{ target: string; status: string; confidence: number }>; metrics: string[] }>;
  recentRuns: BrainPipelineRun[];
}
export interface BrainDatasetInput {
  connectionId: string;
  name: string;
  domain: string;
  description?: string | null;
  source: { sql?: string; path?: string; format?: string; recordsPath?: string };
  primaryKeyField?: string | null;
  timeField?: string | null;
  syncIntervalMinutes?: number | null;
}

export interface BrainEntityAttribute {
  key: string;
  name: string;
  type: string;
  required: boolean;
  identifier: boolean;
  classification: string;
}
export interface BrainEntityType {
  id: string;
  key: string;
  name: string;
  description: string | null;
  attributes: BrainEntityAttribute[];
  version: number;
  status: string;
  entityCount: number;
}
export interface BrainOntologyAttribute {
  key: string;
  name: string;
  type: string;
  identifier: boolean;
  required: boolean;
  /** "restricted" marks personal data: stored pseudonymised and shown only to owners and administrators. */
  classification: string;
}
export interface BrainOntologyNode {
  id: string;
  key: string;
  name: string;
  description: string | null;
  version: number;
  effectiveFrom: string;
  domains: string[];
  entityCount: number;
  displayAttribute: string | null;
  attributes: BrainOntologyAttribute[];
  sources: Array<{
    datasetId: string;
    name: string;
    domain: string;
    source: string | null;
    table: { schema: string; name: string } | null;
    zone: string;
    lastSuccessAt: string | null;
    records: number;
  }>;
}
export interface BrainOntologyEdge {
  id: string;
  key: string;
  name: string;
  description: string | null;
  from: string;
  to: string;
  fromAttribute: string;
  cardinality: string;
  /** "foreign_key" when declared in the source database, "naming" when inferred from a reference-style field name. */
  method: string;
  confidence: number;
  links: number;
}
/** The automatically derived ontology (GET /ontology/graph). */
export interface BrainOntologyGraph {
  generatedAt: string;
  summary: { entityTypes: number; relationships: number; entities: number; links: number; domains: string[]; sources: string[] };
  nodes: BrainOntologyNode[];
  edges: BrainOntologyEdge[];
}
export interface BrainMetricSummary {
  id: string;
  key: string;
  name: string;
  status: string;
  formula: string;
}

export interface BrainPolicySettings {
  actionTiers: Record<string, string>;
  moderateRequiresApproval: boolean;
  criticalEnabled: boolean;
  criticalRequiredApprovals: number;
  approvalTtlHours: number;
  workflowsEnabled: boolean;
  externalSearchEnabled: boolean;
}
export interface BrainRowFilter {
  field: string;
  op: string;
  value: string | number | boolean;
}
export interface BrainAccessPolicy {
  id: string;
  name: string;
  role: string;
  resourceType: "dataset" | "metric" | "entity_type";
  resourceId: string;
  effect: "deny" | "mask" | "row_filter";
  maskedFields: string[];
  rowFilter: BrainRowFilter | null;
  createdAt: string;
}
export type BrainAccessPolicyInput = Omit<BrainAccessPolicy, "id" | "createdAt">;
export interface BrainAuditEvent {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  policyDecision: string | null;
  outcome: string;
  createdAt: string;
}

export interface BrainApproval {
  id: string;
  title: string;
  action: string;
  riskTier: string;
  status: string;
  /** What will happen if approved: target, recipients, summary and a redacted payload preview. */
  preview: Record<string, unknown>;
  /** The decision is bound to this exact payload; a changed payload invalidates it. */
  payloadHash: string;
  requiredApprovals: number;
  decisions: Array<{ userId: string; decision: string; note: string | null; at: string }>;
  expiresAt: string;
  createdAt: string;
  canDecide: boolean;
}

export type BrainAnalysisKind = "forecast" | "simulation" | "optimisation" | "root_cause";
export interface BrainRecommendation {
  title: string;
  rationale: string;
  expectedImpact: string;
  effort: string;
  confidence: string;
  requiresApproval: boolean;
}
export interface BrainAnalysisRun {
  id: string;
  kind: BrainAnalysisKind;
  status: string;
  method: { key: string; version: string };
  createdAt: string;
  warnings: string[];
  result: {
    headline?: { label: string };
    statements?: Array<{ kind: string; text: string }>;
    recommendations?: BrainRecommendation[];
  } | null;
}
export interface BrainWorkflowDefinition {
  id: string;
  key: string;
  name: string;
  description: string | null;
  version: number;
  status: string;
  trigger: { type?: string; intervalMinutes?: number; eventType?: string };
  nextRunAt: string | null;
  updatedAt: string;
}

const workspacePath = (workspaceId: string) => `${API_PATHS.brainWorkspaces}/${encodeURIComponent(workspaceId)}`;
const read = <T>(workspaceId: string, path: string, signal?: AbortSignal) =>
  apiRequest<T>(`${workspacePath(workspaceId)}${path}`, { signal, cache: "no-store" });
const send = <T>(workspaceId: string, method: "POST" | "PUT" | "DELETE", path: string, body?: unknown) =>
  apiRequest<T>(`${workspacePath(workspaceId)}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const id = encodeURIComponent;

export const brainApi = {
  overview: (workspaceId: string, timeframe: BrainTimeframeId, signal?: AbortSignal) =>
    read<BrainOverviewResponse>(workspaceId, `/overview?${new URLSearchParams({ timeframe })}`, signal),
  ask: (workspaceId: string, input: BrainAskInput, signal?: AbortSignal) =>
    apiRequest<BrainAskResponse>(`${workspacePath(workspaceId)}/assistant/messages`, { method: "POST", body: JSON.stringify(input), signal }),

  dataSources: (workspaceId: string, signal?: AbortSignal) => read<BrainDataSource[]>(workspaceId, "/data-sources", signal),
  linkSource: (workspaceId: string, connectionId: string) => send<BrainDataSource>(workspaceId, "POST", `/data-sources/${id(connectionId)}/link`, {}),
  unlinkSource: (workspaceId: string, connectionId: string) => send<{ success: boolean; revokedDatasets: number }>(workspaceId, "DELETE", `/data-sources/${id(connectionId)}/link`),
  sourceTables: (workspaceId: string, connectionId: string, signal?: AbortSignal) =>
    read<BrainSourceTable[]>(workspaceId, `/data-sources/${id(connectionId)}/tables`, signal),
  sourceColumns: (workspaceId: string, connectionId: string, table: { schema: string; name: string }, signal?: AbortSignal) =>
    read<BrainSourceColumn[]>(workspaceId, `/data-sources/${id(connectionId)}/columns?${new URLSearchParams({ schema: table.schema, table: table.name })}`, signal),

  syncSource: (workspaceId: string, connectionId: string) =>
    send<{ queued: number; syncing: number }>(workspaceId, "POST", `/data-sources/${id(connectionId)}/sync`, {}),
  loadDatabase: (workspaceId: string, connectionId: string, input: BrainDatabaseLoadInput) =>
    send<BrainDatabaseLoadResult>(workspaceId, "POST", `/data-sources/${id(connectionId)}/load`, input),
  datasets: (workspaceId: string, signal?: AbortSignal) => read<BrainDatasetView[]>(workspaceId, "/datasets", signal),
  dataset: (workspaceId: string, datasetId: string, signal?: AbortSignal) => read<BrainDatasetDetail>(workspaceId, `/datasets/${id(datasetId)}`, signal),
  lineage: (workspaceId: string, datasetId: string, signal?: AbortSignal) => read<BrainLineage>(workspaceId, `/datasets/${id(datasetId)}/lineage`, signal),
  createDataset: (workspaceId: string, input: BrainDatasetInput) => send<BrainDatasetView>(workspaceId, "POST", "/datasets", input),
  syncDataset: (workspaceId: string, datasetId: string) => send<BrainPipelineRun>(workspaceId, "POST", `/datasets/${id(datasetId)}/sync`, {}),
  setDatasetPaused: (workspaceId: string, datasetId: string, paused: boolean) =>
    send<BrainDatasetView>(workspaceId, "POST", `/datasets/${id(datasetId)}/${paused ? "pause" : "resume"}`, {}),

  ontologyGraph: (workspaceId: string, signal?: AbortSignal) => read<BrainOntologyGraph>(workspaceId, "/ontology/graph", signal),
  entityTypes: (workspaceId: string, signal?: AbortSignal) => read<BrainEntityType[]>(workspaceId, "/entity-types", signal),
  metrics: (workspaceId: string, signal?: AbortSignal) => read<BrainMetricSummary[]>(workspaceId, "/metrics", signal),

  policySettings: (workspaceId: string, signal?: AbortSignal) => read<BrainPolicySettings>(workspaceId, "/policy", signal),
  updatePolicySettings: (workspaceId: string, input: Partial<Omit<BrainPolicySettings, "actionTiers">>) =>
    send<BrainPolicySettings>(workspaceId, "PUT", "/policy", input),
  accessPolicies: (workspaceId: string, signal?: AbortSignal) => read<BrainAccessPolicy[]>(workspaceId, "/access-policies", signal),
  createAccessPolicy: (workspaceId: string, input: BrainAccessPolicyInput) => send<BrainAccessPolicy>(workspaceId, "POST", "/access-policies", input),
  deleteAccessPolicy: (workspaceId: string, policyId: string) => send<{ success: boolean }>(workspaceId, "DELETE", `/access-policies/${id(policyId)}`),
  audit: (workspaceId: string, signal?: AbortSignal) => read<BrainAuditEvent[]>(workspaceId, "/audit?limit=100", signal),

  pendingApprovals: (workspaceId: string, signal?: AbortSignal) => read<BrainApproval[]>(workspaceId, "/approvals?status=pending", signal),
  decideApproval: (workspaceId: string, approval: Pick<BrainApproval, "id" | "payloadHash">, decision: "approved" | "rejected", note?: string) =>
    send<BrainApproval>(workspaceId, "POST", `/approvals/${id(approval.id)}/decide`, { decision, payloadHash: approval.payloadHash, ...(note ? { note } : {}) }),
  analysisRuns: (workspaceId: string, kind: BrainAnalysisKind, signal?: AbortSignal) =>
    read<BrainAnalysisRun[]>(workspaceId, `/intelligence/runs?${new URLSearchParams({ kind, limit: "10" })}`, signal),
  workflows: (workspaceId: string, signal?: AbortSignal) => read<BrainWorkflowDefinition[]>(workspaceId, "/workflows", signal),
};
