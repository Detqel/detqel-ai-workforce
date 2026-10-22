import { API_PATHS, API_ACTIONS } from "@/constants/apiConstants";
import { apiRequest } from "./resource-client";

export type ConnectorStatus = "pending" | "connected" | "disconnected" | "error" | "active" | "inactive";

export interface ConnectorRecord {
  id: string;
  workspaceId: string;
  catalogId: string | null;
  name: string;
  provider: string;
  connectionType: string;
  dataStream: string | null;
  status: ConnectorStatus;
  configuration: Record<string, unknown>;
  configuredSecretFields: string[];
  verificationMetadata: Record<string, unknown> | null;
  verifiedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorInput {
  workspaceId: string;
  catalogId: string;
  name: string;
  dataStream?: string | null;
  configuration: Record<string, unknown>;
}

export interface ConnectorUpdate {
  name?: string;
  dataStream?: string | null;
  configuration?: Record<string, unknown>;
}

const workspaceQuery = (workspaceId: string) => new URLSearchParams({ workspaceId }).toString();
const connectionUrl = (id: string, workspaceId: string) => `${API_PATHS.connections}/${encodeURIComponent(id)}?${workspaceQuery(workspaceId)}`;

export const connectorsApi = {
  list: (params: { workspaceId: string }, signal?: AbortSignal) =>
    apiRequest<ConnectorRecord[]>(`${API_PATHS.connections}?${workspaceQuery(params.workspaceId)}`, { signal, cache: "no-store" }),
  create: (payload: ConnectorInput) =>
    apiRequest<ConnectorRecord>(API_PATHS.connections, { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, workspaceId: string, payload: ConnectorUpdate) =>
    apiRequest<ConnectorRecord>(connectionUrl(id, workspaceId), { method: "PATCH", body: JSON.stringify(payload) }),
  verify: (payload: Omit<ConnectorInput, "dataStream">) =>
    apiRequest<{ success: true; metadata: Record<string, unknown> }>(`${API_PATHS.connections}/${API_ACTIONS.verifyConnection}`, { method: "POST", body: JSON.stringify(payload) }),
  reconnect: (id: string, workspaceId: string) =>
    apiRequest<ConnectorRecord>(`${API_PATHS.connections}/${encodeURIComponent(id)}/${API_ACTIONS.reconnect}?${workspaceQuery(workspaceId)}`, { method: "POST" }),
  disconnect: (id: string, workspaceId: string) =>
    apiRequest<ConnectorRecord>(`${API_PATHS.connections}/${encodeURIComponent(id)}/${API_ACTIONS.disconnect}?${workspaceQuery(workspaceId)}`, { method: "POST" }),
  remove: (id: string, workspaceId: string) =>
    apiRequest<{ success: boolean }>(connectionUrl(id, workspaceId), { method: "DELETE" }),
};
