import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import {
    brainAccessPolicies, brainEntities, brainEntityLinks, brainEntityTypes, brainMetricDefinitions, brainMetricObservations,
    brainRelationshipTypes, brainSemanticMappings, brainSilverRecords,
} from "../../../infrastructure/database/schema/brain.js";
import type {
    BrainAccessPolicy, BrainEntity, BrainEntityType, BrainFilter, BrainMetricDefinition, BrainMetricObservation, BrainRelationshipType,
    BrainSemanticMapping, NewBrainAccessPolicy, NewBrainEntityType, NewBrainMetricDefinition, NewBrainRelationshipType, NewBrainSemanticMapping,
} from "../../../shared/types/entities.js";
import type { AggregateQuery, AggregateRow, EntityUpsert, IBrainSemanticRepository, ObservationInsert } from "./brain-semantic.repository.js";

const CHUNK = 200;
const MAX_SOURCE_REFS = 50;
const chunks = <T>(rows: ReadonlyArray<T>): T[][] => {
    const result: T[][] = [];
    for (let index = 0; index < rows.length; index += CHUNK) result.push(rows.slice(index, index + CHUNK));
    return result;
};

// Field names and values are always bound parameters; the JSON operators take them as text.
const textOf = (field: string): SQL => sql`(${brainSilverRecords.data}->>${field})`;
const numberOf = (field: string): SQL => sql`(CASE WHEN jsonb_typeof(${brainSilverRecords.data}->${field}) = 'number' THEN (${brainSilverRecords.data}->>${field})::double precision END)`;
const timeOf = (field: string): SQL => sql`(CASE WHEN ${brainSilverRecords.data}->>${field} ~ '^\\d{4}-\\d{2}-\\d{2}' THEN (${brainSilverRecords.data}->>${field})::timestamptz END)`;

/** Turns a validated filter into a parameterised predicate. Numbers compare numerically, everything else as text. */
export function filterPredicate(filter: BrainFilter): SQL {
    const { field, op, value } = filter;
    const numeric = typeof value === "number";
    const left = numeric ? numberOf(field) : textOf(field);
    const right = numeric ? sql`${value}::double precision` : sql`${typeof value === "boolean" ? String(value) : String(value ?? "")}`;
    switch (op) {
        case "eq": return sql`${left} = ${right}`;
        case "neq": return sql`${left} IS DISTINCT FROM ${right}`;
        case "in": return sql`${textOf(field)} = ANY(${sql.param((Array.isArray(value) ? value : [value]).map(item => String(item)))}::text[])`;
        case "gt": return sql`${left} > ${right}`;
        case "gte": return sql`${left} >= ${right}`;
        case "lt": return sql`${left} < ${right}`;
        case "lte": return sql`${left} <= ${right}`;
        default: throw new Error("Unsupported filter operator");
    }
}

function aggregateExpression(aggregation: string, field: string | null): SQL {
    if (aggregation === "count") return sql`count(*)::double precision`;
    if (!field) throw new Error("A value field is required for this aggregation");
    switch (aggregation) {
        case "sum": return sql`coalesce(sum(${numberOf(field)}), 0)`;
        case "avg": return sql`avg(${numberOf(field)})`;
        case "min": return sql`min(${numberOf(field)})`;
        case "max": return sql`max(${numberOf(field)})`;
        case "count_distinct": return sql`count(DISTINCT ${textOf(field)})::double precision`;
        default: throw new Error("Unsupported aggregation");
    }
}

export class BrainSemanticRepository implements IBrainSemanticRepository {
    constructor(private readonly database: DatabaseSession) {}

    listEntityTypes(workspaceId: string): Promise<BrainEntityType[]> {
        return this.database.select().from(brainEntityTypes).where(eq(brainEntityTypes.workspaceId, workspaceId)).orderBy(asc(brainEntityTypes.name));
    }
    async findEntityType(id: string, workspaceId: string): Promise<BrainEntityType | null> {
        const [row] = await this.database.select().from(brainEntityTypes).where(and(eq(brainEntityTypes.id, id), eq(brainEntityTypes.workspaceId, workspaceId))).limit(1);
        return row ?? null;
    }
    async findEntityTypeByKey(workspaceId: string, key: string): Promise<BrainEntityType | null> {
        const [row] = await this.database.select().from(brainEntityTypes).where(and(eq(brainEntityTypes.workspaceId, workspaceId), eq(brainEntityTypes.key, key))).limit(1);
        return row ?? null;
    }
    async countEntityTypes(workspaceId: string): Promise<number> {
        const [row] = await this.database.select({ value: count() }).from(brainEntityTypes).where(eq(brainEntityTypes.workspaceId, workspaceId));
        return row?.value ?? 0;
    }
    async createEntityType(data: NewBrainEntityType): Promise<BrainEntityType> {
        const [row] = await this.database.insert(brainEntityTypes).values(data).returning();
        return row;
    }
    async updateEntityType(id: string, workspaceId: string, data: Partial<NewBrainEntityType>): Promise<BrainEntityType | null> {
        const [row] = await this.database.update(brainEntityTypes).set({ ...data, updatedAt: new Date() })
            .where(and(eq(brainEntityTypes.id, id), eq(brainEntityTypes.workspaceId, workspaceId))).returning();
        return row ?? null;
    }

    listRelationshipTypes(workspaceId: string): Promise<BrainRelationshipType[]> {
        return this.database.select().from(brainRelationshipTypes).where(eq(brainRelationshipTypes.workspaceId, workspaceId)).orderBy(asc(brainRelationshipTypes.name));
    }
    async createRelationshipType(data: NewBrainRelationshipType): Promise<BrainRelationshipType> {
        const [row] = await this.database.insert(brainRelationshipTypes).values(data).returning();
        return row;
    }
    async updateRelationshipType(id: string, workspaceId: string, data: Partial<NewBrainRelationshipType>): Promise<BrainRelationshipType | null> {
        const [row] = await this.database.update(brainRelationshipTypes).set({ ...data, updatedAt: new Date() })
            .where(and(eq(brainRelationshipTypes.id, id), eq(brainRelationshipTypes.workspaceId, workspaceId))).returning();
        return row ?? null;
    }
    listMappings(workspaceId: string, options: { datasetId?: string; status?: string; limit: number }): Promise<BrainSemanticMapping[]> {
        return this.database.select().from(brainSemanticMappings).where(and(
            eq(brainSemanticMappings.workspaceId, workspaceId),
            options.datasetId ? eq(brainSemanticMappings.datasetId, options.datasetId) : undefined,
            options.status ? eq(brainSemanticMappings.status, options.status) : undefined,
        )).orderBy(asc(brainSemanticMappings.confidence), asc(brainSemanticMappings.sourceField)).limit(options.limit);
    }
    async upsertMapping(data: NewBrainSemanticMapping): Promise<BrainSemanticMapping> {
        const [row] = await this.database.insert(brainSemanticMappings).values(data).onConflictDoUpdate({
            target: [brainSemanticMappings.datasetId, brainSemanticMappings.sourceField, brainSemanticMappings.entityTypeId, brainSemanticMappings.attributeKey],
            set: { confidence: sql`excluded.confidence`, evidence: sql`excluded.evidence`, method: sql`excluded.method`, transform: sql`excluded.transform`, proposedBy: sql`excluded.proposed_by`, updatedAt: sql`now()` },
            setWhere: sql`${brainSemanticMappings.status} = 'proposed'`,
        }).returning();
        if (row) return row;
        // The target was already reviewed; the stored decision stands.
        const [existing] = await this.database.select().from(brainSemanticMappings).where(and(
            eq(brainSemanticMappings.datasetId, data.datasetId), eq(brainSemanticMappings.sourceField, data.sourceField),
            eq(brainSemanticMappings.entityTypeId, data.entityTypeId), eq(brainSemanticMappings.attributeKey, data.attributeKey),
        )).limit(1);
        return existing;
    }
    async updateMapping(id: string, workspaceId: string, data: Partial<NewBrainSemanticMapping>, expectedStatus?: string): Promise<BrainSemanticMapping | null> {
        const [row] = await this.database.update(brainSemanticMappings).set({ ...data, updatedAt: new Date() }).where(and(
            eq(brainSemanticMappings.id, id), eq(brainSemanticMappings.workspaceId, workspaceId),
            expectedStatus ? eq(brainSemanticMappings.status, expectedStatus) : undefined,
        )).returning();
        return row ?? null;
    }
    async upsertEntities(workspaceId: string, entityTypeId: string, rows: ReadonlyArray<EntityUpsert>): Promise<Map<string, string>> {
        const ids = new Map<string, string>();
        // Duplicate keys in one statement would make ON CONFLICT touch a row twice; merge them first.
        const unique = new Map<string, EntityUpsert & { refs: Array<{ datasetId: string; sourceKey: string }> }>();
        for (const row of rows) {
            const existing = unique.get(row.canonicalKey);
            if (existing) {
                if (existing.refs.length < MAX_SOURCE_REFS) existing.refs.push(row.sourceRef);
                Object.assign(existing.attributes, row.attributes);
            } else unique.set(row.canonicalKey, { ...row, attributes: { ...row.attributes }, refs: [row.sourceRef] });
        }
        for (const part of chunks([...unique.values()])) {
            const result = await this.database.insert(brainEntities).values(part.map(row => ({
                workspaceId, entityTypeId, canonicalKey: row.canonicalKey, displayName: row.displayName, attributes: row.attributes, sourceRefs: row.refs,
            }))).onConflictDoUpdate({
                target: [brainEntities.workspaceId, brainEntities.entityTypeId, brainEntities.canonicalKey],
                set: {
                    // A source that only references the entity (no name, so the key stands in) keeps the known name.
                    displayName: sql`CASE WHEN excluded.display_name = excluded.canonical_key THEN ${brainEntities.displayName} ELSE excluded.display_name END`,
                    // A missing value in one source never erases what another source supplied.
                    attributes: sql`${brainEntities.attributes} || jsonb_strip_nulls(excluded.attributes)`,
                    sourceRefs: sql`(SELECT coalesce(jsonb_agg(ref), '[]'::jsonb) FROM (SELECT DISTINCT ref FROM jsonb_array_elements(${brainEntities.sourceRefs} || excluded.source_refs) AS ref LIMIT ${MAX_SOURCE_REFS}) AS refs)`,
                    updatedAt: sql`now()`,
                },
            }).returning({ id: brainEntities.id, key: brainEntities.canonicalKey });
            for (const row of result) ids.set(row.key, row.id);
        }
        return ids;
    }
    async findEntityIdsByKeys(workspaceId: string, entityTypeId: string, keys: ReadonlyArray<string>): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        for (const part of chunks(keys)) {
            const rows = await this.database.select({ id: brainEntities.id, key: brainEntities.canonicalKey, mergedInto: brainEntities.mergedInto }).from(brainEntities)
                .where(and(eq(brainEntities.workspaceId, workspaceId), eq(brainEntities.entityTypeId, entityTypeId), inArray(brainEntities.canonicalKey, part)));
            for (const row of rows) result.set(row.key, row.mergedInto ?? row.id);
        }
        return result;
    }
    async linkByAttribute(workspaceId: string, relationship: { id: string; fromTypeId: string; toTypeId: string; fromAttribute: string }): Promise<number> {
        const rows = await this.database.execute(sql`INSERT INTO brain_entity_links (workspace_id, relationship_type_id, from_entity_id, to_entity_id)
            SELECT ${workspaceId}, ${relationship.id}, a.id, b.id
            FROM brain_entities a
            JOIN brain_entities b ON b.workspace_id = a.workspace_id AND b.entity_type_id = ${relationship.toTypeId} AND b.status = 'active'
                AND b.canonical_key = a.attributes->>${relationship.fromAttribute}
            WHERE a.workspace_id = ${workspaceId} AND a.entity_type_id = ${relationship.fromTypeId} AND a.status = 'active' AND a.id <> b.id
            ON CONFLICT DO NOTHING RETURNING id`);
        return [...rows].length;
    }
    async linkCounts(workspaceId: string): Promise<Array<{ relationshipTypeId: string; count: number }>> {
        return this.database.select({ relationshipTypeId: brainEntityLinks.relationshipTypeId, count: sql<number>`count(*)::int` }).from(brainEntityLinks)
            .where(eq(brainEntityLinks.workspaceId, workspaceId)).groupBy(brainEntityLinks.relationshipTypeId);
    }
    searchEntities(workspaceId: string, options: { entityTypeId?: string; query?: string; limit: number }): Promise<BrainEntity[]> {
        const pattern = options.query ? `%${options.query.replace(/[\\%_]/g, character => `\\${character}`)}%` : null;
        return this.database.select().from(brainEntities).where(and(
            eq(brainEntities.workspaceId, workspaceId), eq(brainEntities.status, "active"),
            options.entityTypeId ? eq(brainEntities.entityTypeId, options.entityTypeId) : undefined,
            pattern ? or(ilike(brainEntities.displayName, pattern), ilike(brainEntities.canonicalKey, pattern)) : undefined,
        )).orderBy(asc(brainEntities.displayName)).limit(options.limit);
    }
    async findEntity(id: string, workspaceId: string): Promise<BrainEntity | null> {
        const [row] = await this.database.select().from(brainEntities).where(and(eq(brainEntities.id, id), eq(brainEntities.workspaceId, workspaceId))).limit(1);
        return row ?? null;
    }
    async updateEntity(id: string, workspaceId: string, data: Partial<Pick<BrainEntity, "status" | "mergedInto" | "sourceRefs" | "attributes" | "confidence">>): Promise<BrainEntity | null> {
        const [row] = await this.database.update(brainEntities).set({ ...data, updatedAt: new Date() })
            .where(and(eq(brainEntities.id, id), eq(brainEntities.workspaceId, workspaceId))).returning();
        return row ?? null;
    }
    async entityCounts(workspaceId: string): Promise<Array<{ entityTypeId: string; count: number }>> {
        return this.database.select({ entityTypeId: brainEntities.entityTypeId, count: sql<number>`count(*)::int` }).from(brainEntities)
            .where(and(eq(brainEntities.workspaceId, workspaceId), eq(brainEntities.status, "active"))).groupBy(brainEntities.entityTypeId);
    }
    async countLinks(workspaceId: string): Promise<number> {
        const [row] = await this.database.select({ value: count() }).from(brainEntityLinks).where(eq(brainEntityLinks.workspaceId, workspaceId));
        return row?.value ?? 0;
    }
    async removeDatasetReferences(workspaceId: string, datasetId: string): Promise<number> {
        await this.database.execute(sql`UPDATE brain_entities SET source_refs = (SELECT coalesce(jsonb_agg(ref), '[]'::jsonb) FROM jsonb_array_elements(source_refs) AS ref WHERE ref->>'datasetId' <> ${datasetId}), updated_at = now()
            WHERE workspace_id = ${workspaceId} AND source_refs @> jsonb_build_array(jsonb_build_object('datasetId', ${datasetId}::text))`);
        const removed = await this.database.delete(brainEntities).where(and(eq(brainEntities.workspaceId, workspaceId), sql`${brainEntities.sourceRefs} = '[]'::jsonb`)).returning({ id: brainEntities.id });
        return removed.length;
    }

    listMetrics(workspaceId: string): Promise<BrainMetricDefinition[]> {
        return this.database.select().from(brainMetricDefinitions).where(eq(brainMetricDefinitions.workspaceId, workspaceId)).orderBy(asc(brainMetricDefinitions.name));
    }
    listMetricsByDataset(datasetId: string): Promise<BrainMetricDefinition[]> {
        return this.database.select().from(brainMetricDefinitions).where(eq(brainMetricDefinitions.datasetId, datasetId));
    }
    async findMetric(id: string, workspaceId: string): Promise<BrainMetricDefinition | null> {
        const [row] = await this.database.select().from(brainMetricDefinitions).where(and(eq(brainMetricDefinitions.id, id), eq(brainMetricDefinitions.workspaceId, workspaceId))).limit(1);
        return row ?? null;
    }
    async findMetricByKey(workspaceId: string, key: string): Promise<BrainMetricDefinition | null> {
        const [row] = await this.database.select().from(brainMetricDefinitions).where(and(eq(brainMetricDefinitions.workspaceId, workspaceId), eq(brainMetricDefinitions.key, key))).limit(1);
        return row ?? null;
    }
    async createMetric(data: NewBrainMetricDefinition): Promise<BrainMetricDefinition> {
        const [row] = await this.database.insert(brainMetricDefinitions).values(data).returning();
        return row;
    }
    async updateMetric(id: string, workspaceId: string, data: Partial<NewBrainMetricDefinition>): Promise<BrainMetricDefinition | null> {
        const [row] = await this.database.update(brainMetricDefinitions).set({ ...data, updatedAt: new Date() })
            .where(and(eq(brainMetricDefinitions.id, id), eq(brainMetricDefinitions.workspaceId, workspaceId))).returning();
        return row ?? null;
    }
    async aggregate(query: AggregateQuery, rowFilters: ReadonlyArray<BrainFilter> = []): Promise<AggregateRow[]> {
        const time = timeOf(query.timeField);
        const conditions: SQL[] = [sql`${brainSilverRecords.datasetId} = ${query.datasetId}`, sql`${time} IS NOT NULL`];
        for (const filter of [...query.filters, ...rowFilters]) conditions.push(filterPredicate(filter));
        if (query.from) conditions.push(sql`${time} >= ${query.from}::timestamptz`);
        if (query.to) conditions.push(sql`${time} < ${query.to}::timestamptz`);
        const dimension = query.dimension ? sql`left(coalesce(${textOf(query.dimension)}, '(none)'), 255)` : sql`''`;
        const rows = await this.database.execute(sql`SELECT to_char(date_trunc(${query.grain}, ${time} AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "periodStart",
                ${dimension} AS "dimensionValue", ${aggregateExpression(query.aggregation, query.valueField)} AS value, count(*)::int AS "sampleCount"
            FROM ${brainSilverRecords} WHERE ${sql.join(conditions, sql` AND `)}
            GROUP BY 1, 2 ORDER BY 1, 2`);
        return (rows as unknown as Array<{ periodStart: string; dimensionValue: string; value: number | string | null; sampleCount: number }>)
            .filter(row => row.value !== null)
            .map(row => ({ periodStart: row.periodStart, dimensionValue: row.dimensionValue, value: Number(row.value), sampleCount: Number(row.sampleCount) }));
    }
    async replaceObservations(workspaceId: string, metricId: string, metricVersion: number, grain: string, datasetVersion: number, rows: ReadonlyArray<ObservationInsert>): Promise<number> {
        return this.database.transaction(async tx => {
            await tx.delete(brainMetricObservations).where(and(eq(brainMetricObservations.metricId, metricId), eq(brainMetricObservations.grain, grain)));
            let inserted = 0;
            for (const part of chunks(rows)) {
                const result = await tx.insert(brainMetricObservations).values(part.map(row => ({ workspaceId, metricId, metricVersion, grain, datasetVersion, ...row })))
                    .returning({ id: brainMetricObservations.id });
                inserted += result.length;
            }
            await tx.update(brainMetricDefinitions).set({ computedAt: new Date() }).where(eq(brainMetricDefinitions.id, metricId));
            return inserted;
        });
    }
    listObservations(metricId: string, options: { grain: string; dimension: string; from?: string; to?: string; limit: number }): Promise<BrainMetricObservation[]> {
        return this.database.select().from(brainMetricObservations).where(and(
            eq(brainMetricObservations.metricId, metricId), eq(brainMetricObservations.grain, options.grain), eq(brainMetricObservations.dimension, options.dimension),
            options.from ? gte(brainMetricObservations.periodStart, options.from) : undefined,
            options.to ? lte(brainMetricObservations.periodStart, options.to) : undefined,
        )).orderBy(desc(brainMetricObservations.periodStart), asc(brainMetricObservations.dimensionValue)).limit(options.limit);
    }

    listPolicies(workspaceId: string): Promise<BrainAccessPolicy[]> {
        return this.database.select().from(brainAccessPolicies).where(eq(brainAccessPolicies.workspaceId, workspaceId)).orderBy(asc(brainAccessPolicies.createdAt));
    }
    async findPolicy(id: string, workspaceId: string): Promise<BrainAccessPolicy | null> {
        const [row] = await this.database.select().from(brainAccessPolicies).where(and(eq(brainAccessPolicies.id, id), eq(brainAccessPolicies.workspaceId, workspaceId))).limit(1);
        return row ?? null;
    }
    async createPolicy(data: NewBrainAccessPolicy): Promise<BrainAccessPolicy> {
        const [row] = await this.database.insert(brainAccessPolicies).values(data).returning();
        return row;
    }
    async deletePolicy(id: string, workspaceId: string): Promise<boolean> {
        const rows = await this.database.delete(brainAccessPolicies).where(and(eq(brainAccessPolicies.id, id), eq(brainAccessPolicies.workspaceId, workspaceId))).returning({ id: brainAccessPolicies.id });
        return rows.length > 0;
    }
}
