import type {
    BrainDataset, BrainPipelineRun, BrainQualityRule, BrainQuarantineRecord, BrainReason, BrainSchemaVersion, BrainSilverRecord,
    NewBrainDataset, NewBrainPipelineRun, NewBrainQualityRule,
} from "../../../shared/types/entities.js";

export interface BronzeInsert {
    readonly sourceKey: string;
    readonly payload: Record<string, unknown>;
    readonly payloadHash: string;
}
export interface SilverUpsert {
    readonly sourceKey: string;
    readonly data: Record<string, unknown>;
    readonly recordHash: string;
    readonly observedAt: Date | null;
}
export interface QuarantineInsert {
    readonly sourceKey: string;
    readonly payload: Record<string, unknown>;
    readonly reasons: BrainReason[];
}
export interface DatasetCounts { readonly bronze: number; readonly silver: number; readonly quarantinedOpen: number }
export interface PeriodPipelineStats {
    readonly runs: number;
    readonly failedRuns: number;
    readonly extracted: number;
    readonly bronzeInserted: number;
    readonly silverUpserted: number;
    readonly quarantined: number;
}

/** Business Data Platform persistence: dataset registry, pipeline runs and the Bronze/Silver/quarantine zones. */
export interface IBrainDataRepository {
    createDataset(data: NewBrainDataset): Promise<BrainDataset>;
    countDatasets(workspaceId: string): Promise<number>;
    listDatasets(workspaceId: string): Promise<BrainDataset[]>;
    findDataset(id: string, workspaceId: string): Promise<BrainDataset | null>;
    findDatasetByName(workspaceId: string, name: string): Promise<BrainDataset | null>;
    updateDataset(id: string, workspaceId: string, data: Partial<NewBrainDataset>): Promise<BrainDataset | null>;
    deleteDataset(id: string, workspaceId: string): Promise<boolean>;
    /** Takes the dataset's processing lease when it is free or expired. Returns null when another worker holds it. */
    claimDataset(id: string, workspaceId: string, owner: string, leaseMs: number): Promise<BrainDataset | null>;
    /** Leases due datasets for scheduled syncs, skipping rows another worker has locked. */
    claimDueDatasets(owner: string, leaseMs: number, limit: number): Promise<BrainDataset[]>;
    /** Releases a lease held by `owner` and applies the post-run state in the same statement. */
    releaseDataset(id: string, owner: string, data: Partial<NewBrainDataset>): Promise<void>;
    /** Datasets whose worker stopped while holding a lease, for restart recovery. */
    listExpiredLeases(limit: number): Promise<BrainDataset[]>;

    createRun(data: NewBrainPipelineRun): Promise<BrainPipelineRun>;
    updateRun(id: string, data: Partial<NewBrainPipelineRun>): Promise<BrainPipelineRun | null>;
    findRun(id: string, workspaceId: string): Promise<BrainPipelineRun | null>;
    listRuns(workspaceId: string, options: { datasetId?: string; limit: number }): Promise<BrainPipelineRun[]>;
    /** Marks runs still "running" for a dataset as failed; used when a worker was interrupted. */
    failRunningRuns(datasetId: string, errorCode: string, errorMessage: string): Promise<number>;
    periodStats(workspaceId: string, from: Date, to: Date): Promise<PeriodPipelineStats>;

    /** Lands raw records; an identical record already landed for the dataset is skipped. Returns rows inserted. */
    insertBronze(workspaceId: string, datasetId: string, runId: string, schemaVersion: number, rows: ReadonlyArray<BronzeInsert>): Promise<number>;
    /** For uniqueness checks: which of the values another record of the dataset already holds in `field`. */
    findSilverValueOwners(datasetId: string, field: string, values: ReadonlyArray<string>): Promise<Map<string, string>>;
    /** For referential checks: which of the keys exist in the referenced dataset's Silver zone. */
    findExistingSilverKeys(datasetId: string, sourceKeys: ReadonlyArray<string>): Promise<Set<string>>;
    upsertSilver(workspaceId: string, datasetId: string, runId: string, rows: ReadonlyArray<SilverUpsert>): Promise<number>;
    listSilverPage(datasetId: string, afterSourceKey: string | null, limit: number): Promise<BrainSilverRecord[]>;
    setSilverEntities(datasetId: string, assignments: ReadonlyArray<{ sourceKey: string; entityId: string }>): Promise<void>;
    insertQuarantine(workspaceId: string, datasetId: string, runId: string, rows: ReadonlyArray<QuarantineInsert>): Promise<number>;
    listQuarantine(workspaceId: string, options: { datasetId?: string; status?: string; limit: number }): Promise<BrainQuarantineRecord[]>;
    updateQuarantine(id: string, workspaceId: string, data: Partial<Pick<BrainQuarantineRecord, "status" | "resolvedBy" | "resolvedAt">>): Promise<BrainQuarantineRecord | null>;
    quarantineReasons(workspaceId: string, datasetId?: string): Promise<Array<{ datasetId: string; code: string; count: number }>>;
    datasetCounts(datasetIds: ReadonlyArray<string>): Promise<Map<string, DatasetCounts>>;

    listQualityRules(datasetId: string): Promise<BrainQualityRule[]>;
    countQualityRules(datasetId: string): Promise<number>;
    createQualityRule(data: NewBrainQualityRule): Promise<BrainQualityRule>;
    updateQualityRule(id: string, datasetId: string, data: Partial<NewBrainQualityRule>): Promise<BrainQualityRule | null>;
    deleteQualityRule(id: string, datasetId: string): Promise<boolean>;

    createSchemaVersion(data: Omit<BrainSchemaVersion, "id" | "detectedAt">): Promise<BrainSchemaVersion>;
    listSchemaVersions(datasetId: string): Promise<BrainSchemaVersion[]>;
}
