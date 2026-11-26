import {
    BRAIN_CLASSIFICATIONS, BRAIN_DATASET_STATUSES, BRAIN_ERRORS, BRAIN_LIMITS, BRAIN_SOURCE_KINDS, BRAIN_SYNC_MODES, type BrainSourceKind,
} from "../../../../constants/brainConstants.js";
import { CONNECTOR_OPERATIONS } from "../../../../constants/connectorOperationConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import { readOnlyStatement } from "../../../connections/operations/data-operations.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import type { BrainActor } from "../brain-types.js";
import { SlidingWindowLimiter } from "../rate-limiter.js";
import { isPersonalField } from "./data-protection.js";
import type { DatasetService, DiscoveredDataset } from "./dataset.service.js";
import { isSafeIdentifier, KEY_TYPES, sourceKindOf, type ConnectionReaderPort } from "./source-extractor.js";

// Discovery reads only catalog views, through the connector's read-only query path. Tables page by (schema, name)
// because the connector returns at most one page of rows per query.
const TABLES_SQL = `SELECT table_schema AS "schema", table_name AS "name", table_type AS "type"
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_schema NOT LIKE 'pg\\_%'
    AND ($1::text IS NULL OR (table_schema, table_name) > ($1::text, $2::text))
ORDER BY 1, 2`;
const COLUMNS_SQL = `SELECT c.column_name AS "name", c.data_type AS "type",
    COALESCE((
        SELECT k.ordinal_position FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema AND k.table_name = tc.table_name
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND k.column_name = c.column_name
    ), 0) AS "keyPosition"
FROM information_schema.columns c
WHERE c.table_schema = $1 AND c.table_name = $2
ORDER BY c.ordinal_position`;

/** Schemas and tables that hold an application's own bookkeeping, never business data. */
const SYSTEM_SCHEMAS = new Set(["drizzle", "pg_toast", "cron", "pgagent", "graphql", "graphql_public", "realtime", "storage", "supabase_functions", "vault", "extensions", "auth"]);
const SYSTEM_TABLES = /^(?:__drizzle_migrations|__reconciled_rows|_prisma_migrations|schema_migrations|ar_internal_metadata|flyway_schema_history|knex_migrations(?:_lock)?|sequelizemeta|alembic_version|typeorm_metadata|migrations|django_migrations|django_session|spatial_ref_sys)$/i;
const TEMPORAL_TYPE = /date|time/i;
/** Preferred time fields, best first; personal dates such as a birth date are never chosen. */
const TIME_FIELD_PREFERENCE = [/^(?:created|order|ordered|invoice|invoiced|transaction|posted|booked|event|sale|issued|paid)_?(?:at|date|on|time)$/i, /(?:^|_)date$/i, /(?:^|_)(?:at|on|time)$/i];
/** A synthetic key for tables whose primary key spans several columns. */
const COMPOSITE_KEY = "__brain_key";

export interface DataSourceView {
    readonly connectionId: string;
    readonly name: string;
    readonly provider: string;
    readonly status: string;
    /** What kind of dataset the connector can supply; null when it cannot supply business data. */
    readonly sourceKind: BrainSourceKind | null;
    readonly linked: boolean;
    readonly linkedAt: Date | null;
    readonly datasets: number;
}
export interface SourceTable { readonly schema: string; readonly name: string; readonly type: "table" | "view" }
export interface DatabaseLoadInput {
    readonly scope: "database" | "tables";
    readonly tables?: ReadonlyArray<{ schema: string; name: string }>;
    /** The business domain for every table, unless its schema has its own entry in schemaDomains. */
    readonly domain: string;
    readonly schemaDomains?: Readonly<Record<string, string>>;
    readonly includeViews?: boolean;
    readonly syncIntervalMinutes?: number | null;
    readonly classification?: string;
}
interface ColumnInfo { readonly name: string; readonly type: string; readonly keyPosition: number }

const quoteIdentifier = (name: string) => `"${name.replaceAll("\"", "\"\"")}"`;
const tableKey = (schema: string, name: string) => `${schema}.${name}`;
const titleOf = (name: string) => name.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim().replace(/\s+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()).slice(0, 200) || "Table";
export const isSystemTable = (table: { schema: string; name: string }) => SYSTEM_SCHEMAS.has(table.schema.toLowerCase()) || SYSTEM_TABLES.test(table.name);

/** The record key a full scan pages on: the primary key, a synthetic key for composite keys, or none. */
export function chooseKey(columns: ReadonlyArray<ColumnInfo>): { field: string | null; keyType: string | null; composite: string[] } {
    const keys = columns.filter(column => column.keyPosition > 0).sort((a, b) => a.keyPosition - b.keyPosition);
    if (keys.length === 1 && isSafeIdentifier(keys[0].name)) return { field: keys[0].name, keyType: KEY_TYPES.has(keys[0].type) ? keys[0].type : null, composite: [] };
    if (keys.length > 1) return { field: COMPOSITE_KEY, keyType: "text", composite: keys.map(key => key.name) };
    return { field: null, keyType: null, composite: [] };
}

/** The column trends and forecasts use: a business event date, preferring creation or transaction dates. */
export function chooseTimeField(columns: ReadonlyArray<ColumnInfo>): string | null {
    const candidates = columns.filter(column => TEMPORAL_TYPE.test(column.type) && isSafeIdentifier(column.name) && !isPersonalField(column.name));
    for (const pattern of TIME_FIELD_PREFERENCE) {
        const match = candidates.find(column => pattern.test(column.name));
        if (match) return match.name;
    }
    return candidates[0]?.name ?? null;
}

/**
 * The Data Layer (business source registry). A workspace may hold connections for unrelated work; only the ones
 * linked here feed datasets, count as connected sources and can be used by Brain actions. Unlinking stops every
 * dataset on the connection while keeping what was already processed.
 */
export class DataSourceService {
    private readonly loads = new SlidingWindowLimiter(BRAIN_LIMITS.databaseLoadsPerMinute, 60_000);

    constructor(
        private readonly unit: IUnitOfWork,
        private readonly audit: BrainAuditService,
        private readonly connections: ConnectionReaderPort,
        private readonly datasets: DatasetService,
        private readonly onChange: (workspaceId: string) => void,
    ) {}

    async list(actor: BrainActor): Promise<DataSourceView[]> {
        const [connections, links, datasets] = await Promise.all([
            this.unit.connections.listByWorkspace(actor.workspaceId),
            this.unit.brainData.listSourceLinks(actor.workspaceId),
            this.unit.brainData.listDatasets(actor.workspaceId),
        ]);
        const kinds = await this.kindsOf(actor.workspaceId, connections.map(connection => connection.definitionId));
        const linked = new Map(links.map(link => [link.connectionId, link]));
        return connections.map(connection => ({
            connectionId: connection.id, name: connection.name, provider: connection.provider, status: connection.status,
            sourceKind: kinds.get(connection.definitionId) ?? null,
            linked: linked.has(connection.id), linkedAt: linked.get(connection.id)?.createdAt ?? null,
            datasets: datasets.filter(dataset => dataset.connectionId === connection.id && dataset.status !== BRAIN_DATASET_STATUSES.revoked).length,
        })).sort((a, b) => Number(b.linked) - Number(a.linked) || a.name.localeCompare(b.name));
    }

    /** Throws unless the connection is linked; every Brain read or action on a connection goes through this. */
    async requireLinked(workspaceId: string, connectionId: string): Promise<void> {
        if (!await this.unit.brainData.findSourceLink(workspaceId, connectionId)) throw new AppError(409, BRAIN_ERRORS.sourceNotLinked);
    }

    async link(actor: BrainActor, connectionId: string): Promise<DataSourceView> {
        const connection = await this.unit.connections.findInWorkspace(connectionId, actor.workspaceId);
        if (!connection) throw new AppError(404, BRAIN_ERRORS.connectionNotFound);
        const kind = (await this.kindsOf(actor.workspaceId, [connection.definitionId])).get(connection.definitionId) ?? null;
        if (!kind) throw new AppError(422, BRAIN_ERRORS.unsupportedConnector);
        const link = await this.unit.brainData.createSourceLink(actor.workspaceId, connectionId, actor.userId);
        await this.audit.record(entryFor(actor, "data_source.linked", "connection", connectionId, { metadata: { name: connection.name, sourceKind: kind } }));
        this.onChange(actor.workspaceId);
        return {
            connectionId, name: connection.name, provider: connection.provider, status: connection.status, sourceKind: kind,
            linked: true, linkedAt: link.createdAt, datasets: 0,
        };
    }

    async unlink(actor: BrainActor, connectionId: string) {
        const result = await this.unit.transaction(async repositories => {
            if (!await repositories.brainData.deleteSourceLink(actor.workspaceId, connectionId)) throw new AppError(404, BRAIN_ERRORS.sourceNotLinked);
            const revoked = await repositories.brainData.revokeDatasetsForConnection(actor.workspaceId, connectionId);
            await this.audit.record(entryFor(actor, "data_source.unlinked", "connection", connectionId, { metadata: { revokedDatasets: revoked } }), repositories);
            return { success: true, revokedDatasets: revoked.length };
        });
        this.onChange(actor.workspaceId);
        return result;
    }

    /** Business tables and views of a linked database source. Catalog, migration and other system tables are left out. */
    async tables(actor: BrainActor, connectionId: string): Promise<SourceTable[]> {
        const reader = await this.databaseReader(actor, connectionId);
        const tables: SourceTable[] = [];
        let after: SourceTable | null = null;
        while (tables.length < BRAIN_LIMITS.maxDiscoveredTables) {
            const rows = await this.run(reader, TABLES_SQL, [after?.schema ?? null, after?.name ?? null]);
            for (const row of rows) tables.push({ schema: String(row.schema), name: String(row.name), type: String(row.type) === "VIEW" ? "view" : "table" });
            if (!rows.length || rows.length < BRAIN_LIMITS.pageRows) break;
            after = tables[tables.length - 1];
        }
        return tables.slice(0, BRAIN_LIMITS.maxDiscoveredTables).filter(table => !isSystemTable(table));
    }

    /** Columns of one table, flagging primary-key columns, usable key or time fields, and personal-data fields. */
    async columns(actor: BrainActor, connectionId: string, schema: string, table: string) {
        const reader = await this.databaseReader(actor, connectionId);
        return (await this.columnsOf(reader, schema, table)).map(column => ({
            name: column.name, type: column.type, primaryKey: column.keyPosition > 0, selectable: isSafeIdentifier(column.name), personal: isPersonalField(column.name),
        }));
    }

    /**
     * Loads a whole database, or chosen tables, as datasets. Every query is built here from discovered catalog
     * names (quoted, validated read-only), never from text the caller sends. Each table gets its key, a time
     * field and its business domain; tables already loaded from this source are skipped, not duplicated.
     * The first datasets start syncing at once; the scheduler works through the rest a few at a time.
     */
    async loadDatabase(actor: BrainActor, connectionId: string, input: DatabaseLoadInput) {
        this.loads.consume(`${actor.workspaceId}:${actor.userId}`);
        const reader = await this.databaseReader(actor, connectionId);
        const discovered = (await this.tables(actor, connectionId)).filter(table => input.includeViews || table.type === "table" || input.scope === "tables");
        const available = new Map(discovered.map(table => [tableKey(table.schema, table.name), table]));
        const skipped: Array<{ table: string; reason: string }> = [];
        let wanted: SourceTable[];
        if (input.scope === "tables") {
            wanted = [];
            for (const requested of input.tables ?? []) {
                const table = available.get(tableKey(requested.schema, requested.name));
                if (table) wanted.push(table);
                else skipped.push({ table: tableKey(requested.schema, requested.name), reason: "Not found in this source, or it is a system table." });
            }
        } else wanted = discovered;
        wanted = [...new Map(wanted.map(table => [tableKey(table.schema, table.name), table])).values()];
        if (!wanted.length && !skipped.length) throw new AppError(422, "This source has no business tables to load.");

        const existing = await this.unit.brainData.listDatasets(actor.workspaceId);
        const loaded = new Set(existing.filter(dataset => dataset.connectionId === connectionId && dataset.status !== BRAIN_DATASET_STATUSES.revoked)
            .map(dataset => (dataset.sourceConfig as { table?: { schema: string; name: string } }).table).filter(Boolean).map(table => tableKey(table!.schema, table!.name)));
        const usedNames = new Set(existing.map(dataset => dataset.name.toLowerCase()));
        const capacity = BRAIN_LIMITS.maxDatasetsPerWorkspace - existing.length;

        const pending = wanted.filter(table => {
            const key = tableKey(table.schema, table.name);
            if (loaded.has(key)) { skipped.push({ table: key, reason: "Already loaded from this source." }); return false; }
            return true;
        });
        const limited = pending.slice(0, Math.max(0, Math.min(capacity, BRAIN_LIMITS.maxTablesPerLoad)));
        for (const table of pending.slice(limited.length)) skipped.push({ table: tableKey(table.schema, table.name), reason: "The workspace dataset limit was reached." });

        const columns = await this.mapLimited(limited, table => this.columnsOf(reader, table.schema, table.name));
        const prepared: DiscoveredDataset[] = [];
        limited.forEach((table, index) => {
            const key = tableKey(table.schema, table.name);
            const tableColumns = columns[index];
            if (tableColumns instanceof Error || !tableColumns.length) {
                skipped.push({ table: key, reason: tableColumns instanceof Error ? "Its columns could not be read." : "It has no readable columns." });
                return;
            }
            const recordKey = chooseKey(tableColumns);
            const target = `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;
            const sql = recordKey.composite.length
                ? `SELECT t.*, concat_ws('|', ${recordKey.composite.map(column => `t.${quoteIdentifier(column)}::text`).join(", ")}) AS ${COMPOSITE_KEY} FROM ${target} AS t`
                : `SELECT * FROM ${target}`;
            try { readOnlyStatement(sql); } catch {
                skipped.push({ table: key, reason: "Its name cannot be read safely on the read-only path." });
                return;
            }
            const domain = (input.schemaDomains?.[table.schema] ?? input.domain).trim();
            let name = titleOf(table.name);
            if (usedNames.has(name.toLowerCase())) name = `${name} (${table.schema})`;
            for (let suffix = 2; usedNames.has(name.toLowerCase()); suffix++) name = `${titleOf(table.name)} (${table.schema} ${suffix})`;
            usedNames.add(name.toLowerCase());
            prepared.push({
                connectionId, name, domain, description: `${table.type === "view" ? "View" : "Table"} ${key}`,
                source: { sql, table: { schema: table.schema, name: table.name }, keyType: recordKey.keyType ?? undefined },
                primaryKeyField: recordKey.field, timeField: chooseTimeField(tableColumns), syncMode: BRAIN_SYNC_MODES.full,
                syncIntervalMinutes: input.syncIntervalMinutes ?? null, classification: input.classification ?? BRAIN_CLASSIFICATIONS.confidential,
                freshnessSlaMinutes: Math.max(BRAIN_LIMITS.defaultFreshnessSlaMinutes, (input.syncIntervalMinutes ?? 0) * 2),
                qualityThreshold: BRAIN_LIMITS.defaultQualityThreshold, driftPolicy: "accept",
                // A composite key carries its columns' raw values, so it is protected whenever one of them is personal.
                protectedFields: recordKey.composite.some(isPersonalField) ? [COMPOSITE_KEY] : [],
            });
        });
        const created = prepared.length ? await this.datasets.registerDiscovered(actor, BRAIN_SOURCE_KINDS.database, prepared) : [];
        await this.audit.record(entryFor(actor, "data_source.loaded", "connection", connectionId, {
            metadata: { scope: input.scope, created: created.length, skipped: skipped.length, domains: [...new Set(prepared.map(item => item.domain))] },
        }));
        this.onChange(actor.workspaceId);
        return { created, skipped };
    }

    private async databaseReader(actor: BrainActor, connectionId: string) {
        await this.requireLinked(actor.workspaceId, connectionId);
        const reader = await this.connections.readerFor(connectionId, actor.workspaceId);
        if (sourceKindOf(reader.adapterKey) !== BRAIN_SOURCE_KINDS.database || typeof reader.handle.execute !== "function") throw new AppError(422, BRAIN_ERRORS.tablesUnsupported);
        return reader;
    }

    private async run(reader: Awaited<ReturnType<DataSourceService["databaseReader"]>>, sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
        const result = await reader.handle.execute!({ operation: CONNECTOR_OPERATIONS.query, parameters: { sql, params } });
        return Array.isArray(result.data) ? result.data as Record<string, unknown>[] : [];
    }

    private async columnsOf(reader: Awaited<ReturnType<DataSourceService["databaseReader"]>>, schema: string, table: string): Promise<ColumnInfo[]> {
        const rows = await this.run(reader, COLUMNS_SQL, [schema, table]);
        return rows.map(row => ({ name: String(row.name), type: String(row.type), keyPosition: Number(row.keyPosition) || 0 }));
    }

    /** Runs lookups a few at a time so a large database cannot flood the source with queries. */
    private async mapLimited<T, R>(items: ReadonlyArray<T>, work: (item: T) => Promise<R>): Promise<Array<R | Error>> {
        const results: Array<R | Error> = new Array(items.length);
        let next = 0;
        const worker = async () => {
            while (next < items.length) {
                const index = next++;
                try { results[index] = await work(items[index]); } catch (error) { results[index] = error instanceof Error ? error : new Error(String(error)); }
            }
        };
        await Promise.all(Array.from({ length: Math.min(BRAIN_LIMITS.discoveryConcurrency, items.length) }, worker));
        return results;
    }

    private async kindsOf(workspaceId: string, definitionIds: ReadonlyArray<string>): Promise<Map<string, BrainSourceKind | null>> {
        const unique = [...new Set(definitionIds)];
        const definitions = await Promise.all(unique.map(id => this.unit.connectionDefinitions.findInWorkspace(id, workspaceId)));
        return new Map(unique.map((id, index) => [id, definitions[index] ? sourceKindOf(definitions[index]!.adapterKey) : null]));
    }
}
