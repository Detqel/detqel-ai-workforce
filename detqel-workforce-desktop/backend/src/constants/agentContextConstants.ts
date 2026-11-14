/**
 * How discussion agents read data. Agents never touch a connector or a file directly: every read goes through
 * the agent context layer, which allows only read operations on connectors attached to the session, caps how much
 * comes back, removes credentials, and hands the result to the model as untrusted data.
 *
 * Three grounding strategies are combined, each where it fits:
 * - CAG (cache-augmented): small, stable context (business profile, rules, goals, a small knowledge base, connector
 *   schemas) is placed in the cacheable system prefix, so it costs nothing to re-read on later turns.
 * - RAG (retrieval-augmented): knowledge too large for the prefix is chunked, embedded and searched per question.
 * - KAG (knowledge-augmented): structured sources are described as a graph the agent can reason over, such as a
 *   database's tables, columns and foreign keys, or a repository's layout.
 */
export const AGENT_TOOL_NAMES = {
    searchKnowledge: "search_knowledge",
    readKnowledgeDocument: "read_knowledge_document",
    describeConnector: "describe_connector",
    queryDatabase: "query_database",
    readRepository: "read_repository",
    readFiles: "read_files",
    fetchApi: "fetch_api",
    listMcpTools: "list_mcp_tools",
    callMcpTool: "call_mcp_tool",
} as const;
export type AgentToolName = (typeof AGENT_TOOL_NAMES)[keyof typeof AGENT_TOOL_NAMES];

/** How a connector is read, decided from its adapter. Connectors without a reader are not offered to agents. */
export const AGENT_CONNECTOR_KINDS = {
    database: "database",
    repository: "repository",
    files: "files",
    api: "api",
    mcp: "mcp",
} as const;
export type AgentConnectorKind = (typeof AGENT_CONNECTOR_KINDS)[keyof typeof AGENT_CONNECTOR_KINDS];

export const AGENT_TOOL_LIMITS = {
    /** Model calls in one investigation, so a reply cannot loop forever. */
    maxRounds: 6,
    /** Fast replies investigate briefly. */
    maxRoundsFast: 2,
    /** Tool calls in one investigation, across all rounds. */
    maxCalls: 12,
    /** Tool calls the model may ask for in one round. */
    maxCallsPerRound: 4,
    /** Characters one tool result may hand to the model. */
    maxResultCharacters: 12_000,
    /** Characters all tool results of one investigation may hand to the model. */
    maxTotalCharacters: 48_000,
    /** Characters of repository source the agent may read in one investigation, so a codebase cannot be drained. */
    maxRepositoryCharacters: 30_000,
    /** Rows a database query returns to the agent. */
    maxRows: 200,
    maxSqlCharacters: 4_000,
    maxArgumentCharacters: 8_000,
    /** Characters of one knowledge document read per call; larger documents are read page by page. */
    knowledgePageCharacters: 8_000,
    knowledgeSearchResults: 6,
} as const;

/** CAG: what fits in the cacheable prefix. Larger knowledge bases fall back to retrieval. */
export const AGENT_CONTEXT_CACHE = {
    /** Total characters of session knowledge preloaded whole into the prefix. */
    maxKnowledgeCharacters: 24_000,
    maxBusinessCharacters: 6_000,
    maxSchemaCharacters: 8_000,
    /** How long a connector's discovered structure is reused before it is read again. */
    schemaTtlMs: 10 * 60_000,
    maxSchemaTables: 60,
    maxColumnsPerTable: 40,
} as const;

/** Hybrid retrieval: vector candidates are re-ranked with keyword overlap, and weak matches are dropped. */
export const AGENT_RETRIEVAL = {
    candidateMultiplier: 3,
    vectorWeight: 0.75,
    keywordWeight: 0.25,
    minimumScore: 0.2,
} as const;

/** Files never handed to an agent, whatever connector they come from: credentials, keys and environment files. */
export const AGENT_PROTECTED_FILE_PATTERNS: readonly RegExp[] = [
    /(^|\/)\.env(\.[^/]*)?$/i,
    /(^|\/)\.(npmrc|pypirc|netrc|pgpass|git-credentials|htpasswd|dockercfg)$/i,
    /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.pub)?$/i,
    /\.(pem|key|p12|pfx|jks|keystore|kdbx|gpg|asc|ovpn)$/i,
    /(^|\/)(credentials|secrets?)(\.[a-z0-9]+)?$/i,
    /(^|\/)\.(aws|ssh|gnupg|docker|kube)\//i,
    /(^|\/)(terraform\.tfstate|.*\.tfvars)(\.backup)?$/i,
    /(^|\/)backend\.env$/i,
];

/**
 * Columns whose values are withheld from agents. Matched against whole segments of the column name in snake case
 * (`passwordHash` becomes `password_hash`), so `shipping` or `classname` are not mistaken for `pin` or `ssn`.
 */
export const AGENT_SENSITIVE_COLUMN_PATTERN = /(?:^|_)(?:password|passwd|passphrase|pwd|secret|secrets|token|api_?key|access_?key|private_?key|client_?secret|salt|otp|pin|cvv|cvc|card_?number|ssn|social_security|iban|routing_?number|credential|credentials)(?:_|$)/;

/** Values that look like credentials or payment cards are masked in any text an agent reads. */
export const AGENT_SECRET_VALUE_PATTERNS: readonly RegExp[] = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g,
    /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
    /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bAIza[0-9A-Za-z_-]{35}\b/g,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    /\b(?:dpk|tvly|ATATT)[_-][A-Za-z0-9_-]{20,}\b/g,
    /((?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)\s*[:=]\s*)(["']?)[^\s"',;]{6,}\2/gi,
];
export const AGENT_REDACTION = "[redacted]";

/**
 * SQL an agent may never run, even in a read-only transaction: functions that read the server's files, reach
 * other servers, change settings or affect other sessions, and catalogs that hold credentials.
 */
export const AGENT_FORBIDDEN_SQL = /\b(pg_read_file|pg_read_binary_file|pg_ls_\w+|pg_stat_file|lo_import|lo_export|lo_get|lo_from_bytea|dblink\w*|postgres_fdw|pg_sleep\w*|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|set_config|pg_advisory\w*|pg_authid|pg_shadow|pg_user_mapping|pg_user_mappings|pg_hba_file_rules|pg_file_settings|current_setting|txid_current|nextval|setval)\b|\binto\s+(temp|temporary|unlogged|table)?\s*[a-z_"]/i;

/** Tool results are wrapped so the model treats them as data, never as instructions. */
export const AGENT_UNTRUSTED_DATA = { open: "<untrusted_data", close: "</untrusted_data>" } as const;

export const AGENT_TOOL_ERRORS = {
    unknownTool: "That tool is not available in this discussion.",
    unknownConnector: "That connector is not attached to this discussion.",
    unreadable: "The arguments were not valid JSON for this tool.",
    budget: "The reading budget for this reply is used up. Answer with what you have.",
    protectedFile: "This file holds credentials or keys and is never read.",
    repositoryBudget: "The repository reading budget for this reply is used up. Summarize what you have instead of reading more source.",
    forbiddenSql: "The query uses a function or catalog agents may not access.",
    writeTool: "This MCP tool may change data, so agents cannot call it. Only tools the server marks read-only are available.",
    unavailable: "The connector could not be reached. Reconnect it from the Connectors page.",
} as const;
