import { AGENT_CONNECTOR_KINDS, type AgentConnectorKind } from "../../../constants/agentContextConstants.js";
import { CONNECTOR_ADAPTER_KEYS } from "../../../constants/connectionConstants.js";

/** Shared by execution and presentation so displayed access follows the enforced agent policy. */
export function agentKindOf(adapterKey: string): AgentConnectorKind | null {
    if (adapterKey === CONNECTOR_ADAPTER_KEYS.postgres) return AGENT_CONNECTOR_KINDS.database;
    if (adapterKey === CONNECTOR_ADAPTER_KEYS.mongodb) return AGENT_CONNECTOR_KINDS.mcp;
    if (adapterKey.startsWith("repository.")) return AGENT_CONNECTOR_KINDS.repository;
    if (adapterKey === CONNECTOR_ADAPTER_KEYS.file || adapterKey === CONNECTOR_ADAPTER_KEYS.directory) return AGENT_CONNECTOR_KINDS.files;
    if (adapterKey === CONNECTOR_ADAPTER_KEYS.http || adapterKey === CONNECTOR_ADAPTER_KEYS.environmentHttp) return AGENT_CONNECTOR_KINDS.api;
    if (adapterKey.startsWith("mcp.")) return AGENT_CONNECTOR_KINDS.mcp;
    return null;
}

/** Agent readers expose only read operations; other adapters are verification-only. */
export function connectionAgentAccess(adapterKey: string): "read-only" | "verification-only" {
    return agentKindOf(adapterKey) === null ? "verification-only" : "read-only";
}
