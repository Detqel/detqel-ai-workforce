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
      pendingMappings: number;
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
    pendingMappings: number;
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

const workspacePath = (workspaceId: string) => `${API_PATHS.brainWorkspaces}/${encodeURIComponent(workspaceId)}`;

export const brainApi = {
  overview: (workspaceId: string, timeframe: BrainTimeframeId, signal?: AbortSignal) =>
    apiRequest<BrainOverviewResponse>(`${workspacePath(workspaceId)}/overview?${new URLSearchParams({ timeframe })}`, { signal, cache: "no-store" }),
  ask: (workspaceId: string, input: BrainAskInput, signal?: AbortSignal) =>
    apiRequest<BrainAskResponse>(`${workspacePath(workspaceId)}/assistant/messages`, { method: "POST", body: JSON.stringify(input), signal }),
};
