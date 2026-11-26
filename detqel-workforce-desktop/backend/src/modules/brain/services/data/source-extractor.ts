import { isAbsolute, join } from "node:path";
import { AGENT_CONNECTOR_KINDS } from "../../../../constants/agentContextConstants.js";
import { BRAIN_ERRORS, BRAIN_FILE_FORMATS, BRAIN_LIMITS, BRAIN_SOURCE_KINDS, BRAIN_SYNC_MODES, type BrainSourceKind } from "../../../../constants/brainConstants.js";
import { CONNECTOR_ADAPTER_KEYS } from "../../../../constants/connectionConstants.js";
import { CONNECTOR_OPERATIONS } from "../../../../constants/connectorOperationConstants.js";
import { isProtectedFile } from "../../../../shared/agents/context/data-guard.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import type { BrainDataset } from "../../../../shared/types/entities.js";
import { readOnlyStatement } from "../../../connections/operations/data-operations.js";
import { agentKindOf } from "../../../connections/services/connector-agent-policy.js";
import type { ConnectionReader } from "../../../connections/services/connection.service.js";
import type { BrainDataProtector } from "./data-protection.js";

/** The connection service's read-only entry point. Credentials never leave it. */
export interface ConnectionReaderPort {
    readerFor(id: string, workspaceId: string): Promise<ConnectionReader>;
}
export interface ExtractionResult {
    readonly records: Record<string, unknown>[];
    readonly cursor: Record<string, unknown>;
    /** True when the page or file cap stopped extraction early; the next run continues from the cursor. */
    readonly truncated: boolean;
    readonly pages: number;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
/** Key column types a full scan may compare natively (information_schema name to SQL type). Nothing else is interpolated. */
export const KEY_TYPES: ReadonlyMap<string, string> = new Map([
    ["smallint", "smallint"], ["integer", "integer"], ["bigint", "bigint"], ["numeric", "numeric"], ["uuid", "uuid"],
    ["text", "text"], ["character varying", "varchar"], ["character", "char"], ["date", "date"],
    ["timestamp without time zone", "timestamp"], ["timestamp with time zone", "timestamptz"],
]);
export const isSafeIdentifier = (name: string) => IDENTIFIER.test(name);
const quoted = (name: string) => {
    if (!isSafeIdentifier(name)) throw new AppError(400, BRAIN_ERRORS.invalidField);
    return `"${name}"`;
};

/** Maps a connector adapter to the dataset source kind it can supply, or null when it cannot supply data. */
export function sourceKindOf(adapterKey: string): BrainSourceKind | null {
    const kind = agentKindOf(adapterKey);
    if (kind === AGENT_CONNECTOR_KINDS.database) return BRAIN_SOURCE_KINDS.database;
    if (kind === AGENT_CONNECTOR_KINDS.api) return BRAIN_SOURCE_KINDS.api;
    if (kind === AGENT_CONNECTOR_KINDS.files) return BRAIN_SOURCE_KINDS.files;
    return null;
}

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF rows. The first row names the columns. */
export function parseCsv(text: string, maxRows: number): { rows: Record<string, unknown>[]; truncated: boolean } {
    const records: string[][] = [];
    let field = "";
    let row: string[] = [];
    let quotedField = false;
    for (let index = 0; index < text.length; index++) {
        const character = text[index];
        if (quotedField) {
            if (character === "\"") {
                if (text[index + 1] === "\"") { field += "\""; index++; }
                else quotedField = false;
            } else field += character;
            continue;
        }
        if (character === "\"" && field === "") quotedField = true;
        else if (character === ",") { row.push(field); field = ""; }
        else if (character === "\n" || character === "\r") {
            if (character === "\r" && text[index + 1] === "\n") index++;
            row.push(field); field = "";
            if (row.some(value => value !== "")) records.push(row);
            row = [];
            if (records.length > maxRows + 1) break;
        } else field += character;
    }
    if (field !== "" || row.length) { row.push(field); if (row.some(value => value !== "")) records.push(row); }
    const [header, ...body] = records;
    if (!header) return { rows: [], truncated: false };
    const names = header.map((name, index) => name.trim() || `column_${index + 1}`).slice(0, BRAIN_LIMITS.maxFields);
    const truncated = body.length > maxRows;
    return { rows: body.slice(0, maxRows).map(values => Object.fromEntries(names.map((name, index) => [name, values[index] ?? null]))), truncated };
}

function recordsAt(value: unknown, path: string | undefined): unknown {
    if (!path) return value;
    let current: unknown = value;
    for (const segment of path.split(".").filter(Boolean)) {
        if (current === null || typeof current !== "object" || ["__proto__", "prototype", "constructor"].includes(segment)) return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}

function asRecords(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) throw new AppError(422, "The source did not return a list of records. Set the records path to the array that holds them.");
    return value.map(item => (item !== null && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : { value: item }));
}

const cursorValue = (value: unknown): string | number | null =>
    value instanceof Date ? value.toISOString() : typeof value === "number" || typeof value === "string" ? value : value === null || value === undefined ? null : String(value);

const after = (value: unknown, cursor: unknown): boolean => {
    if (cursor === null || cursor === undefined) return true;
    const left = cursorValue(value);
    if (left === null) return false;
    if (typeof left === "number" && typeof cursor === "number") return left > cursor;
    return String(left) > String(cursor);
};

/**
 * Pulls records for a dataset through its connector's read operations: paged read-only SQL for databases, a GET
 * for HTTP APIs, and a file read for file connectors. Incremental syncs filter on the watermark field and resume
 * from the stored cursor. Every page is capped, so one run cannot exhaust memory.
 */
export class SourceExtractor {
    /** The protector seals scan cursors, since a key value (an e-mail used as an id, say) can be personal data. */
    constructor(private readonly connections: ConnectionReaderPort, private readonly protector: BrainDataProtector) {}

    /** Opens the connection (verifying it is live) and decides which kind of dataset source it can supply. */
    async sourceKindFor(connectionId: string, workspaceId: string): Promise<BrainSourceKind> {
        const reader = await this.connections.readerFor(connectionId, workspaceId);
        const kind = sourceKindOf(reader.adapterKey);
        if (!kind || typeof reader.handle.execute !== "function") throw new AppError(422, BRAIN_ERRORS.unsupportedConnector);
        return kind;
    }

    async reader(dataset: BrainDataset): Promise<ConnectionReader> {
        if (!dataset.connectionId) throw new AppError(409, BRAIN_ERRORS.datasetRevoked);
        const reader = await this.connections.readerFor(dataset.connectionId, dataset.workspaceId);
        if (sourceKindOf(reader.adapterKey) !== dataset.sourceKind) throw new AppError(409, BRAIN_ERRORS.sourceKindMismatch);
        if (typeof reader.handle.execute !== "function") throw new AppError(422, BRAIN_ERRORS.unsupportedConnector);
        return reader;
    }

    async extract(dataset: BrainDataset, signal?: AbortSignal): Promise<ExtractionResult> {
        const reader = await this.reader(dataset);
        switch (dataset.sourceKind) {
            case BRAIN_SOURCE_KINDS.database: return this.fromDatabase(reader, dataset, signal);
            case BRAIN_SOURCE_KINDS.api: return this.fromApi(reader, dataset);
            case BRAIN_SOURCE_KINDS.files: return this.fromFile(reader, dataset);
            default: throw new AppError(422, BRAIN_ERRORS.unsupportedConnector);
        }
    }

    /**
     * Pages through a read-only query. Incremental syncs read past the watermark. Full syncs scan in key order
     * (or by offset when there is no key) and, when a table is larger than one run may read, store how far they
     * got so the next run continues there instead of starting over. The scan restarts once it reaches the end.
     */
    private async fromDatabase(reader: ConnectionReader, dataset: BrainDataset, signal?: AbortSignal): Promise<ExtractionResult> {
        const base = readOnlyStatement(String((dataset.sourceConfig as Record<string, unknown>).sql ?? ""));
        const stored = dataset.cursor as Record<string, unknown>;
        const incremental = dataset.syncMode === BRAIN_SYNC_MODES.incremental && dataset.watermarkField;
        const keyField = dataset.primaryKeyField;
        let watermark = stored.watermark ?? null;
        const cursorContext = `cursor:${dataset.id}`;
        let scanAfter: string | null = keyField && stored.scanAfter !== undefined && stored.scanAfter !== null ? String(this.protector.open<unknown>(stored.scanAfter, cursorContext)) : null;
        let scanOffset = !keyField && typeof stored.scanOffset === "number" ? stored.scanOffset : 0;
        const records: Record<string, unknown>[] = [];
        let pages = 0;
        let finished = false;
        for (; pages < BRAIN_LIMITS.maxPagesPerRun; pages++) {
            signal?.throwIfAborted();
            let sql: string;
            let params: unknown[] = [];
            if (incremental) {
                const column = quoted(dataset.watermarkField!);
                sql = `SELECT * FROM (\n${base}\n) AS brain_source${watermark === null ? "" : ` WHERE ${column} > $1`} ORDER BY ${column} ASC LIMIT ${BRAIN_LIMITS.pageRows}`;
                params = watermark === null ? [] : [watermark];
            } else if (keyField) {
                // A key of a known type pages on its own index. Otherwise it is compared as text on both sides,
                // which pages correctly for any type at the cost of sorting.
                const keyType = KEY_TYPES.get(String((dataset.sourceConfig as Record<string, unknown>).keyType ?? ""));
                const column = keyType ? quoted(keyField) : `${quoted(keyField)}::text`;
                const parameter = keyType ? `CAST($1 AS ${keyType})` : "$1";
                sql = `SELECT * FROM (\n${base}\n) AS brain_source${scanAfter === null ? "" : ` WHERE ${column} > ${parameter}`} ORDER BY ${column} ASC LIMIT ${BRAIN_LIMITS.pageRows}`;
                params = scanAfter === null ? [] : [String(scanAfter)];
            } else {
                sql = `SELECT * FROM (\n${base}\n) AS brain_source ORDER BY 1 ASC LIMIT ${BRAIN_LIMITS.pageRows} OFFSET ${scanOffset}`;
            }
            const result = await reader.handle.execute!({ operation: CONNECTOR_OPERATIONS.query, parameters: { sql, params } });
            const rows = asRecords(result.data);
            records.push(...rows);
            const last = rows[rows.length - 1];
            if (last && incremental) watermark = cursorValue(last[dataset.watermarkField!]) ?? watermark;
            else if (last && keyField) scanAfter = cursorValue(last[keyField]) === null ? scanAfter : String(cursorValue(last[keyField]));
            else scanOffset += rows.length;
            if (rows.length < BRAIN_LIMITS.pageRows) { pages++; finished = true; break; }
        }
        if (incremental) return { records, cursor: { watermark }, truncated: !finished, pages };
        // A finished full scan starts from the beginning next time; an unfinished one resumes where it stopped.
        const cursor = finished ? {} : keyField ? { scanAfter: scanAfter === null ? null : this.protector.seal(scanAfter, cursorContext) } : { scanOffset };
        return { records, cursor, truncated: !finished, pages };
    }

    private async fromApi(reader: ConnectionReader, dataset: BrainDataset): Promise<ExtractionResult> {
        const config = dataset.sourceConfig as Record<string, unknown>;
        const result = await reader.handle.execute!({ operation: CONNECTOR_OPERATIONS.fetch, parameters: { path: typeof config.path === "string" ? config.path : "" } });
        return this.incrementalSlice(asRecords(recordsAt(result.data, typeof config.recordsPath === "string" ? config.recordsPath : undefined)), dataset);
    }

    private async fromFile(reader: ConnectionReader, dataset: BrainDataset): Promise<ExtractionResult> {
        const config = dataset.sourceConfig as Record<string, unknown>;
        const configured = typeof config.path === "string" && config.path.trim() ? config.path.trim() : "";
        let path: string;
        if (reader.adapterKey === CONNECTOR_ADAPTER_KEYS.file) path = String(reader.configuration.fileName ?? configured);
        else {
            const root = String(reader.configuration.path ?? "");
            path = !configured ? root : isAbsolute(configured) ? configured : join(root, configured);
        }
        if (!path || isProtectedFile(path)) throw new AppError(403, "This file cannot be used as a dataset source.");
        const result = await reader.handle.execute!({ operation: CONNECTOR_OPERATIONS.read, parameters: { path } });
        const text = String(result.data ?? "");
        const format = typeof config.format === "string" ? config.format : path.toLowerCase().endsWith(".csv") ? BRAIN_FILE_FORMATS.csv : path.toLowerCase().endsWith(".jsonl") ? BRAIN_FILE_FORMATS.jsonl : BRAIN_FILE_FORMATS.json;
        let records: Record<string, unknown>[];
        let truncated = false;
        if (format === BRAIN_FILE_FORMATS.csv) {
            const parsed = parseCsv(text, BRAIN_LIMITS.maxRecordsPerFile);
            records = parsed.rows; truncated = parsed.truncated;
        } else if (format === BRAIN_FILE_FORMATS.jsonl) {
            const lines = text.split(/\r?\n/).filter(line => line.trim());
            truncated = lines.length > BRAIN_LIMITS.maxRecordsPerFile;
            records = asRecords(lines.slice(0, BRAIN_LIMITS.maxRecordsPerFile).map(line => {
                try { return JSON.parse(line) as unknown; } catch { return { _unparsed: line.slice(0, 500) }; }
            }));
        } else {
            let parsed: unknown;
            try { parsed = JSON.parse(text); } catch { throw new AppError(422, "The file is not valid JSON. Choose the CSV or JSON Lines format if that is what it holds."); }
            records = asRecords(recordsAt(parsed, typeof config.recordsPath === "string" ? config.recordsPath : undefined));
        }
        const sliced = this.incrementalSlice(records, dataset);
        return { ...sliced, truncated: truncated || sliced.truncated };
    }

    /** Non-SQL sources return everything; an incremental sync keeps only records past the stored watermark. */
    private incrementalSlice(records: Record<string, unknown>[], dataset: BrainDataset): ExtractionResult {
        const capped = records.slice(0, BRAIN_LIMITS.maxRecordsPerFile);
        const truncated = records.length > capped.length;
        if (dataset.syncMode !== BRAIN_SYNC_MODES.incremental || !dataset.watermarkField) return { records: capped, cursor: {}, truncated, pages: 1 };
        const field = dataset.watermarkField;
        const previous = (dataset.cursor as Record<string, unknown>).watermark ?? null;
        const fresh = capped.filter(record => after(record[field], previous));
        let cursor = previous;
        for (const record of fresh) if (after(record[field], cursor)) cursor = cursorValue(record[field]);
        return { records: fresh, cursor: { watermark: cursor }, truncated, pages: 1 };
    }
}
