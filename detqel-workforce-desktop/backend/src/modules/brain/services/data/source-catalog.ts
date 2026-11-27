import { BRAIN_LIMITS, BRAIN_SOURCE_KINDS } from "../../../../constants/brainConstants.js";
import { CONNECTOR_OPERATIONS } from "../../../../constants/connectorOperationConstants.js";
import { createScopedLogger } from "../../../../shared/logging/logger.js";
import type { SourceForeignKey } from "../semantic/ontology-derivation.js";
import { sourceKindOf, type ConnectionReaderPort } from "./source-extractor.js";

const logger = createScopedLogger("brain-source-catalog");

/** Single-column foreign keys, read from the catalog through the connector's read-only query path, one page at a time. */
const FOREIGN_KEYS_SQL = `SELECT n.nspname::text AS "schema", c.relname::text AS "table", a.attname::text AS "column",
    rn.nspname::text AS "refSchema", rc.relname::text AS "refTable", ra.attname::text AS "refColumn"
FROM pg_catalog.pg_constraint con
JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_class rc ON rc.oid = con.confrelid
JOIN pg_catalog.pg_namespace rn ON rn.oid = rc.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
JOIN pg_catalog.pg_attribute ra ON ra.attrelid = con.confrelid AND ra.attnum = con.confkey[1]
WHERE con.contype = 'f' AND cardinality(con.conkey) = 1
    AND ($1::text IS NULL OR (n.nspname::text, c.relname::text, a.attname::text) > ($1::text, $2::text, $3::text))
ORDER BY 1, 2, 3`;
const CACHE_MS = 10 * 60_000;
const MAX_FOREIGN_KEYS = 5_000;

/**
 * Structural facts about business sources that the ontology needs, such as declared foreign keys. Results are
 * cached briefly so rebuilding the ontology after every sync does not query the source catalog each time.
 * A source that cannot be read simply contributes no foreign keys; naming conventions still apply.
 */
export class SourceCatalog {
    private readonly cache = new Map<string, { expires: number; keys: SourceForeignKey[] }>();

    constructor(private readonly connections: ConnectionReaderPort) {}

    async foreignKeys(workspaceId: string, connectionId: string): Promise<SourceForeignKey[]> {
        const cached = this.cache.get(connectionId);
        if (cached && cached.expires > Date.now()) return cached.keys;
        let keys: SourceForeignKey[] = [];
        try {
            const reader = await this.connections.readerFor(connectionId, workspaceId);
            if (sourceKindOf(reader.adapterKey) === BRAIN_SOURCE_KINDS.database && typeof reader.handle.execute === "function") {
                let after: SourceForeignKey | null = null;
                while (keys.length < MAX_FOREIGN_KEYS) {
                    const result = await reader.handle.execute({ operation: CONNECTOR_OPERATIONS.query, parameters: { sql: FOREIGN_KEYS_SQL, params: [after?.schema ?? null, after?.table ?? null, after?.column ?? null] } });
                    const rows = (Array.isArray(result.data) ? result.data : []) as Array<Record<string, unknown>>;
                    for (const row of rows) keys.push({ schema: String(row.schema), table: String(row.table), column: String(row.column), refSchema: String(row.refSchema), refTable: String(row.refTable), refColumn: String(row.refColumn) });
                    if (rows.length < BRAIN_LIMITS.pageRows) break;
                    after = keys[keys.length - 1];
                }
            }
        } catch (error) {
            logger.warn({ connectionId, error: String(error) }, "Foreign keys could not be read; relationships are inferred from field names only");
            keys = [];
        }
        this.cache.set(connectionId, { expires: Date.now() + CACHE_MS, keys });
        if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value!);
        return keys;
    }
}
