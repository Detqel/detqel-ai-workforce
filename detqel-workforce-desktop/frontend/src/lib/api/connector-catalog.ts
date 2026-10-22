import { API_PATHS } from "@/constants/apiConstants";
import { apiRequest } from "./resource-client";

export interface ConfigurationSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, ConfigurationSchema>;
  required?: string[];
  enum?: Array<string | number | boolean | null>;
  enumNames?: string[];
  const?: unknown;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  additionalProperties?: boolean | ConfigurationSchema;
  items?: ConfigurationSchema;
  allOf?: ConfigurationSchema[];
  if?: ConfigurationSchema;
  then?: ConfigurationSchema;
  else?: ConfigurationSchema;
  "x-secret"?: boolean;
  "x-visibleWhen"?: Record<string, unknown>;
}

export interface ConnectorCatalogEntry {
  id: string;
  code: string;
  name: string;
  connectorType: string;
  category: string;
  description: string | null;
  adapterKey: string;
  iconKey: string;
  isEnabled: boolean;
}

export interface ConnectorCatalogDetail extends ConnectorCatalogEntry {
  configSchema: ConfigurationSchema;
}

export const connectorCatalogApi = {
  list: (params: { workspaceId: string; connectorType: string; category?: string }, signal?: AbortSignal) =>
    apiRequest<ConnectorCatalogEntry[]>(`${API_PATHS.connectorCatalog}?${new URLSearchParams({ workspaceId: params.workspaceId, connectorType: params.connectorType, ...(params.category ? { category: params.category } : {}) })}`, { signal, cache: "no-store" }),
  get: (id: string, workspaceId: string, signal?: AbortSignal) =>
    apiRequest<ConnectorCatalogDetail>(`${API_PATHS.connectorCatalog}/${encodeURIComponent(id)}?${new URLSearchParams({ workspaceId })}`, { signal, cache: "no-store" }),
};
