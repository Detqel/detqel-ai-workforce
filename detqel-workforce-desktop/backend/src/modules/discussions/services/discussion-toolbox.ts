import { z } from "zod";
import { randomUUID } from "node:crypto";
import { RepositoryInvestigation } from "./repository-investigation.js";
import type { RepositorySnapshot } from "../../../shared/agents/graphs/task-plan.js";
import {
    AGENT_CONNECTOR_KINDS,
    AGENT_CONTEXT_CACHE,
    AGENT_TOOL_ERRORS,
    AGENT_TOOL_LIMITS,
    AGENT_TOOL_NAMES,
    type AgentConnectorKind,
} from "../../../constants/agentContextConstants.js";
import { DISCUSSION_SOURCE_TYPES } from "../../../constants/discussionConstants.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../shared/logging/logger.js";
import { redactText, truncate, untrusted } from "../../../shared/agents/context/data-guard.js";
import type { ToolCall, ToolDefinition } from "../../../shared/agents/litellm.client.js";
import type {
    AgentToolbox,
    AgentToolCallSummary,
    AgentToolResult,
    AgentToolSession,
    DiscussionSource,
} from "../../../shared/agents/graphs/discussion-runtime.js";
import type { SessionLocation } from "../../../shared/rag/file-server.js";
import type { KnowledgeDocument, SessionKnowledge } from "../../../shared/rag/session-knowledge.js";
import type { AgentConnector, AgentConnectorRead, IAgentConnectorAccess } from "../../connections/services/agent-connector-access.service.js";

const logger = createScopedLogger("discussion-toolbox");

export interface ToolboxRequest {
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly location: SessionLocation;
    readonly connectionIds: ReadonlyArray<string>;
    /** Business profile, goals and rules, already formatted. */
    readonly workspaceBrief: string;
}

const REPOSITORY_ACTIONS = {
    list_files: { operation: "list", resource: "files" },
    read_file: { operation: "read" },
    list_branches: { operation: "list", resource: "branches" },
    list_commits: { operation: "list", resource: "commits" },
    list_pull_requests: { operation: "list", resource: "pull-requests" },
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);

/** Builds a turn's reading tools from what the discussion has attached and uploaded. */
export class DiscussionToolboxFactory {
    constructor(private readonly connectors: IAgentConnectorAccess, private readonly knowledge: SessionKnowledge) {}

    async build(request: ToolboxRequest): Promise<AgentToolbox> {
        const [connectors, documents] = await Promise.all([
            request.connectionIds.length ? this.connectors.open(request.workspaceId, request.connectionIds) : Promise.resolve([]),
            this.knowledge.documents(request.location).catch(() => [] as KnowledgeDocument[]),
        ]);
        const cachedKnowledge = documents.length ? await this.knowledge.cacheable(request.location).catch(() => null) : null;
        const structures = await this.structures(request.workspaceId, connectors);
        const cachedContext = [
            request.workspaceBrief,
            connectorsContext(connectors, structures),
            knowledgeContext(documents, cachedKnowledge),
        ].filter(Boolean).join("\n\n");
        const available = connectors.filter(connector => !connector.unavailable);
        return {
            cachedContext,
            searchKnowledge: documents.length > 0 && cachedKnowledge === null,
            hasTools: available.length > 0 || documents.length > 0,
            repositoryCount: available.filter(connector => connector.kind === AGENT_CONNECTOR_KINDS.repository).length,
            start: (depth = "focused", snapshots = []) => new ToolSession(request, available, documents, this.connectors, this.knowledge, depth, snapshots),
        };
    }

    /** KAG: each connector's structure, described once and cached by the access layer. */
    private async structures(workspaceId: string, connectors: ReadonlyArray<AgentConnector>): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        let used = 0;
        for (const connector of connectors) {
            if (connector.unavailable) continue;
            try {
                const described = JSON.stringify((await this.connectors.describe(workspaceId, connector)).data);
                const remaining = AGENT_CONTEXT_CACHE.maxSchemaCharacters - used;
                if (remaining <= 0) break;
                const shown = truncate(described, remaining).text;
                used += shown.length;
                result.set(connector.alias, shown);
            } catch {
                logger.warn({ workspaceId, connectionId: connector.connectionId }, "Connector structure could not be described");
            }
        }
        return result;
    }
}

function connectorsContext(connectors: ReadonlyArray<AgentConnector>, structures: Map<string, string>): string {
    if (!connectors.length) return "";
    const lines = connectors.map(connector => {
        if (connector.unavailable) return `- ${connector.name}: unavailable (${connector.unavailable})`;
        const structure = structures.get(connector.alias);
        return `- "${connector.alias}" (${connector.kind}, ${connector.provider}: ${connector.name})${structure ? `\n${untrusted(`${connector.name} structure`, structure)}` : ""}`;
    });
    return `## Connectors attached to this discussion\nRead them with your tools, using the quoted names.\n${lines.join("\n")}`;
}

function knowledgeContext(documents: ReadonlyArray<KnowledgeDocument>, cached: string | null): string {
    if (!documents.length) return "";
    const list = documents.map(document => `- ${document.name}`).join("\n");
    if (cached !== null) return `## Knowledge documents\nThe full text of this discussion's knowledge documents follows.\n${list}\n${untrusted("knowledge documents", cached)}`;
    return `## Knowledge documents\nThese documents are too large to include here. Search them with search_knowledge, or read one with read_knowledge_document.\n${list}`;
}

function enumOf(values: ReadonlyArray<string>): Record<string, unknown> {
    return { type: "string", enum: [...values] };
}

/** One reply's tools. Enforces the reading budget and remembers identical reads so they are not repeated. */
class ToolSession implements AgentToolSession {
    private readonly repositoryInvestigation: RepositoryInvestigation;
    private prepared = false;
    readonly definitions: ReadonlyArray<ToolDefinition>;
    private used = 0;
    private repositoryUsed = 0;
    private readonly memo = new Map<string, AgentToolResult>();
    private readonly byAlias: Map<string, AgentConnector>;

    constructor(
        private readonly request: ToolboxRequest,
        private readonly connectors: ReadonlyArray<AgentConnector>,
        private readonly documents: ReadonlyArray<KnowledgeDocument>,
        private readonly access: IAgentConnectorAccess,
        private readonly knowledge: SessionKnowledge,
        private readonly depth: "focused" | "deep",
        snapshots: ReadonlyArray<RepositorySnapshot>,
    ) {
        this.repositoryInvestigation = new RepositoryInvestigation(request.workspaceId, access, depth === "deep" ? AGENT_TOOL_LIMITS.repositoryPagesPerScan : 1, snapshots);
        this.byAlias = new Map(connectors.map(connector => [connector.alias, connector]));
        this.definitions = this.buildDefinitions();
    }

    initialCalls(): ReadonlyArray<ToolCall> {
        if (this.prepared) return [];
        this.prepared = true;
        return this.connectors.filter(connector => connector.kind === AGENT_CONNECTOR_KINDS.repository).map(connector => ({ id: randomUUID(), name: AGENT_TOOL_NAMES.scanRepository, arguments: JSON.stringify({ connector: connector.alias }) }));
    }

    coverage(): string { return this.repositoryInvestigation.coverage(); }
    investigationNeeds(): ReadonlyArray<string> { return this.repositoryInvestigation.investigationNeeds(); }
    completionIssues(content: string): ReadonlyArray<string> { return this.repositoryInvestigation.completionIssues(content); }
    coverageReport(): string { return this.repositoryInvestigation.report(); }
    repositorySnapshots(): ReadonlyArray<RepositorySnapshot> { return this.repositoryInvestigation.snapshots(); }

    private get totalBudget() { return this.depth === "deep" ? AGENT_TOOL_LIMITS.maxTotalCharactersDeep : AGENT_TOOL_LIMITS.maxTotalCharacters; }
    private get repositoryBudget() { return this.depth === "deep" ? AGENT_TOOL_LIMITS.maxRepositoryCharactersDeep : AGENT_TOOL_LIMITS.maxRepositoryCharacters; }

    describe(call: ToolCall): AgentToolCallSummary {
        const args = parseArguments(call.arguments) ?? {};
        const connector = typeof args.connector === "string" ? this.byAlias.get(args.connector) : undefined;
        const target = connector?.name ?? (typeof args.name === "string" ? args.name : undefined);
        const action = typeof args.action === "string" ? args.action : typeof args.path === "string" ? args.path.slice(0, 120) : typeof args.tool === "string" ? args.tool : undefined;
        return { tool: call.name, ...(target ? { target } : {}), ...(action ? { action } : {}) };
    }

    async execute(call: ToolCall, signal?: AbortSignal): Promise<AgentToolResult> {
        signal?.throwIfAborted();
        const key = `${call.name}:${call.arguments}`;
        const remembered = this.memo.get(key);
        if (remembered && call.name !== AGENT_TOOL_NAMES.scanRepository && call.name !== AGENT_TOOL_NAMES.repositoryCoverage) return remembered;
        if (this.used >= this.totalBudget) return failure(AGENT_TOOL_ERRORS.budget);
        let result: AgentToolResult;
        try {
            if (call.arguments.length > AGENT_TOOL_LIMITS.maxArgumentCharacters) throw new AppError(400, AGENT_TOOL_ERRORS.unreadable);
            const args = parseArguments(call.arguments);
            if (args === null) throw new AppError(400, AGENT_TOOL_ERRORS.unreadable);
            result = await this.dispatch(call.name, args, signal);
        } catch (error) {
            // A refused or failed read is reported to the model, which can correct itself; it never ends the reply.
            result = failure(error instanceof AppError && error.statusCode < 500 ? error.message : error instanceof AppError ? error.message : "The read failed.");
            logger.info({ sessionId: this.request.sessionId, tool: call.name }, "Agent tool call was refused or failed");
        }
        this.used += result.content.length;
        signal?.throwIfAborted();
        this.memo.set(key, result);
        return result;
    }

    private connector(alias: unknown, kind?: AgentConnectorKind): AgentConnector {
        const connector = typeof alias === "string" ? this.byAlias.get(alias) : undefined;
        if (!connector || (kind && connector.kind !== kind)) throw new AppError(400, AGENT_TOOL_ERRORS.unknownConnector);
        return connector;
    }

    private async dispatch(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<AgentToolResult> {
        const { workspaceId, sessionId, location } = this.request;
        switch (name) {
            case AGENT_TOOL_NAMES.scanRepository: {
                const connector = this.connector(args.connector, AGENT_CONNECTOR_KINDS.repository);
                const input = z.object({ connector: z.string(), ref: z.string().max(255).optional(), offset: z.number().int().min(0).max(20_000).default(0) }).parse(args);
                const inventory = await this.repositoryInvestigation.scan(connector, input.ref, input.offset, signal);
                return this.result(`${connector.name} inventory`, JSON.stringify(inventory), [connectorSource(connector, `inventory@${inventory.commit}`)]);
            }
            case AGENT_TOOL_NAMES.repositoryCoverage:
                return { content: this.coverage(), sources: [] };
            case AGENT_TOOL_NAMES.searchKnowledge: {
                const { query } = z.object({ query: text(500) }).parse(args);
                const hits = await this.knowledge.search(workspaceId, sessionId, query);
                const body = hits.length ? hits.map(hit => `[${hit.source}]\n${hit.text}`).join("\n\n") : "No matching passages.";
                return this.result("knowledge search", body, hits.map(hit => knowledgeSource(hit.source)));
            }
            case AGENT_TOOL_NAMES.readKnowledgeDocument: {
                const { name: document, page } = z.object({ name: text(255), page: z.number().int().min(1).default(1) }).parse(args);
                const read = await this.knowledge.read(location, document, page);
                return this.result(`${read.name} (page ${read.page} of ${read.pages})`, read.text, [knowledgeSource(read.name)]);
            }
            case AGENT_TOOL_NAMES.describeConnector: {
                const connector = this.connector(args.connector);
                const described = await this.access.describe(workspaceId, connector);
                return this.result(`${connector.name} structure`, JSON.stringify(described.data, null, 1), [connectorSource(connector, "structure")]);
            }
            case AGENT_TOOL_NAMES.queryDatabase: {
                const connector = this.connector(args.connector, AGENT_CONNECTOR_KINDS.database);
                const { sql } = z.object({ connector: z.string(), sql: text(AGENT_TOOL_LIMITS.maxSqlCharacters) }).parse(args);
                return this.read(connector, { kind: AGENT_CONNECTOR_KINDS.database, sql }, "query");
            }
            case AGENT_TOOL_NAMES.readRepository: {
                const connector = this.connector(args.connector, AGENT_CONNECTOR_KINDS.repository);
                const input = z.object({
                    connector: z.string(),
                    action: z.enum(Object.keys(REPOSITORY_ACTIONS) as [keyof typeof REPOSITORY_ACTIONS, ...Array<keyof typeof REPOSITORY_ACTIONS>]),
                    path: z.string().max(1_024).optional(),
                    ref: z.string().max(255).optional(),
                    limit: z.number().int().min(1).max(100).optional(),
                    page: z.number().int().min(1).max(1_000_000).optional(),
                    offset: z.number().int().min(0).optional(),
                    length: z.number().int().min(1).max(8_000).optional(),
                }).parse(args);
                const action = REPOSITORY_ACTIONS[input.action];
                if (action.operation === "read" && this.repositoryUsed >= this.repositoryBudget) return failure(AGENT_TOOL_ERRORS.repositoryBudget);
                const ref = this.repositoryInvestigation.pinnedRef(connector, input.ref);
                const parameters: Record<string, unknown> = {
                    ...("resource" in action ? { resource: action.resource } : {}),
                    ...(input.path ? { path: input.path } : {}),
                    ...(ref ? { ref } : {}),
                    ...(input.limit ? { limit: input.limit } : {}),
                    ...(input.page !== undefined ? { page: input.page } : {}),
                    ...(input.offset !== undefined ? { offset: input.offset } : {}),
                    ...(input.length !== undefined ? { length: input.length } : {}),
                };
                const result = await this.read(connector, { kind: AGENT_CONNECTOR_KINDS.repository, operation: action.operation, parameters }, input.path ?? input.action);
                if (action.operation === "read") this.repositoryUsed += result.content.length;
                return result;
            }
            case AGENT_TOOL_NAMES.readFiles: {
                const connector = this.connector(args.connector, AGENT_CONNECTOR_KINDS.files);
                const input = z.object({ connector: z.string(), action: z.enum(["list", "read"]), path: text(1_024) }).parse(args);
                return this.read(connector, { kind: AGENT_CONNECTOR_KINDS.files, operation: input.action, path: input.path }, input.path);
            }
            case AGENT_TOOL_NAMES.fetchApi: {
                const connector = this.connector(args.connector, AGENT_CONNECTOR_KINDS.api);
                const { path } = z.object({ connector: z.string(), path: z.string().max(1_024).default("") }).parse(args);
                return this.read(connector, { kind: AGENT_CONNECTOR_KINDS.api, path }, path || "/");
            }
            case AGENT_TOOL_NAMES.listMcpTools: {
                const connector = this.connector(args.connector, AGENT_CONNECTOR_KINDS.mcp);
                return this.read(connector, { kind: AGENT_CONNECTOR_KINDS.mcp, operation: "list" }, "tools");
            }
            case AGENT_TOOL_NAMES.callMcpTool: {
                const connector = this.connector(args.connector, AGENT_CONNECTOR_KINDS.mcp);
                const input = z.object({ connector: z.string(), tool: text(200), arguments: z.record(z.string(), z.unknown()).default({}) }).parse(args);
                return this.read(connector, { kind: AGENT_CONNECTOR_KINDS.mcp, operation: "call", tool: input.tool, arguments: input.arguments }, input.tool);
            }
            default:
                throw new AppError(400, AGENT_TOOL_ERRORS.unknownTool);
        }
    }

    private async read(connector: AgentConnector, request: AgentConnectorRead, detail: string): Promise<AgentToolResult> {
        const result = await this.access.read(this.request.workspaceId, connector, request);
        const body = typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 1);
        const note = result.metadata.truncated ? "\n[Only the first rows are shown. Narrow the query to see others.]" : "";
        const payload = `${body}${note}\nRead metadata: ${JSON.stringify(result.metadata)}`;
        const limit = Math.min(this.depth === "deep" ? 24_000 : AGENT_TOOL_LIMITS.maxResultCharacters, Math.max(0, this.totalBudget - this.used));
        if (request.kind === AGENT_CONNECTOR_KINDS.repository && request.operation === "read") this.repositoryInvestigation.recordRead(connector.alias, result.metadata, redactText(payload).length <= limit);
        return this.result(`${connector.name}: ${detail}`, payload, [connectorSource(connector, typeof result.metadata.ref === "string" ? `${detail}@${result.metadata.ref}:${result.metadata.startLine ?? ""}` : detail)]);
    }

    private result(source: string, body: string, sources: ReadonlyArray<DiscussionSource>): AgentToolResult {
        const remaining = Math.max(0, this.totalBudget - this.used);
        const limited = truncate(redactText(body), Math.min(this.depth === "deep" ? 24_000 : AGENT_TOOL_LIMITS.maxResultCharacters, remaining));
        return { content: untrusted(source, limited.text), sources };
    }

    private buildDefinitions(): ToolDefinition[] {
        const definitions: ToolDefinition[] = [];
        const aliases = (kind?: AgentConnectorKind) => this.connectors.filter(connector => !kind || connector.kind === kind).map(connector => connector.alias);
        const connectorParam = (kind?: AgentConnectorKind) => ({ connector: { ...enumOf(aliases(kind)), description: "Name of the connector, as listed in the context." } });
        if (this.documents.length) {
            definitions.push({
                name: AGENT_TOOL_NAMES.searchKnowledge,
                description: "Search this discussion's knowledge documents for passages relevant to a question.",
                parameters: { type: "object", properties: { query: { type: "string", description: "What to look for." } }, required: ["query"], additionalProperties: false },
            }, {
                name: AGENT_TOOL_NAMES.readKnowledgeDocument,
                description: "Read one knowledge document, page by page.",
                parameters: {
                    type: "object",
                    properties: { name: enumOf(this.documents.map(document => document.name)), page: { type: "integer", minimum: 1, description: "Page number, starting at 1." } },
                    required: ["name"],
                    additionalProperties: false,
                },
            });
        }
        if (!this.connectors.length) return definitions;
        definitions.push({
            name: AGENT_TOOL_NAMES.describeConnector,
            description: "Describe a connector's structure: a database's tables, columns and relationships, a repository's layout and default branch, a folder's contents, or an MCP server's tools.",
            parameters: { type: "object", properties: connectorParam(), required: ["connector"], additionalProperties: false },
        });
        const has = (kind: AgentConnectorKind) => this.connectors.some(connector => connector.kind === kind);
        if (has(AGENT_CONNECTOR_KINDS.database)) definitions.push({
            name: AGENT_TOOL_NAMES.queryDatabase,
            description: `Run one read-only SQL SELECT (or WITH) query on a PostgreSQL connector. It runs in a read-only transaction and returns at most ${AGENT_TOOL_LIMITS.maxRows} rows. Use filters, aggregates and LIMIT.`,
            parameters: { type: "object", properties: { ...connectorParam(AGENT_CONNECTOR_KINDS.database), sql: { type: "string" } }, required: ["connector", "sql"], additionalProperties: false },
        });
        if (has(AGENT_CONNECTOR_KINDS.repository)) definitions.push({
            name: AGENT_TOOL_NAMES.scanRepository,
            description: "Discover the entire eligible repository tree in bounded stages, pinned to one commit. Repeat until inventoryComplete or a reported limit/error. Then page the discovered paths using nextManifestOffset. This lists paths; it does not read source code.",
            parameters: { type: "object", properties: { ...connectorParam(AGENT_CONNECTOR_KINDS.repository), ref: { type: "string" }, offset: { type: "integer", minimum: 0, maximum: 20_000 } }, required: ["connector"], additionalProperties: false },
        }, {
            name: AGENT_TOOL_NAMES.repositoryCoverage,
            description: "Show measured repository coverage: commit, discovered modules, complete/partial file reads, missing areas, exclusions and failures. Use this before claiming a repository analysis is complete.",
            parameters: { type: "object", properties: {}, additionalProperties: false },
        }, {
            name: AGENT_TOOL_NAMES.readRepository,
            description: "Read repository evidence at the inventoried commit. Directory listings return nextPage. Text files are paged with offset/length and return nextOffset; follow it for the rest of the file. Read manifests and entry points, then relevant modules and cross-module flows. A listed path is not an inspected file.",
            parameters: {
                type: "object",
                properties: {
                    ...connectorParam(AGENT_CONNECTOR_KINDS.repository),
                    action: enumOf(Object.keys(REPOSITORY_ACTIONS)),
                    path: { type: "string", description: "Folder or file path from the repository root. Empty for the root folder." },
                    ref: { type: "string", description: "Branch, tag or commit. Defaults to the default branch." },
                    limit: { type: "integer", minimum: 1, maximum: 100 },
                    page: { type: "integer", minimum: 1, description: "Directory page; pass nextPage exactly as returned." },
                    offset: { type: "integer", minimum: 0, description: "Character offset for read_file; start at zero, then use nextOffset." },
                    length: { type: "integer", minimum: 1, maximum: 8000, description: "Characters to read in a file page; at most 8000." },
                },
                required: ["connector", "action"],
                additionalProperties: false,
            },
        });
        if (has(AGENT_CONNECTOR_KINDS.files)) definitions.push({
            name: AGENT_TOOL_NAMES.readFiles,
            description: "Read an uploaded file using its exact filename from describe_connector. For a connected folder, list or read using an absolute path inside that folder. No other filesystem locations are accessible.",
            parameters: {
                type: "object",
                properties: { ...connectorParam(AGENT_CONNECTOR_KINDS.files), action: enumOf(["list", "read"]), path: { type: "string" } },
                required: ["connector", "action", "path"],
                additionalProperties: false,
            },
        });
        if (has(AGENT_CONNECTOR_KINDS.api)) definitions.push({
            name: AGENT_TOOL_NAMES.fetchApi,
            description: "Send a GET request to a connected HTTP API. The path is relative to the connector's endpoint and stays on its host.",
            parameters: { type: "object", properties: { ...connectorParam(AGENT_CONNECTOR_KINDS.api), path: { type: "string", description: "Relative path and query, for example /orders?status=open." } }, required: ["connector"], additionalProperties: false },
        });
        if (has(AGENT_CONNECTOR_KINDS.mcp)) definitions.push({
            name: AGENT_TOOL_NAMES.listMcpTools,
            description: "List the tools a connected MCP server offers and which of them are read-only.",
            parameters: { type: "object", properties: connectorParam(AGENT_CONNECTOR_KINDS.mcp), required: ["connector"], additionalProperties: false },
        }, {
            name: AGENT_TOOL_NAMES.callMcpTool,
            description: "Call a read-only tool on a connected MCP server. Tools that may change data are refused.",
            parameters: {
                type: "object",
                properties: { ...connectorParam(AGENT_CONNECTOR_KINDS.mcp), tool: { type: "string" }, arguments: { type: "object", description: "Arguments matching the tool's input schema." } },
                required: ["connector", "tool"],
                additionalProperties: false,
            },
        });
        return definitions;
    }
}

function parseArguments(raw: string): Record<string, unknown> | null {
    try {
        const value: unknown = JSON.parse(raw || "{}");
        return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

function failure(message: string): AgentToolResult {
    return { content: `Error: ${message}`, sources: [] };
}

function knowledgeSource(name: string): DiscussionSource {
    return { type: DISCUSSION_SOURCE_TYPES.knowledge, title: name, reference: name };
}

function connectorSource(connector: AgentConnector, detail: string): DiscussionSource {
    return { type: DISCUSSION_SOURCE_TYPES.connection, title: `${connector.name}: ${detail}`.slice(0, 255), reference: `${connector.connectionId}:${detail}`.slice(0, 1_000) };
}
