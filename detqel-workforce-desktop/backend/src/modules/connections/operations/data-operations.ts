import { readFile, readdir, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Sql } from "postgres";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConnectorOperationRequest, ConnectorOperationResult } from "../../../shared/types/connector-catalog.js";
import { CONNECTOR_OPERATIONS } from "../../../constants/connectorOperationConstants.js";
import { allowedFilesystemPath, requiredString } from "../adapters/adapter-configuration.js";
import { AGENT_FORBIDDEN_SQL, AGENT_TOOL_ERRORS, AGENT_TOOL_LIMITS } from "../../../constants/agentContextConstants.js";

/** A leading-keyword check that admits only read-only SQL for the autonomous query path. */
const READ_ONLY_SQL = /^\s*(?:select|with)\b/i;
const FORBIDDEN_SQL = /\b(?:insert|update|delete|drop|alter|truncate|create|grant|revoke|merge|call|do|execute|prepare|listen|notify|vacuum|reindex|discard)\b/i;

/**
 * Checks a query for the read-only path and returns it without a trailing semicolon. It must be one SELECT or WITH
 * statement that uses no data-changing keyword and none of the functions or catalogs agents may not touch.
 */
export function readOnlyStatement(statement: string): string {
    const trimmed = statement.trim().replace(/;\s*$/, "").trimEnd();
    if (trimmed.length > AGENT_TOOL_LIMITS.maxSqlCharacters) throw new AppError(400, "The query is too long.");
    // One statement only; a semicolon could start a second one.
    if (trimmed.includes(";") || !READ_ONLY_SQL.test(trimmed) || FORBIDDEN_SQL.test(trimmed)) {
        throw new AppError(400, "Only a single read-only SQL query (SELECT or WITH) runs on the query path.");
    }
    if (AGENT_FORBIDDEN_SQL.test(trimmed)) throw new AppError(400, AGENT_TOOL_ERRORS.forbiddenSql);
    return trimmed;
}

/**
 * Builds the execute() function for a Postgres connection. A `query` runs one validated read-only statement in a
 * READ ONLY transaction, so even a statement that slips past the checks cannot change data, and returns at most
 * the row cap. `write`/`update`/`delete` carry caller SQL plus bound parameters and are classified mutating by
 * the dispatcher, so they only run after confirmation.
 */
export function postgresOperations(sql: Sql): (request: ConnectorOperationRequest) => Promise<ConnectorOperationResult> {
    return async request => {
        const statement = requiredString(request.parameters as Record<string, unknown>, "sql");
        const params = Array.isArray(request.parameters.params) ? request.parameters.params : [];
        if (request.operation === CONNECTOR_OPERATIONS.query) {
            const query = readOnlyStatement(statement);
            const limit = AGENT_TOOL_LIMITS.maxRows;
            // The statement sits on its own lines so a trailing comment cannot swallow the wrapper.
            const capped = `SELECT * FROM (\n${query}\n) AS kin_read LIMIT ${limit + 1}`;
            const rows = await sql.begin("read only", transaction => transaction.unsafe(capped, params as never[])) as unknown as Record<string, unknown>[];
            const truncated = rows.length > limit;
            const kept = truncated ? rows.slice(0, limit) : [...rows];
            return { data: kept, metadata: { rowCount: kept.length, truncated } };
        }
        if (request.operation === CONNECTOR_OPERATIONS.write || request.operation === CONNECTOR_OPERATIONS.update || request.operation === CONNECTOR_OPERATIONS.delete) {
            const rows = await sql.unsafe(statement, params as never[]);
            return { data: rows, metadata: { rowCount: rows.length, mutating: true } };
        }
        throw new AppError(422, "The Postgres connector does not support the requested operation.");
    };
}

/**
 * Builds the execute() function for an HTTP connection. read/fetch perform a GET; write/update/delete perform
 * the matching HTTP method. Headers come from the verified connection configuration, never from the request.
 */
export function httpOperations(endpoint: URL, headers: Headers, timeoutMs: number): (request: ConnectorOperationRequest) => Promise<ConnectorOperationResult> {
    const methodFor: Record<string, string> = {
        [CONNECTOR_OPERATIONS.read]: "GET",
        [CONNECTOR_OPERATIONS.fetch]: "GET",
        [CONNECTOR_OPERATIONS.write]: "POST",
        [CONNECTOR_OPERATIONS.update]: "PUT",
        [CONNECTOR_OPERATIONS.delete]: "DELETE",
    };
    return async request => {
        const method = methodFor[request.operation];
        if (!method) throw new AppError(422, "The HTTP connector does not support the requested operation.");
        const target = resolveRelativePath(endpoint, request.parameters.path);
        const requestHeaders = new Headers(headers);
        const body = method === "GET" ? undefined : JSON.stringify(request.parameters.body ?? {});
        if (body !== undefined) requestHeaders.set("Content-Type", "application/json");
        const response = await fetch(target, { method, headers: requestHeaders, body, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
        const text = await response.text();
        if (!response.ok) throw new AppError(502, `The connector endpoint returned HTTP ${response.status}.`);
        let data: unknown = text;
        try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON bodies are returned as text */ }
        return { data, metadata: { status: response.status, method } };
    };
}

/** A relative path parameter is resolved against the verified endpoint origin and may not escape it. */
function resolveRelativePath(endpoint: URL, path: unknown): URL {
    if (path === undefined || path === null || path === "") return endpoint;
    if (typeof path !== "string") throw new AppError(400, "The request path must be a string.");
    const resolved = new URL(path, endpoint);
    if (resolved.origin !== endpoint.origin) throw new AppError(400, "The request path must stay on the connection's origin.");
    return resolved;
}

/**
 * Builds the execute() function for a filesystem connection. read returns file contents, list returns a
 * directory listing; write and delete mutate within the operator-allowed roots and are gated by confirmation.
 */
export function filesystemOperations(roots: string[], kind: "file" | "directory"): (request: ConnectorOperationRequest) => Promise<ConnectorOperationResult> {
    return async request => {
        if (request.operation === CONNECTOR_OPERATIONS.read) {
            const target = await allowedFilesystemPath(requiredString(request.parameters as Record<string, unknown>, "path"), roots, "file");
            return { data: await readFile(target, "utf8"), metadata: { path: target } };
        }
        if (request.operation === CONNECTOR_OPERATIONS.list) {
            const target = await allowedFilesystemPath(requiredString(request.parameters as Record<string, unknown>, "path"), roots, "directory");
            const entries = await readdir(target, { withFileTypes: true });
            return { data: entries.map(entry => ({ name: entry.name, type: entry.isDirectory() ? "directory" : "file" })), metadata: { path: target } };
        }
        if (request.operation === CONNECTOR_OPERATIONS.write) {
            // The parent directory must already be an allowed directory; the file need not pre-exist.
            const directory = await allowedFilesystemPath(requiredString(request.parameters as Record<string, unknown>, "directory"), roots, "directory");
            const name = requiredString(request.parameters as Record<string, unknown>, "name");
            if (name.includes("/") || name.includes("\\") || name.includes("..")) throw new AppError(400, "The file name must be a plain name without path separators.");
            const target = join(directory, name);
            await writeFile(target, requiredString(request.parameters as Record<string, unknown>, "content"), "utf8");
            return { data: { written: target }, metadata: { mutating: true } };
        }
        if (request.operation === CONNECTOR_OPERATIONS.delete) {
            const target = await allowedFilesystemPath(requiredString(request.parameters as Record<string, unknown>, "path"), roots, "file");
            await rm(target, { force: false });
            return { data: { deleted: target }, metadata: { mutating: true } };
        }
        throw new AppError(422, "The filesystem connector does not support the requested operation.");
    };
}

/** Resolves a connection's filesystem kind from its stat, used when building operation handles. */
export async function pathKind(path: string): Promise<"file" | "directory"> {
    return (await stat(path)).isDirectory() ? "directory" : "file";
}
