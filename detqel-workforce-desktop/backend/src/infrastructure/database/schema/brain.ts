import { sql } from "drizzle-orm";
import { boolean, char, date, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth.js";
import { connections } from "./connections.js";

/** One field of an inferred source schema. */
export interface BrainSchemaField { readonly name: string; readonly type: string; readonly nullable: boolean }
export interface BrainSchemaChanges { readonly added: string[]; readonly removed: string[]; readonly changed: Array<{ name: string; from: string; to: string }> }
export interface BrainReason { readonly code: string; readonly field?: string; readonly ruleId?: string; readonly message: string }
export interface BrainFilter { readonly field: string; readonly op: string; readonly value: unknown }
export interface BrainEntityAttribute { readonly key: string; readonly name: string; readonly type: string; readonly required: boolean; readonly identifier: boolean; readonly classification: string }
export interface BrainSourceRef { readonly datasetId: string; readonly sourceKey: string }
export interface BrainApprovalDecision { readonly userId: string; readonly decision: "approved" | "rejected"; readonly note: string | null; readonly at: string }
export interface BrainRetryEntry { readonly attempt: number; readonly error: string; readonly errorClass: string; readonly at: string }

// ---------- Business Data Platform: sources and the Medallion zones ----------

export const brainDatasets = pgTable("brain_datasets", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "set null" }),
    name: varchar("name", { length: 255 }).notNull(),
    domain: varchar("domain", { length: 120 }).notNull(),
    description: text("description"),
    sourceKind: varchar("source_kind", { length: 30 }).notNull(),
    sourceConfig: jsonb("source_config").$type<Record<string, unknown>>().notNull().default({}),
    primaryKeyField: varchar("primary_key_field", { length: 120 }),
    watermarkField: varchar("watermark_field", { length: 120 }),
    timeField: varchar("time_field", { length: 120 }),
    syncMode: varchar("sync_mode", { length: 20 }).notNull().default("full"),
    syncIntervalMinutes: integer("sync_interval_minutes"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    classification: varchar("classification", { length: 20 }).notNull().default("internal"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    freshnessSlaMinutes: integer("freshness_sla_minutes").notNull().default(1440),
    qualityThreshold: doublePrecision("quality_threshold").notNull().default(0.95),
    driftPolicy: varchar("drift_policy", { length: 20 }).notNull().default("accept"),
    schemaVersion: integer("schema_version").notNull().default(0),
    currentSchema: jsonb("current_schema").$type<BrainSchemaField[]>().notNull().default([]),
    cursor: jsonb("cursor").$type<Record<string, unknown>>().notNull().default({}),
    publishedZone: varchar("published_zone", { length: 10 }).notNull().default("bronze"),
    publishedVersion: integer("published_version").notNull().default(0),
    lastRunId: uuid("last_run_id"),
    lastRunStatus: varchar("last_run_status", { length: 20 }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    leaseOwner: varchar("lease_owner", { length: 64 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    uniqueIndex("uq_brain_datasets_workspace_name").on(table.workspaceId, sql`lower(${table.name})`),
    index("idx_brain_datasets_due").on(table.status, table.nextSyncAt),
    index("idx_brain_datasets_connection").on(table.connectionId),
]);

export const brainPipelineRuns = pgTable("brain_pipeline_runs", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id").notNull().references(() => brainDatasets.id, { onDelete: "cascade" }),
    trigger: varchar("trigger", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    attempt: integer("attempt").notNull().default(1),
    transformationVersion: varchar("transformation_version", { length: 60 }).notNull(),
    configHash: char("config_hash", { length: 64 }).notNull(),
    cursorFrom: jsonb("cursor_from").$type<Record<string, unknown>>().notNull().default({}),
    cursorTo: jsonb("cursor_to").$type<Record<string, unknown>>().notNull().default({}),
    schemaVersion: integer("schema_version").notNull().default(0),
    extractedCount: integer("extracted_count").notNull().default(0),
    bronzeInserted: integer("bronze_inserted").notNull().default(0),
    silverUpserted: integer("silver_upserted").notNull().default(0),
    quarantinedCount: integer("quarantined_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    passRate: doublePrecision("pass_rate"),
    published: boolean("published").notNull().default(false),
    publishedVersion: integer("published_version"),
    errorCode: varchar("error_code", { length: 60 }),
    errorMessage: text("error_message"),
    correlationId: uuid("correlation_id").notNull(),
    startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
}, table => [
    index("idx_brain_runs_dataset_started").on(table.datasetId, table.startedAt),
    index("idx_brain_runs_workspace_started").on(table.workspaceId, table.startedAt),
]);

export const brainBronzeRecords = pgTable("brain_bronze_records", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id").notNull().references(() => brainDatasets.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => brainPipelineRuns.id, { onDelete: "set null" }),
    sourceKey: varchar("source_key", { length: 512 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    payloadHash: char("payload_hash", { length: 64 }).notNull(),
    schemaVersion: integer("schema_version").notNull(),
    extractedAt: timestamp("extracted_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    uniqueIndex("uq_brain_bronze_record").on(table.datasetId, table.sourceKey, table.payloadHash),
    index("idx_brain_bronze_dataset_extracted").on(table.datasetId, table.extractedAt),
]);

export const brainSilverRecords = pgTable("brain_silver_records", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id").notNull().references(() => brainDatasets.id, { onDelete: "cascade" }),
    sourceKey: varchar("source_key", { length: 512 }).notNull(),
    entityId: uuid("entity_id").references(() => brainEntities.id, { onDelete: "set null" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    recordHash: char("record_hash", { length: 64 }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    runId: uuid("run_id").references(() => brainPipelineRuns.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    uniqueIndex("uq_brain_silver_record").on(table.datasetId, table.sourceKey),
    index("idx_brain_silver_dataset_observed").on(table.datasetId, table.observedAt),
    index("idx_brain_silver_entity").on(table.entityId),
]);

export const brainQuarantineRecords = pgTable("brain_quarantine_records", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id").notNull().references(() => brainDatasets.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => brainPipelineRuns.id, { onDelete: "set null" }),
    sourceKey: varchar("source_key", { length: 512 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    reasons: jsonb("reasons").$type<BrainReason[]>().notNull(),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    index("idx_brain_quarantine_dataset_status").on(table.datasetId, table.status),
    index("idx_brain_quarantine_workspace_created").on(table.workspaceId, table.createdAt),
]);

export const brainQualityRules = pgTable("brain_quality_rules", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id").notNull().references(() => brainDatasets.id, { onDelete: "cascade" }),
    ruleType: varchar("rule_type", { length: 30 }).notNull(),
    field: varchar("field", { length: 120 }).notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    severity: varchar("severity", { length: 10 }).notNull().default("error"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("idx_brain_quality_rules_dataset").on(table.datasetId)]);

export const brainSchemaVersions = pgTable("brain_schema_versions", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id").notNull().references(() => brainDatasets.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    fields: jsonb("fields").$type<BrainSchemaField[]>().notNull(),
    changes: jsonb("changes").$type<BrainSchemaChanges>().notNull(),
    runId: uuid("run_id").references(() => brainPipelineRuns.id, { onDelete: "set null" }),
    detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_brain_schema_version").on(table.datasetId, table.version)]);

// ---------- Business Brain: ontology, mappings, canonical entities, metrics, policies ----------

export const brainEntityTypes = pgTable("brain_entity_types", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    attributes: jsonb("attributes").$type<BrainEntityAttribute[]>().notNull().default([]),
    version: integer("version").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_brain_entity_types_key").on(table.workspaceId, table.key)]);

export const brainRelationshipTypes = pgTable("brain_relationship_types", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    fromTypeId: uuid("from_type_id").notNull().references(() => brainEntityTypes.id, { onDelete: "cascade" }),
    toTypeId: uuid("to_type_id").notNull().references(() => brainEntityTypes.id, { onDelete: "cascade" }),
    /** The attribute on the "from" entity whose value is the canonical key of the "to" entity. */
    fromAttribute: varchar("from_attribute", { length: 120 }).notNull(),
    cardinality: varchar("cardinality", { length: 20 }).notNull().default("one_to_many"),
    version: integer("version").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_brain_relationship_types_key").on(table.workspaceId, table.key)]);

export const brainSemanticMappings = pgTable("brain_semantic_mappings", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    datasetId: uuid("dataset_id").notNull().references(() => brainDatasets.id, { onDelete: "cascade" }),
    sourceField: varchar("source_field", { length: 255 }).notNull(),
    entityTypeId: uuid("entity_type_id").notNull().references(() => brainEntityTypes.id, { onDelete: "cascade" }),
    attributeKey: varchar("attribute_key", { length: 120 }).notNull(),
    transform: varchar("transform", { length: 20 }).notNull().default("identity"),
    confidence: doublePrecision("confidence").notNull(),
    method: varchar("method", { length: 20 }).notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 20 }).notNull().default("proposed"),
    version: integer("version").notNull().default(1),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).defaultNow().notNull(),
    proposedBy: varchar("proposed_by", { length: 80 }).notNull(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    uniqueIndex("uq_brain_mapping_target").on(table.datasetId, table.sourceField, table.entityTypeId, table.attributeKey),
    index("idx_brain_mappings_workspace_status").on(table.workspaceId, table.status),
]);

export const brainEntities = pgTable("brain_entities", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    entityTypeId: uuid("entity_type_id").notNull().references(() => brainEntityTypes.id, { onDelete: "cascade" }),
    canonicalKey: varchar("canonical_key", { length: 512 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    sourceRefs: jsonb("source_refs").$type<BrainSourceRef[]>().notNull().default([]),
    confidence: doublePrecision("confidence").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    mergedInto: uuid("merged_into"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    uniqueIndex("uq_brain_entities_canonical").on(table.workspaceId, table.entityTypeId, table.canonicalKey),
    index("idx_brain_entities_type_name").on(table.entityTypeId, table.displayName),
]);

export const brainEntityLinks = pgTable("brain_entity_links", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    relationshipTypeId: uuid("relationship_type_id").notNull().references(() => brainRelationshipTypes.id, { onDelete: "cascade" }),
    fromEntityId: uuid("from_entity_id").notNull().references(() => brainEntities.id, { onDelete: "cascade" }),
    toEntityId: uuid("to_entity_id").notNull().references(() => brainEntities.id, { onDelete: "cascade" }),
    sourceDatasetId: uuid("source_dataset_id").references(() => brainDatasets.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    uniqueIndex("uq_brain_entity_link").on(table.relationshipTypeId, table.fromEntityId, table.toEntityId),
    index("idx_brain_entity_links_workspace").on(table.workspaceId),
]);

export const brainMetricDefinitions = pgTable("brain_metric_definitions", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    datasetId: uuid("dataset_id").notNull().references(() => brainDatasets.id, { onDelete: "cascade" }),
    aggregation: varchar("aggregation", { length: 20 }).notNull(),
    valueField: varchar("value_field", { length: 120 }),
    timeField: varchar("time_field", { length: 120 }).notNull(),
    filters: jsonb("filters").$type<BrainFilter[]>().notNull().default([]),
    dimensions: jsonb("dimensions").$type<string[]>().notNull().default([]),
    timeGrain: varchar("time_grain", { length: 10 }).notNull().default("month"),
    unit: varchar("unit", { length: 20 }).notNull().default("number"),
    currency: varchar("currency", { length: 3 }),
    higherIsBetter: boolean("higher_is_better").notNull().default(true),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    version: integer("version").notNull().default(1),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).defaultNow().notNull(),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    computedAt: timestamp("computed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    uniqueIndex("uq_brain_metrics_key").on(table.workspaceId, table.key),
    index("idx_brain_metrics_dataset").on(table.datasetId),
]);

/** Gold: governed metric values per period, as a total ('' dimension key) and per single dimension value. */
export const brainMetricObservations = pgTable("brain_metric_observations", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    metricId: uuid("metric_id").notNull().references(() => brainMetricDefinitions.id, { onDelete: "cascade" }),
    metricVersion: integer("metric_version").notNull(),
    grain: varchar("grain", { length: 10 }).notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    dimension: varchar("dimension", { length: 120 }).notNull().default(""),
    dimensionValue: varchar("dimension_value", { length: 255 }).notNull().default(""),
    value: doublePrecision("value").notNull(),
    sampleCount: integer("sample_count").notNull(),
    datasetVersion: integer("dataset_version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    uniqueIndex("uq_brain_observation").on(table.metricId, table.grain, table.periodStart, table.dimension, table.dimensionValue),
    index("idx_brain_observations_metric_period").on(table.metricId, table.dimension, table.periodStart),
]);

export const brainAccessPolicies = pgTable("brain_access_policies", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    role: varchar("role", { length: 30 }).notNull(),
    resourceType: varchar("resource_type", { length: 20 }).notNull(),
    resourceId: uuid("resource_id").notNull(),
    effect: varchar("effect", { length: 20 }).notNull(),
    maskedFields: jsonb("masked_fields").$type<string[]>().notNull().default([]),
    rowFilter: jsonb("row_filter").$type<BrainFilter | null>(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("idx_brain_policies_resource").on(table.workspaceId, table.resourceType, table.resourceId)]);

// ---------- Intelligence Engine ----------

export const brainScenarios = pgTable("brain_scenarios", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    metricId: uuid("metric_id").notNull().references(() => brainMetricDefinitions.id, { onDelete: "cascade" }),
    horizon: integer("horizon").notNull(),
    assumptions: jsonb("assumptions").$type<Array<Record<string, unknown>>>().notNull(),
    status: varchar("status", { length: 20 }).notNull().default("saved"),
    lastRunId: uuid("last_run_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_brain_scenarios_name").on(table.workspaceId, sql`lower(${table.name})`)]);

export const brainAnalysisRuns = pgTable("brain_analysis_runs", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 30 }).notNull(),
    metricId: uuid("metric_id").references(() => brainMetricDefinitions.id, { onDelete: "set null" }),
    scenarioId: uuid("scenario_id").references(() => brainScenarios.id, { onDelete: "set null" }),
    baselineRunId: uuid("baseline_run_id"),
    methodKey: varchar("method_key", { length: 80 }).notNull(),
    methodVersion: varchar("method_version", { length: 40 }).notNull(),
    status: varchar("status", { length: 30 }).notNull(),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    inputSnapshot: jsonb("input_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
    reproducibilityHash: char("reproducibility_hash", { length: 64 }).notNull(),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => brainAgentTasks.id, { onDelete: "set null" }),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    index("idx_brain_analysis_workspace_kind").on(table.workspaceId, table.kind, table.createdAt),
    index("idx_brain_analysis_metric").on(table.metricId, table.createdAt),
]);

// ---------- AI Workforce: tasks, steps, approvals, tenant policy ----------

export const brainAgentTasks = pgTable("brain_agent_tasks", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => brainConversations.id, { onDelete: "set null" }),
    objective: text("objective").notNull(),
    initiatedBy: uuid("initiated_by").references(() => users.id, { onDelete: "set null" }),
    traceId: uuid("trace_id").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("planned"),
    planner: varchar("planner", { length: 20 }).notNull(),
    permissionContext: jsonb("permission_context").$type<Record<string, unknown>>().notNull(),
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown>>(),
    verification: jsonb("verification").$type<Record<string, unknown>>(),
    usage: jsonb("usage").$type<Record<string, number>>().notNull().default({}),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("idx_brain_tasks_workspace_created").on(table.workspaceId, table.createdAt)]);

export const brainTaskSteps = pgTable("brain_task_steps", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull().references(() => brainAgentTasks.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    agentKey: varchar("agent_key", { length: 60 }).notNull(),
    agentVersion: varchar("agent_version", { length: 20 }).notNull(),
    skillKey: varchar("skill_key", { length: 60 }),
    toolKey: varchar("tool_key", { length: 80 }).notNull(),
    toolVersion: varchar("tool_version", { length: 20 }).notNull(),
    purpose: text("purpose"),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    inputHash: char("input_hash", { length: 64 }).notNull(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    riskTier: varchar("risk_tier", { length: 20 }).notNull(),
    policyDecision: varchar("policy_decision", { length: 30 }).notNull(),
    policyReason: text("policy_reason"),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    dependsOn: jsonb("depends_on").$type<number[]>().notNull().default([]),
    approvalId: uuid("approval_id"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_brain_task_step").on(table.taskId, table.stepIndex)]);

export const brainPolicySettings = pgTable("brain_policy_settings", {
    workspaceId: uuid("workspace_id").primaryKey().references(() => workspaces.id, { onDelete: "cascade" }),
    actionTiers: jsonb("action_tiers").$type<Record<string, string>>().notNull().default({}),
    moderateRequiresApproval: boolean("moderate_requires_approval").notNull().default(false),
    criticalEnabled: boolean("critical_enabled").notNull().default(false),
    criticalRequiredApprovals: integer("critical_required_approvals").notNull().default(2),
    approvalTtlHours: integer("approval_ttl_hours").notNull().default(72),
    workflowsEnabled: boolean("workflows_enabled").notNull().default(true),
    externalSearchEnabled: boolean("external_search_enabled").notNull().default(true),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- Workflow Engine ----------

export const brainWorkflowDefinitions = pgTable("brain_workflow_definitions", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    version: integer("version").notNull().default(1),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    inputSchema: jsonb("input_schema").$type<Array<Record<string, unknown>>>().notNull().default([]),
    steps: jsonb("steps").$type<Array<Record<string, unknown>>>().notNull(),
    trigger: jsonb("trigger").$type<Record<string, unknown>>().notNull().default({ type: "manual" }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    uniqueIndex("uq_brain_workflow_version").on(table.workspaceId, table.key, table.version),
    index("idx_brain_workflows_due").on(table.status, table.nextRunAt),
]);

export const brainWorkflowRuns = pgTable("brain_workflow_runs", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    definitionId: uuid("definition_id").notNull().references(() => brainWorkflowDefinitions.id, { onDelete: "cascade" }),
    definitionVersion: integer("definition_version").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("queued"),
    triggerType: varchar("trigger_type", { length: 20 }).notNull(),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    correlationId: uuid("correlation_id").notNull(),
    error: text("error"),
    startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
    leaseOwner: varchar("lease_owner", { length: 64 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    wakeAt: timestamp("wake_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    uniqueIndex("uq_brain_workflow_run_idempotency").on(table.workspaceId, table.idempotencyKey),
    index("idx_brain_workflow_runs_ready").on(table.status, table.wakeAt),
    index("idx_brain_workflow_runs_workspace").on(table.workspaceId, table.createdAt),
]);

export const brainWorkflowStepRuns = pgTable("brain_workflow_step_runs", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull().references(() => brainWorkflowRuns.id, { onDelete: "cascade" }),
    stepKey: varchar("step_key", { length: 80 }).notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    retryHistory: jsonb("retry_history").$type<BrainRetryEntry[]>().notNull().default([]),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    errorClass: varchar("error_class", { length: 20 }),
    idempotencyKey: char("idempotency_key", { length: 64 }),
    approvalId: uuid("approval_id"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_brain_workflow_step_run").on(table.runId, table.stepKey)]);

/** A human decision bound to one exact action payload. A changed payload invalidates the approval. */
export const brainActionApprovals = pgTable("brain_action_approvals", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => brainWorkflowRuns.id, { onDelete: "cascade" }),
    stepKey: varchar("step_key", { length: 80 }),
    taskId: uuid("task_id").references(() => brainAgentTasks.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 80 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    riskTier: varchar("risk_tier", { length: 20 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    payloadHash: char("payload_hash", { length: 64 }).notNull(),
    preview: jsonb("preview").$type<Record<string, unknown>>().notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    requiredApprovals: integer("required_approvals").notNull().default(1),
    decisions: jsonb("decisions").$type<BrainApprovalDecision[]>().notNull().default([]),
    requestedByAgent: varchar("requested_by_agent", { length: 80 }),
    requestedByUser: uuid("requested_by_user").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    index("idx_brain_approvals_workspace_status").on(table.workspaceId, table.status, table.createdAt),
    index("idx_brain_approvals_expiry").on(table.status, table.expiresAt),
]);

// ---------- Governance: audit trail, event outbox, assistant conversations ----------

export const brainAuditEvents = pgTable("brain_audit_events", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    actorType: varchar("actor_type", { length: 20 }).notNull(),
    actorId: varchar("actor_id", { length: 120 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    targetType: varchar("target_type", { length: 60 }).notNull(),
    targetId: varchar("target_id", { length: 120 }),
    policyDecision: varchar("policy_decision", { length: 30 }),
    outcome: varchar("outcome", { length: 20 }).notNull(),
    correlationId: uuid("correlation_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    index("idx_brain_audit_workspace_created").on(table.workspaceId, table.createdAt),
    index("idx_brain_audit_target").on(table.workspaceId, table.targetType, table.targetId),
]);

export const brainEvents = pgTable("brain_events", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    eventVersion: integer("event_version").notNull().default(1),
    actorId: varchar("actor_id", { length: 120 }).notNull(),
    correlationId: uuid("correlation_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
}, table => [index("idx_brain_events_pending").on(table.occurredAt).where(sql`${table.processedAt} IS NULL`)]);

export const brainConversations = pgTable("brain_conversations", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("idx_brain_conversations_owner").on(table.workspaceId, table.userId, table.updatedAt)]);

export const brainMessages = pgTable("brain_messages", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => brainConversations.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: text("content").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    taskId: uuid("task_id").references(() => brainAgentTasks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [index("idx_brain_messages_conversation").on(table.conversationId, table.createdAt)]);

export type BrainDataset = typeof brainDatasets.$inferSelect;
export type NewBrainDataset = typeof brainDatasets.$inferInsert;
export type BrainPipelineRun = typeof brainPipelineRuns.$inferSelect;
export type NewBrainPipelineRun = typeof brainPipelineRuns.$inferInsert;
export type BrainBronzeRecord = typeof brainBronzeRecords.$inferSelect;
export type BrainSilverRecord = typeof brainSilverRecords.$inferSelect;
export type BrainQuarantineRecord = typeof brainQuarantineRecords.$inferSelect;
export type BrainQualityRule = typeof brainQualityRules.$inferSelect;
export type NewBrainQualityRule = typeof brainQualityRules.$inferInsert;
export type BrainSchemaVersion = typeof brainSchemaVersions.$inferSelect;
export type BrainEntityType = typeof brainEntityTypes.$inferSelect;
export type NewBrainEntityType = typeof brainEntityTypes.$inferInsert;
export type BrainRelationshipType = typeof brainRelationshipTypes.$inferSelect;
export type NewBrainRelationshipType = typeof brainRelationshipTypes.$inferInsert;
export type BrainSemanticMapping = typeof brainSemanticMappings.$inferSelect;
export type NewBrainSemanticMapping = typeof brainSemanticMappings.$inferInsert;
export type BrainEntity = typeof brainEntities.$inferSelect;
export type BrainEntityLink = typeof brainEntityLinks.$inferSelect;
export type BrainMetricDefinition = typeof brainMetricDefinitions.$inferSelect;
export type NewBrainMetricDefinition = typeof brainMetricDefinitions.$inferInsert;
export type BrainMetricObservation = typeof brainMetricObservations.$inferSelect;
export type BrainAccessPolicy = typeof brainAccessPolicies.$inferSelect;
export type NewBrainAccessPolicy = typeof brainAccessPolicies.$inferInsert;
export type BrainScenario = typeof brainScenarios.$inferSelect;
export type NewBrainScenario = typeof brainScenarios.$inferInsert;
export type BrainAnalysisRun = typeof brainAnalysisRuns.$inferSelect;
export type NewBrainAnalysisRun = typeof brainAnalysisRuns.$inferInsert;
export type BrainAgentTask = typeof brainAgentTasks.$inferSelect;
export type NewBrainAgentTask = typeof brainAgentTasks.$inferInsert;
export type BrainTaskStep = typeof brainTaskSteps.$inferSelect;
export type NewBrainTaskStep = typeof brainTaskSteps.$inferInsert;
export type BrainPolicySettings = typeof brainPolicySettings.$inferSelect;
export type BrainWorkflowDefinition = typeof brainWorkflowDefinitions.$inferSelect;
export type NewBrainWorkflowDefinition = typeof brainWorkflowDefinitions.$inferInsert;
export type BrainWorkflowRun = typeof brainWorkflowRuns.$inferSelect;
export type NewBrainWorkflowRun = typeof brainWorkflowRuns.$inferInsert;
export type BrainWorkflowStepRun = typeof brainWorkflowStepRuns.$inferSelect;
export type BrainActionApproval = typeof brainActionApprovals.$inferSelect;
export type NewBrainActionApproval = typeof brainActionApprovals.$inferInsert;
export type BrainAuditEvent = typeof brainAuditEvents.$inferSelect;
export type NewBrainAuditEvent = typeof brainAuditEvents.$inferInsert;
export type BrainEvent = typeof brainEvents.$inferSelect;
export type NewBrainEvent = typeof brainEvents.$inferInsert;
export type BrainConversation = typeof brainConversations.$inferSelect;
export type BrainMessage = typeof brainMessages.$inferSelect;
