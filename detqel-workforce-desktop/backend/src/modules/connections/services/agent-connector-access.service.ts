import { CONNECTOR_ADAPTER_KEYS } from "../../../constants/connectionConstants.js";
import { CONNECTOR_OPERATIONS } from "../../../constants/connectorOperationConstants.js";
import {
    AGENT_CONNECTOR_KINDS,
    AGENT_CONTEXT_CACHE,
    AGENT_TOOL_ERRORS,
    type AgentConnectorKind,
} from "../../../constants/agentContextConstants.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../shared/logging/logger.js";
import { isProtectedFile, redactValue } from "../../../shared/agents/context/data-guard.js";
import type { ConnectorOperationResult } from "../../../shared/types/connector-catalog.js";
import type { ConnectionReader, ConnectionService } from "./connection.service.js";

const logger = createScopedLogger("agent-connector-access");

/** A connector attached to a discussion, as an agent sees it. Ids and credentials stay on the server. */
export interface AgentConnector {
    /** Short name the agent uses to pick this connector, such as "sales-db". */
    readonly alias: string;
    readonly connectionId: string;
    readonly name: string;
    readonly provider: string;
    readonly kind: AgentConnectorKind;
    /** Set when the connector could not be opened; the agent is told it is unavailable. */
    readonly unavailable?: string;
}

/** A read request the agent layer has already validated. Only read operations exist here. */
export type AgentConnectorRead =
    | { readonly kind: typeof AGENT_CONNECTOR_KINDS.database; readonly sql: string }
    | { readonly kind: typeof AGENT_CONNECTOR_KINDS.repository; readonly operation: "list" | "read"; readonly parameters: Record<string, unknown> }
    | { readonly kind: typeof AGENT_CONNECTOR_KINDS.files; readonly operation: "list" | "read"; readonly path: string }
    | { readonly kind: typeof AGENT_CONNECTOR_KINDS.api; readonly path: string }
    | { readonly kind: typeof AGENT_CONNECTOR_KINDS.mcp; readonly operation: "list" }
    | { readonly kind: typeof AGENT_CONNECTOR_KINDS.mcp; readonly operation: "call"; readonly tool: string; readonly arguments: Record<string, unknown> };

export interface AgentReadResult {
    /** Redacted data, safe to show the model. */
    readonly data: unknown;
    readonly metadata: Record<string, unknown>;
}

export interface IAgentConnectorAccess {
    /** Opens the given attached connections for reading. A connection that cannot be opened is reported, not thrown. */
    open(workspaceId: string, connectionIds: ReadonlyArray<string>): Promise<AgentConnector[]>;
    /** KAG: the connector's structure (a database's tables and relationships, a repository's layout, MCP tools). */
    describe(workspaceId: string, connector: AgentConnector): Promise<AgentReadResult>;
    read(workspaceId: string, connector: AgentConnector, request: AgentConnectorRead): Promise<AgentReadResult>;
}

/** Decides how a connector is read from its adapter. Connectors without a safe reader are not offered to agents. */
export function agentKindOf(adapterKey: string): AgentConnectorKind | null {
    if (adapterKey === CONNECTOR_ADAPTER_KEYS.postgres) return AGENT_CONNECTOR_KINDS.database;
    if (adapterKey.startsWith("repository.")) return AGENT_CONNECTOR_KINDS.repository;
    if (adapterKey === CONNECTOR_ADAPTER_KEYS.file || adapterKey === CONNECTOR_ADAPTER_KEYS.directory) return AGENT_CONNECTOR_KINDS.files;
    if (adapterKey === CONNECTOR_ADAPTER_KEYS.http || adapterKey === CONNECTOR_ADAPTER_KEYS.environmentHttp) return AGENT_CONNECTOR_KINDS.api;
    if (adapterKey.startsWith("mcp.")) return AGENT_CONNECTOR_KINDS.mcp;
    return null;
}

/** A short, readable, unique name for the agent to refer to a connector by. */
function aliasFor(name: string, taken: Set<string>): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "connector";
    let alias = base;
    for (let index = 2; taken.has(alias); index++) alias = `${base}-${index}`;
    taken.add(alias);
    return alias;
}

// KAG for databases: one row per table, and one per foreign key, so the agent sees the schema as a graph.
const SCHEMA_TABLES_SQL = `SELECT c.table_schema AS schema, c.table_name AS "table",
    string_agg(c.column_name || ' ' || c.data_type, ', ' ORDER BY c.ordinal_position) AS columns
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND t.table_type IN ('BASE TABLE', 'VIEW')
GROUP BY c.table_schema, c.table_name
ORDER BY c.table_schema, c.table_name`;
const SCHEMA_RELATIONS_SQL = `SELECT kcu.table_schema || '.' || kcu.table_name || '.' || kcu.column_name AS "from",
    ccu.table_schema || '.' || ccu.table_name || '.' || ccu.column_name AS "to"
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY 1`;

/**
 * The only path from an agent to a connector. Every request is read-only by construction (there is no write
 * operation to ask for), targets a connection in the workspace that the discussion attached, and returns redacted
 * data. Structure discovery is cached for a few minutes, so describing a connector on each turn costs one read.
 * Each read is logged with the connector and operation only, never the data.
 */
export class AgentConnectorAccess implements IAgentConnectorAccess {
    private readonly structures = new Map<string, { expires: number; value: AgentReadResult }>();

    constructor(private readonly connections: Pick<ConnectionService, "readerFor">) {}

    async open(workspaceId: string, connectionIds: ReadonlyArray<string>): Promise<AgentConnector[]> {
        const taken = new Set<string>();
        const connectors: AgentConnector[] = [];
        for (const connectionId of connectionIds) {
            try {
                const reader = await this.connections.readerFor(connectionId, workspaceId);
                const kind = agentKindOf(reader.adapterKey);
                if (!kind) continue;
                connectors.push({ alias: aliasFor(reader.name, taken), connectionId, name: reader.name, provider: reader.provider, kind });
            } catch (error) {
                // The agent is told the connector is unavailable instead of the whole reply failing.
                const message = error instanceof AppError && error.statusCode < 500 ? error.message : AGENT_TOOL_ERRORS.unavailable;
                logger.warn({ workspaceId, connectionId }, "An attached connector could not be opened for an agent");
                connectors.push({ alias: aliasFor("unavailable", taken), connectionId, name: "Unavailable connector", provider: "", kind: AGENT_CONNECTOR_KINDS.api, unavailable: message });
            }
        }
        return connectors;
    }

    async describe(workspaceId: string, connector: AgentConnector): Promise<AgentReadResult> {
        const cached = this.structures.get(connector.connectionId);
        if (cached && cached.expires > Date.now()) return cached.value;
        const reader = await this.reader(workspaceId, connector);
        const value = await this.structure(reader, connector.kind);
        this.structures.set(connector.connectionId, { expires: Date.now() + AGENT_CONTEXT_CACHE.schemaTtlMs, value });
        return value;
    }

    async read(workspaceId: string, connector: AgentConnector, request: AgentConnectorRead): Promise<AgentReadResult> {
        if (request.kind !== connector.kind) throw new AppError(400, `"${connector.alias}" is not a ${request.kind} connector.`);
        const reader = await this.reader(workspaceId, connector);
        logger.info({ workspaceId, connectionId: connector.connectionId, kind: request.kind, operation: "operation" in request ? request.operation : "read" }, "Agent read a connector");
        switch (request.kind) {
            case AGENT_CONNECTOR_KINDS.database:
                return this.clean(await this.run(reader, CONNECTOR_OPERATIONS.query, { sql: request.sql }));
            case AGENT_CONNECTOR_KINDS.repository: {
                const path = typeof request.parameters.path === "string" ? request.parameters.path : "";
                if (request.operation === "read" && isProtectedFile(path)) throw new AppError(403, AGENT_TOOL_ERRORS.protectedFile);
                const result = await this.run(reader, request.operation === "read" ? CONNECTOR_OPERATIONS.read : CONNECTOR_OPERATIONS.list, request.parameters);
                return this.clean(request.operation === "list" ? withoutProtectedEntries(result) : result);
            }
            case AGENT_CONNECTOR_KINDS.files: {
                if (request.operation === "read" && isProtectedFile(request.path)) throw new AppError(403, AGENT_TOOL_ERRORS.protectedFile);
                const result = await this.run(reader, request.operation === "read" ? CONNECTOR_OPERATIONS.read : CONNECTOR_OPERATIONS.list, { path: request.path });
                return this.clean(request.operation === "list" ? withoutProtectedEntries(result) : result);
            }
            case AGENT_CONNECTOR_KINDS.api:
                // GET only: the HTTP connector's write, update and delete operations are never reachable from here.
                return this.clean(await this.run(reader, CONNECTOR_OPERATIONS.fetch, { path: request.path }));
            case AGENT_CONNECTOR_KINDS.mcp:
                if (request.operation === "list") return this.clean(await this.run(reader, CONNECTOR_OPERATIONS.list, {}));
                // declaredMutating stays false, so the adapter only runs tools the server marks read-only.
                return this.clean(await this.run(reader, CONNECTOR_OPERATIONS.invokeTool, { name: request.tool, arguments: request.arguments }, false).catch(error => {
                    // Agents cannot confirm a change, so the refusal tells the model to use a read-only tool instead.
                    if (error instanceof AppError && error.statusCode === 403) throw new AppError(403, AGENT_TOOL_ERRORS.writeTool);
                    throw error;
                }));
        }
    }

    private async reader(workspaceId: string, connector: AgentConnector): Promise<ConnectionReader> {
        if (connector.unavailable) throw new AppError(503, connector.unavailable);
        const reader = await this.connections.readerFor(connector.connectionId, workspaceId);
        if (agentKindOf(reader.adapterKey) !== connector.kind) throw new AppError(409, "The connector changed. Ask again to use its new settings.");
        return reader;
    }

    private async run(reader: ConnectionReader, operation: string, parameters: Record<string, unknown>, declaredMutating?: boolean): Promise<ConnectorOperationResult> {
        if (typeof reader.handle.execute !== "function") throw new AppError(422, "This connector cannot be read by agents.");
        return reader.handle.execute({ operation, parameters, ...(declaredMutating === undefined ? {} : { declaredMutating }) });
    }

    private clean(result: ConnectorOperationResult): AgentReadResult {
        return { data: redactValue(result.data), metadata: (redactValue(result.metadata ?? {}) ?? {}) as Record<string, unknown> };
    }

    private async structure(reader: ConnectionReader, kind: AgentConnectorKind): Promise<AgentReadResult> {
        const about = { connector: reader.name, provider: reader.provider };
        switch (kind) {
            case AGENT_CONNECTOR_KINDS.database: {
                const tables = await this.run(reader, CONNECTOR_OPERATIONS.query, { sql: SCHEMA_TABLES_SQL });
                const relations = await this.run(reader, CONNECTOR_OPERATIONS.query, { sql: SCHEMA_RELATIONS_SQL }).catch(() => ({ data: [] }));
                const rows = (tables.data as Array<Record<string, unknown>>).slice(0, AGENT_CONTEXT_CACHE.maxSchemaTables).map(row => ({
                    table: `${String(row.schema)}.${String(row.table)}`,
                    columns: String(row.columns ?? "").split(", ").slice(0, AGENT_CONTEXT_CACHE.maxColumnsPerTable).join(", "),
                }));
                return { data: { ...about, database: reader.configuration.database ?? null, tables: rows, relationships: relations.data }, metadata: { tables: rows.length } };
            }
            case AGENT_CONNECTOR_KINDS.repository: {
                const root = await this.run(reader, CONNECTOR_OPERATIONS.list, { resource: "files" }).catch(() => ({ data: [] }));
                const metadata = reader.metadata;
                return this.clean({
                    data: { ...about, repository: metadata.repository, defaultBranch: metadata.defaultBranch, visibility: metadata.visibility, root: withoutProtectedEntries(root).data },
                    metadata: {},
                });
            }
            case AGENT_CONNECTOR_KINDS.files: {
                const kindOfPath = reader.adapterKey === CONNECTOR_ADAPTER_KEYS.directory ? "folder" : "file";
                const path = String(kindOfPath === "file" ? reader.configuration.fileName : reader.configuration.path);
                const listing = kindOfPath === "folder" ? withoutProtectedEntries(await this.run(reader, CONNECTOR_OPERATIONS.list, { path })).data : null;
                return { data: { ...about, kind: kindOfPath, path, entries: listing }, metadata: {} };
            }
            case AGENT_CONNECTOR_KINDS.api:
                return { data: { ...about, endpoint: reader.configuration.endpoint ?? null, origin: reader.metadata.origin ?? null }, metadata: {} };
            case AGENT_CONNECTOR_KINDS.mcp: {
                const tools = await this.run(reader, CONNECTOR_OPERATIONS.list, {});
                const list = (tools.data as Array<{ name: string; description: string; readOnly: boolean }>).map(tool => ({ name: tool.name, description: tool.description, readOnly: tool.readOnly }));
                return { data: { ...about, server: reader.configuration.serverName ?? null, tools: list }, metadata: { tools: list.length } };
            }
        }
    }
}

/** Removes credential and key files from a directory listing, so the agent never learns to ask for them. */
function withoutProtectedEntries(result: ConnectorOperationResult): ConnectorOperationResult {
    if (!Array.isArray(result.data)) return result;
    const data = result.data.filter(entry => {
        if (entry === null || typeof entry !== "object") return true;
        const record = entry as { path?: unknown; name?: unknown };
        const path = typeof record.path === "string" ? record.path : typeof record.name === "string" ? record.name : "";
        return !isProtectedFile(path);
    });
    return { ...result, data };
}
