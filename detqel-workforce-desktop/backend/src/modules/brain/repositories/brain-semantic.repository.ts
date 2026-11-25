import type {
    BrainAccessPolicy, BrainEntity, BrainEntityType, BrainFilter, BrainMetricDefinition, BrainMetricObservation, BrainRelationshipType,
    BrainSemanticMapping, NewBrainAccessPolicy, NewBrainEntityType, NewBrainMetricDefinition, NewBrainRelationshipType, NewBrainSemanticMapping,
} from "../../../shared/types/entities.js";

export interface EntityUpsert {
    readonly canonicalKey: string;
    readonly displayName: string;
    readonly attributes: Record<string, unknown>;
    readonly sourceRef: { datasetId: string; sourceKey: string };
}
export interface LinkInsert { readonly relationshipTypeId: string; readonly fromEntityId: string; readonly toEntityId: string; readonly sourceDatasetId: string }

/** One aggregate row computed from Silver for a metric; dimensionValue is '' for the total. */
export interface AggregateRow { readonly periodStart: string; readonly dimensionValue: string; readonly value: number; readonly sampleCount: number }
export interface AggregateQuery {
    readonly datasetId: string;
    readonly aggregation: string;
    readonly valueField: string | null;
    readonly timeField: string;
    readonly grain: string;
    readonly filters: ReadonlyArray<BrainFilter>;
    readonly dimension: string | null;
    readonly from?: string;
    readonly to?: string;
}
export interface ObservationInsert { readonly periodStart: string; readonly dimension: string; readonly dimensionValue: string; readonly value: number; readonly sampleCount: number }
export interface MergeCandidate { readonly entityTypeId: string; readonly normalizedName: string; readonly entityIds: string[]; readonly names: string[] }

/** Business Brain persistence: ontology, semantic mappings, canonical entities, metrics, Gold observations, access policies. */
export interface IBrainSemanticRepository {
    listEntityTypes(workspaceId: string): Promise<BrainEntityType[]>;
    findEntityType(id: string, workspaceId: string): Promise<BrainEntityType | null>;
    findEntityTypeByKey(workspaceId: string, key: string): Promise<BrainEntityType | null>;
    countEntityTypes(workspaceId: string): Promise<number>;
    createEntityType(data: NewBrainEntityType): Promise<BrainEntityType>;
    updateEntityType(id: string, workspaceId: string, data: Partial<NewBrainEntityType>): Promise<BrainEntityType | null>;

    listRelationshipTypes(workspaceId: string): Promise<BrainRelationshipType[]>;
    findRelationshipType(id: string, workspaceId: string): Promise<BrainRelationshipType | null>;
    createRelationshipType(data: NewBrainRelationshipType): Promise<BrainRelationshipType>;
    updateRelationshipType(id: string, workspaceId: string, data: Partial<NewBrainRelationshipType>): Promise<BrainRelationshipType | null>;
    deleteRelationshipType(id: string, workspaceId: string): Promise<boolean>;

    listMappings(workspaceId: string, options: { datasetId?: string; status?: string; limit: number }): Promise<BrainSemanticMapping[]>;
    findMapping(id: string, workspaceId: string): Promise<BrainSemanticMapping | null>;
    /** Creates a mapping, or refreshes the evidence of an unreviewed proposal for the same target. Reviewed mappings are untouched. */
    upsertMapping(data: NewBrainSemanticMapping): Promise<BrainSemanticMapping>;
    updateMapping(id: string, workspaceId: string, data: Partial<NewBrainSemanticMapping>, expectedStatus?: string): Promise<BrainSemanticMapping | null>;
    countMappings(workspaceId: string, status: string): Promise<number>;

    /** Upserts canonical entities by key, merging new source references. Returns entity ids by canonical key. */
    upsertEntities(workspaceId: string, entityTypeId: string, rows: ReadonlyArray<EntityUpsert>): Promise<Map<string, string>>;
    findEntityIdsByKeys(workspaceId: string, entityTypeId: string, keys: ReadonlyArray<string>): Promise<Map<string, string>>;
    insertLinks(workspaceId: string, rows: ReadonlyArray<LinkInsert>): Promise<number>;
    searchEntities(workspaceId: string, options: { entityTypeId?: string; query?: string; limit: number }): Promise<BrainEntity[]>;
    findEntity(id: string, workspaceId: string): Promise<BrainEntity | null>;
    updateEntity(id: string, workspaceId: string, data: Partial<Pick<BrainEntity, "status" | "mergedInto" | "sourceRefs" | "attributes" | "confidence">>): Promise<BrainEntity | null>;
    listMergeCandidates(workspaceId: string, limit: number): Promise<MergeCandidate[]>;
    entityCounts(workspaceId: string): Promise<Array<{ entityTypeId: string; count: number }>>;
    countLinks(workspaceId: string): Promise<number>;
    /** Deletion propagation: removes a dataset's references and deletes entities left with no source. */
    removeDatasetReferences(workspaceId: string, datasetId: string): Promise<number>;

    listMetrics(workspaceId: string): Promise<BrainMetricDefinition[]>;
    listMetricsByDataset(datasetId: string): Promise<BrainMetricDefinition[]>;
    findMetric(id: string, workspaceId: string): Promise<BrainMetricDefinition | null>;
    findMetricByKey(workspaceId: string, key: string): Promise<BrainMetricDefinition | null>;
    createMetric(data: NewBrainMetricDefinition): Promise<BrainMetricDefinition>;
    updateMetric(id: string, workspaceId: string, data: Partial<NewBrainMetricDefinition>): Promise<BrainMetricDefinition | null>;
    /** Aggregates validated Silver records with parameterised JSON field access; no caller text reaches SQL. */
    aggregate(query: AggregateQuery, rowFilters?: ReadonlyArray<BrainFilter>): Promise<AggregateRow[]>;
    /** Replaces a metric's Gold observations for one grain atomically. */
    replaceObservations(workspaceId: string, metricId: string, metricVersion: number, grain: string, datasetVersion: number, rows: ReadonlyArray<ObservationInsert>): Promise<number>;
    listObservations(metricId: string, options: { grain: string; dimension: string; from?: string; to?: string; limit: number }): Promise<BrainMetricObservation[]>;

    listPolicies(workspaceId: string): Promise<BrainAccessPolicy[]>;
    findPolicy(id: string, workspaceId: string): Promise<BrainAccessPolicy | null>;
    createPolicy(data: NewBrainAccessPolicy): Promise<BrainAccessPolicy>;
    deletePolicy(id: string, workspaceId: string): Promise<boolean>;
}
