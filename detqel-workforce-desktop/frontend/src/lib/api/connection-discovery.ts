import { API_PATHS } from "@/constants/apiConstants";
import { apiRequest } from "./resource-client";

export interface ConfigurationSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
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
  "x-placeholder"?: string;
  "x-visibleWhen"?: Record<string, unknown>;
  "x-access-scope"?: "single-repository-read-only";
}

export interface DiscoveredConnection {
  discovery?: { sources: Array<{ title: string; url: string }>; instructions: string } | null;
  id: string;
  code: string;
  name: string;
  description: string | null;
  adapterKey: string;
  iconKey: string;
  isEnabled: boolean;
}

export interface ConnectionDefinitionDetail extends DiscoveredConnection {
  configSchema: ConfigurationSchema;
}

export const connectionDiscoveryApi = {
  discover: (params: { workspaceId: string; query: string }, signal?: AbortSignal) =>
    apiRequest<{ entries: DiscoveredConnection[]; message: string; sources: Array<{ title: string; url: string }> }>(`${API_PATHS.connections}/discover`, { method: "POST", body: JSON.stringify(params), signal, cache: "no-store" }),
  get: (id: string, workspaceId: string, signal?: AbortSignal) =>
    apiRequest<ConnectionDefinitionDetail>(`${API_PATHS.connectionDefinitions}/${encodeURIComponent(id)}?${new URLSearchParams({ workspaceId })}`, { signal, cache: "no-store" }),
};
