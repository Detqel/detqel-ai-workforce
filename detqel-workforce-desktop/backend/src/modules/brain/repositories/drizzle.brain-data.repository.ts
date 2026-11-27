import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import {
    brainBronzeRecords, brainDatasets, brainPipelineRuns, brainQualityRules, brainQuarantineRecords, brainSchemaVersions, brainSilverRecords,
    brainSourceLinks,
} from "../../../infrastructure/database/schema/brain.js";
import type {
    BrainDataset, BrainPipelineRun, BrainQualityRule, BrainQuarantineRecord, BrainSchemaVersion, BrainSilverRecord,
    BrainSourceLink, NewBrainDataset, NewBrainPipelineRun, NewBrainQualityRule,
} from "../../../shared/types/entities.js";
import type { BronzeInsert, DatasetCounts, IBrainDataRepository, PeriodPipelineStats, QuarantineInsert, SilverUpsert } from "./brain-data.repository.js";

/** Inserts are chunked so one statement never exceeds PostgreSQL's bind-parameter limit. */
const CHUNK = 200;
const chunks = <T>(rows: ReadonlyArray<T>): T[][] => {
    const result: T[][] = [];
    for (let index = 0; index < rows.length; index += CHUNK) result.push(rows.slice(index, index + CHUNK));
    return result;
};
const leaseUntil = (leaseMs: number) => sql`now() + ${leaseMs}::int * interval '1 millisecond'`;
const leaseFree = or(isNull(brainDatasets.leaseExpiresAt), lt(brainDatasets.leaseExpiresAt, sql`now()`));

export class BrainDataRepository implements IBrainDataRepository {
    constructor(private readonly database: DatabaseSession) {}

    async createDataset(data: NewBrainDataset): Promise<BrainDataset> {
        const [row] = await this.database.insert(brainDatasets).values(data).returning();
        return row;
    }
    async countDatasets(workspaceId: string): Promise<number> {
        const [row] = await this.database.select({ value: count() }).from(brainDatasets).where(eq(brainDatasets.workspaceId, workspaceId));
        return row?.value ?? 0;
    }
    listDatasets(workspaceId: string): Promise<BrainDataset[]> {
        return this.database.select().from(brainDatasets).where(eq(brainDatasets.workspaceId, workspaceId)).orderBy(asc(brainDatasets.domain), asc(brainDatasets.name));
    }
    async findDataset(id: string, workspaceId: string): Promise<BrainDataset | null> {
        const [row] = await this.database.select().from(brainDatasets).where(and(eq(brainDatasets.id, id), eq(brainDatasets.workspaceId, workspaceId))).limit(1);
        return row ?? null;
    }
    async findDatasetByName(workspaceId: string, name: string): Promise<BrainDataset | null> {
        const [row] = await this.database.select().from(brainDatasets)
            .where(and(eq(brainDatasets.workspaceId, workspaceId), sql`lower(${brainDatasets.name}) = lower(${name})`)).limit(1);
        return row ?? null;
    }
    async updateDataset(id: string, workspaceId: string, data: Partial<NewBrainDataset>): Promise<BrainDataset | null> {
        const [row] = await this.database.update(brainDatasets).set({ ...data, updatedAt: new Date() })
            .where(and(eq(brainDatasets.id, id), eq(brainDatasets.workspaceId, workspaceId))).returning();
        return row ?? null;
    }
    async deleteDataset(id: string, workspaceId: string): Promise<boolean> {
        const rows = await this.database.delete(brainDatasets).where(and(eq(brainDatasets.id, id), eq(brainDatasets.workspaceId, workspaceId))).returning({ id: brainDatasets.id });
        return rows.length > 0;
    }
    async claimDataset(id: string, workspaceId: string, owner: string, leaseMs: number): Promise<BrainDataset | null> {
        const [row] = await this.database.update(brainDatasets).set({ leaseOwner: owner, leaseExpiresAt: leaseUntil(leaseMs), lastAttemptAt: new Date() })
            .where(and(eq(brainDatasets.id, id), eq(brainDatasets.workspaceId, workspaceId), leaseFree)).returning();
        return row ?? null;
    }
    async claimDueDatasets(owner: string, leaseMs: number, limit: number): Promise<BrainDataset[]> {
        const due = this.database.select({ id: brainDatasets.id }).from(brainDatasets)
            .where(and(eq(brainDatasets.status, "active"), lte(brainDatasets.nextSyncAt, sql`now()`), leaseFree))
            .orderBy(asc(brainDatasets.nextSyncAt)).limit(limit).for("update", { skipLocked: true });
        return this.database.update(brainDatasets).set({ leaseOwner: owner, leaseExpiresAt: leaseUntil(leaseMs), lastAttemptAt: new Date() })
            .where(inArray(brainDatasets.id, due)).returning();
    }
    async queueSourceSync(workspaceId: string, connectionId: string): Promise<{ queued: number; syncing: number }> {
        const scope = and(eq(brainDatasets.workspaceId, workspaceId), eq(brainDatasets.connectionId, connectionId), inArray(brainDatasets.status, ["active", "error"]));
        const [busy] = await this.database.select({ value: count() }).from(brainDatasets).where(and(scope, gt(brainDatasets.leaseExpiresAt, sql`now()`)));
        // A failed dataset is retried too; one already syncing keeps its run.
        const rows = await this.database.update(brainDatasets).set({
            nextSyncAt: sql`now()`, status: "active", consecutiveFailures: 0, updatedAt: new Date(),
        }).where(and(scope, leaseFree)).returning({ id: brainDatasets.id });
        return { queued: rows.length, syncing: busy?.value ?? 0 };
    }
    async queueStaleDatasets(staleBefore: Date, limit: number): Promise<number> {
        const stale = this.database.select({ id: brainDatasets.id }).from(brainDatasets).where(and(
            eq(brainDatasets.status, "active"), leaseFree,
            or(isNull(brainDatasets.lastAttemptAt), lt(brainDatasets.lastAttemptAt, staleBefore)),
            // Already due, or waiting for a retry it was given, is left alone.
            or(isNull(brainDatasets.nextSyncAt), gt(brainDatasets.nextSyncAt, sql`now()`)),
            sql`EXISTS (SELECT 1 FROM brain_source_links l WHERE l.workspace_id = ${brainDatasets.workspaceId} AND l.connection_id = ${brainDatasets.connectionId})`,
        )).limit(limit).for("update", { skipLocked: true });
        const rows = await this.database.update(brainDatasets).set({ nextSyncAt: sql`now()` }).where(inArray(brainDatasets.id, stale)).returning({ id: brainDatasets.id });
        return rows.length;
    }
    async releaseDataset(id: string, owner: string, data: Partial<NewBrainDataset>): Promise<void> {
        await this.database.update(brainDatasets).set({ ...data, leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
            .where(and(eq(brainDatasets.id, id), eq(brainDatasets.leaseOwner, owner)));
    }
    listExpiredLeases(limit: number): Promise<BrainDataset[]> {
        return this.database.select().from(brainDatasets)
            .where(and(sql`${brainDatasets.leaseOwner} IS NOT NULL`, lt(brainDatasets.leaseExpiresAt, sql`now()`))).limit(limit);
    }

    async createRun(data: NewBrainPipelineRun): Promise<BrainPipelineRun> {
        const [row] = await this.database.insert(brainPipelineRuns).values(data).returning();
        return row;
    }
    async updateRun(id: string, data: Partial<NewBrainPipelineRun>): Promise<BrainPipelineRun | null> {
        const [row] = await this.database.update(brainPipelineRuns).set(data).where(eq(brainPipelineRuns.id, id)).returning();
        return row ?? null;
    }
    async findRun(id: string, workspaceId: string): Promise<BrainPipelineRun | null> {
        const [row] = await this.database.select().from(brainPipelineRuns).where(and(eq(brainPipelineRuns.id, id), eq(brainPipelineRuns.workspaceId, workspaceId))).limit(1);
        return row ?? null;
    }
    listRuns(workspaceId: string, options: { datasetId?: string; limit: number }): Promise<BrainPipelineRun[]> {
        return this.database.select().from(brainPipelineRuns)
            .where(and(eq(brainPipelineRuns.workspaceId, workspaceId), options.datasetId ? eq(brainPipelineRuns.datasetId, options.datasetId) : undefined))
            .orderBy(desc(brainPipelineRuns.startedAt)).limit(options.limit);
    }
    async failRunningRuns(datasetId: string, errorCode: string, errorMessage: string): Promise<number> {
        const rows = await this.database.update(brainPipelineRuns).set({ status: "failed", errorCode, errorMessage, finishedAt: new Date() })
            .where(and(eq(brainPipelineRuns.datasetId, datasetId), eq(brainPipelineRuns.status, "running"))).returning({ id: brainPipelineRuns.id });
        return rows.length;
    }
    async periodStats(workspaceId: string, from: Date, to: Date): Promise<PeriodPipelineStats> {
        const [row] = await this.database.select({
            runs: sql<number>`count(*)::int`,
            failedRuns: sql<number>`count(*) FILTER (WHERE ${brainPipelineRuns.status} = 'failed')::int`,
            extracted: sql<number>`coalesce(sum(${brainPipelineRuns.extractedCount}), 0)::int`,
            bronzeInserted: sql<number>`coalesce(sum(${brainPipelineRuns.bronzeInserted}), 0)::int`,
            silverUpserted: sql<number>`coalesce(sum(${brainPipelineRuns.silverUpserted}), 0)::int`,
            quarantined: sql<number>`coalesce(sum(${brainPipelineRuns.quarantinedCount}), 0)::int`,
        }).from(brainPipelineRuns).where(and(eq(brainPipelineRuns.workspaceId, workspaceId), gte(brainPipelineRuns.startedAt, from), lt(brainPipelineRuns.startedAt, to)));
        return row ?? { runs: 0, failedRuns: 0, extracted: 0, bronzeInserted: 0, silverUpserted: 0, quarantined: 0 };
    }

    async insertBronze(workspaceId: string, datasetId: string, runId: string, schemaVersion: number, rows: ReadonlyArray<BronzeInsert>): Promise<number> {
        let inserted = 0;
        for (const part of chunks(rows)) {
            const result = await this.database.insert(brainBronzeRecords)
                .values(part.map(row => ({ workspaceId, datasetId, runId, schemaVersion, sourceKey: row.sourceKey, payload: row.payload, payloadHash: row.payloadHash })))
                .onConflictDoNothing().returning({ id: brainBronzeRecords.id });
            inserted += result.length;
        }
        return inserted;
    }
    async findSilverValueOwners(datasetId: string, field: string, values: ReadonlyArray<string>): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        for (const part of chunks(values)) {
            const rows = await this.database.select({ value: sql<string>`${brainSilverRecords.data}->>${field}`, key: brainSilverRecords.sourceKey }).from(brainSilverRecords)
                .where(and(eq(brainSilverRecords.datasetId, datasetId), sql`${brainSilverRecords.data}->>${field} = ANY(${sql.param([...part])}::text[])`));
            for (const row of rows) result.set(row.value, row.key);
        }
        return result;
    }
    async findExistingSilverKeys(datasetId: string, sourceKeys: ReadonlyArray<string>): Promise<Set<string>> {
        const found = new Set<string>();
        for (const part of chunks(sourceKeys)) {
            const rows = await this.database.select({ key: brainSilverRecords.sourceKey }).from(brainSilverRecords)
                .where(and(eq(brainSilverRecords.datasetId, datasetId), inArray(brainSilverRecords.sourceKey, part)));
            for (const row of rows) found.add(row.key);
        }
        return found;
    }
    async upsertSilver(workspaceId: string, datasetId: string, runId: string, rows: ReadonlyArray<SilverUpsert>): Promise<number> {
        let written = 0;
        for (const part of chunks(rows)) {
            const result = await this.database.insert(brainSilverRecords)
                .values(part.map(row => ({ workspaceId, datasetId, runId, sourceKey: row.sourceKey, data: row.data, recordHash: row.recordHash, observedAt: row.observedAt })))
                .onConflictDoUpdate({
                    target: [brainSilverRecords.datasetId, brainSilverRecords.sourceKey],
                    set: { data: sql`excluded.data`, recordHash: sql`excluded.record_hash`, observedAt: sql`excluded.observed_at`, runId: sql`excluded.run_id`, updatedAt: sql`now()` },
                    setWhere: sql`${brainSilverRecords.recordHash} <> excluded.record_hash`,
                }).returning({ id: brainSilverRecords.id });
            written += result.length;
        }
        return written;
    }
    listSilverPage(datasetId: string, afterSourceKey: string | null, limit: number): Promise<BrainSilverRecord[]> {
        return this.database.select().from(brainSilverRecords)
            .where(and(eq(brainSilverRecords.datasetId, datasetId), afterSourceKey === null ? undefined : gt(brainSilverRecords.sourceKey, afterSourceKey)))
            .orderBy(asc(brainSilverRecords.sourceKey)).limit(limit);
    }
    async setSilverEntities(datasetId: string, assignments: ReadonlyArray<{ sourceKey: string; entityId: string }>): Promise<void> {
        for (const part of chunks(assignments)) {
            const keys = part.map(item => item.sourceKey);
            const ids = part.map(item => item.entityId);
            await this.database.execute(sql`UPDATE brain_silver_records AS s SET entity_id = v.entity_id
                FROM unnest(${sql.param(keys)}::text[], ${sql.param(ids)}::uuid[]) AS v(source_key, entity_id)
                WHERE s.dataset_id = ${datasetId} AND s.source_key = v.source_key AND s.entity_id IS DISTINCT FROM v.entity_id`);
        }
    }
    async insertQuarantine(workspaceId: string, datasetId: string, runId: string, rows: ReadonlyArray<QuarantineInsert>): Promise<number> {
        let inserted = 0;
        for (const part of chunks(rows)) {
            const result = await this.database.insert(brainQuarantineRecords)
                .values(part.map(row => ({ workspaceId, datasetId, runId, sourceKey: row.sourceKey, payload: row.payload, reasons: row.reasons })))
                .returning({ id: brainQuarantineRecords.id });
            inserted += result.length;
        }
        return inserted;
    }
    listQuarantine(workspaceId: string, options: { datasetId?: string; status?: string; limit: number }): Promise<BrainQuarantineRecord[]> {
        return this.database.select().from(brainQuarantineRecords).where(and(
            eq(brainQuarantineRecords.workspaceId, workspaceId),
            options.datasetId ? eq(brainQuarantineRecords.datasetId, options.datasetId) : undefined,
            options.status ? eq(brainQuarantineRecords.status, options.status) : undefined,
        )).orderBy(desc(brainQuarantineRecords.createdAt)).limit(options.limit);
    }
    async updateQuarantine(id: string, workspaceId: string, data: Partial<Pick<BrainQuarantineRecord, "status" | "resolvedBy" | "resolvedAt">>): Promise<BrainQuarantineRecord | null> {
        const [row] = await this.database.update(brainQuarantineRecords).set(data)
            .where(and(eq(brainQuarantineRecords.id, id), eq(brainQuarantineRecords.workspaceId, workspaceId))).returning();
        return row ?? null;
    }
    async quarantineReasons(workspaceId: string, datasetId?: string): Promise<Array<{ datasetId: string; code: string; count: number }>> {
        const rows = await this.database.execute(sql`SELECT q.dataset_id AS "datasetId", reason->>'code' AS code, count(*)::int AS count
            FROM brain_quarantine_records q CROSS JOIN LATERAL jsonb_array_elements(q.reasons) AS reason
            WHERE q.workspace_id = ${workspaceId} AND q.status = 'open' ${datasetId ? sql`AND q.dataset_id = ${datasetId}` : sql``}
            GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 100`);
        return [...rows] as unknown as Array<{ datasetId: string; code: string; count: number }>;
    }
    async datasetCounts(datasetIds: ReadonlyArray<string>): Promise<Map<string, DatasetCounts>> {
        const result = new Map<string, DatasetCounts>();
        if (!datasetIds.length) return result;
        const ids = sql.param([...datasetIds]);
        const rows = await this.database.execute(sql`SELECT d.id AS "datasetId",
                (SELECT count(*)::int FROM brain_bronze_records b WHERE b.dataset_id = d.id) AS bronze,
                (SELECT count(*)::int FROM brain_silver_records s WHERE s.dataset_id = d.id) AS silver,
                (SELECT count(*)::int FROM brain_quarantine_records q WHERE q.dataset_id = d.id AND q.status = 'open') AS "quarantinedOpen"
            FROM brain_datasets d WHERE d.id = ANY(${ids}::uuid[])`);
        for (const row of rows as unknown as Array<{ datasetId: string; bronze: number; silver: number; quarantinedOpen: number }>) {
            result.set(row.datasetId, { bronze: row.bronze, silver: row.silver, quarantinedOpen: row.quarantinedOpen });
        }
        return result;
    }

    listQualityRules(datasetId: string): Promise<BrainQualityRule[]> {
        return this.database.select().from(brainQualityRules).where(eq(brainQualityRules.datasetId, datasetId)).orderBy(asc(brainQualityRules.createdAt));
    }
    async countQualityRules(datasetId: string): Promise<number> {
        const [row] = await this.database.select({ value: count() }).from(brainQualityRules).where(eq(brainQualityRules.datasetId, datasetId));
        return row?.value ?? 0;
    }
    async createQualityRule(data: NewBrainQualityRule): Promise<BrainQualityRule> {
        const [row] = await this.database.insert(brainQualityRules).values(data).returning();
        return row;
    }
    async updateQualityRule(id: string, datasetId: string, data: Partial<NewBrainQualityRule>): Promise<BrainQualityRule | null> {
        const [row] = await this.database.update(brainQualityRules).set({ ...data, updatedAt: new Date() })
            .where(and(eq(brainQualityRules.id, id), eq(brainQualityRules.datasetId, datasetId))).returning();
        return row ?? null;
    }
    async deleteQualityRule(id: string, datasetId: string): Promise<boolean> {
        const rows = await this.database.delete(brainQualityRules).where(and(eq(brainQualityRules.id, id), eq(brainQualityRules.datasetId, datasetId))).returning({ id: brainQualityRules.id });
        return rows.length > 0;
    }

    async createSchemaVersion(data: Omit<BrainSchemaVersion, "id" | "detectedAt">): Promise<BrainSchemaVersion> {
        const [row] = await this.database.insert(brainSchemaVersions).values(data).returning();
        return row;
    }
    listSchemaVersions(datasetId: string): Promise<BrainSchemaVersion[]> {
        return this.database.select().from(brainSchemaVersions).where(eq(brainSchemaVersions.datasetId, datasetId)).orderBy(desc(brainSchemaVersions.version)).limit(50);
    }

    listUnsealedBronze(limit: number) {
        return this.database.select({ id: brainBronzeRecords.id, datasetId: brainBronzeRecords.datasetId, sourceKey: brainBronzeRecords.sourceKey, payload: brainBronzeRecords.payload })
            .from(brainBronzeRecords).where(sql`NOT (${brainBronzeRecords.payload} ? '$sealed')`).orderBy(asc(brainBronzeRecords.extractedAt)).limit(limit);
    }
    async sealBronze(id: string, sealed: Record<string, unknown>): Promise<void> {
        await this.database.update(brainBronzeRecords).set({ payload: sealed })
            .where(and(eq(brainBronzeRecords.id, id), sql`NOT (${brainBronzeRecords.payload} ? '$sealed')`));
    }

    async listDatasetWorkspaces(): Promise<string[]> {
        const rows = await this.database.selectDistinct({ workspaceId: brainDatasets.workspaceId }).from(brainDatasets).where(sql`${brainDatasets.status} <> 'revoked'`);
        return rows.map(row => row.workspaceId);
    }
    listSourceLinks(workspaceId: string): Promise<BrainSourceLink[]> {
        return this.database.select().from(brainSourceLinks).where(eq(brainSourceLinks.workspaceId, workspaceId)).orderBy(asc(brainSourceLinks.createdAt));
    }
    async findSourceLink(workspaceId: string, connectionId: string): Promise<BrainSourceLink | null> {
        const [row] = await this.database.select().from(brainSourceLinks)
            .where(and(eq(brainSourceLinks.workspaceId, workspaceId), eq(brainSourceLinks.connectionId, connectionId))).limit(1);
        return row ?? null;
    }
    async createSourceLink(workspaceId: string, connectionId: string, linkedBy: string | null): Promise<BrainSourceLink> {
        const [created] = await this.database.insert(brainSourceLinks).values({ workspaceId, connectionId, linkedBy })
            .onConflictDoNothing({ target: [brainSourceLinks.workspaceId, brainSourceLinks.connectionId] }).returning();
        return created ?? (await this.findSourceLink(workspaceId, connectionId))!;
    }
    async deleteSourceLink(workspaceId: string, connectionId: string): Promise<boolean> {
        const rows = await this.database.delete(brainSourceLinks)
            .where(and(eq(brainSourceLinks.workspaceId, workspaceId), eq(brainSourceLinks.connectionId, connectionId))).returning({ id: brainSourceLinks.id });
        return rows.length > 0;
    }
    async revokeDatasetsForConnection(workspaceId: string, connectionId: string): Promise<string[]> {
        const rows = await this.database.update(brainDatasets).set({ status: "revoked", connectionId: null, nextSyncAt: null, updatedAt: new Date() })
            .where(and(eq(brainDatasets.workspaceId, workspaceId), eq(brainDatasets.connectionId, connectionId))).returning({ id: brainDatasets.id });
        return rows.map(row => row.id);
    }
}
