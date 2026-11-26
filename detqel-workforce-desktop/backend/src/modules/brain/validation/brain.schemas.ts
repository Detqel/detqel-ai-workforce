import { z } from "zod";
import {
    BRAIN_CLASSIFICATIONS, BRAIN_DRIFT_POLICIES, BRAIN_FIELD_TYPES, BRAIN_FILE_FORMATS, BRAIN_FILTER_OPERATORS, BRAIN_LIMITS, BRAIN_MAPPING_TRANSFORMS,
    BRAIN_METRIC_AGGREGATIONS, BRAIN_METRIC_UNITS, BRAIN_POLICY_ALL_ROLES, BRAIN_POLICY_EFFECTS, BRAIN_POLICY_RESOURCES, BRAIN_QUALITY_RULE_TYPES,
    BRAIN_QUALITY_SEVERITIES, BRAIN_RISK_TIERS, BRAIN_SCENARIO_ASSUMPTION_TYPES, BRAIN_SYNC_MODES, BRAIN_TIME_GRAINS,
} from "../../../constants/brainConstants.js";
import { BRAIN_TIMEFRAMES } from "../services/brain-overview.service.js";
import { workflowInputSchema, workflowStepSchema, workflowTriggerSchema } from "../services/workflow/workflow-definitions.js";

const uuid = z.string().uuid();
const values = <T extends Record<string, string>>(object: T) => Object.values(object) as [T[keyof T], ...T[keyof T][]];
const field = z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/, "Field names may contain letters, numbers and underscores only.");
const text = (max: number) => z.string().trim().min(1).max(max);
const limit = z.coerce.number().int().min(1).max(BRAIN_LIMITS.listLimit).optional();

export const workspaceParams = z.object({ workspaceId: uuid });
export const datasetParams = workspaceParams.extend({ datasetId: uuid });
export const sourceParams = workspaceParams.extend({ connectionId: uuid });
export const columnsQuery = z.object({ schema: text(128), table: text(128) });
export const ruleParams = datasetParams.extend({ ruleId: uuid });
export const runParams = workspaceParams.extend({ runId: uuid });
export const recordParams = workspaceParams.extend({ recordId: uuid });
export const entityTypeParams = workspaceParams.extend({ entityTypeId: uuid });
export const relationshipParams = workspaceParams.extend({ relationshipTypeId: uuid });
export const mappingParams = workspaceParams.extend({ mappingId: uuid });
export const entityParams = workspaceParams.extend({ entityId: uuid });
export const metricParams = workspaceParams.extend({ metricId: uuid });
export const policyParams = workspaceParams.extend({ policyId: uuid });
export const scenarioParams = workspaceParams.extend({ scenarioId: uuid });
export const taskParams = workspaceParams.extend({ taskId: uuid });
export const workflowParams = workspaceParams.extend({ workflowId: uuid });
export const approvalParams = workspaceParams.extend({ approvalId: uuid });
export const conversationParams = workspaceParams.extend({ conversationId: uuid });
export const templateParams = workspaceParams.extend({ templateKey: z.string().regex(/^[a-z0-9-]{1,40}$/) });

export const overviewQuery = z.object({ timeframe: z.enum(BRAIN_TIMEFRAMES).default("30d") });
export const contextQuery = z.object({ question: text(BRAIN_LIMITS.maxQuestionCharacters) });
export const listQuery = z.object({ limit });

const filterSchema = z.object({
    field, op: z.enum(values(BRAIN_FILTER_OPERATORS)),
    value: z.union([z.string().max(500), z.number().finite(), z.boolean(), z.array(z.union([z.string().max(500), z.number().finite()])).max(100)]),
}).strict();

/** A business domain label, such as "Sales" or "Procurement & Supply". */
const domain = text(120).regex(/^[\p{L}\p{N}][\p{L}\p{N} &/_.,()-]*$/u, "Use letters, numbers, spaces and & / - . , ( ) for the business domain.");
export const datasetBody = z.object({
    connectionId: uuid,
    name: text(255),
    domain,
    description: z.string().trim().max(2_000).nullish(),
    source: z.object({
        sql: z.string().trim().max(BRAIN_LIMITS.maxQuestionCharacters).optional(),
        path: z.string().trim().max(1_024).optional(),
        format: z.enum(values(BRAIN_FILE_FORMATS)).optional(),
        recordsPath: z.string().trim().max(200).regex(/^[A-Za-z0-9_.]*$/).optional(),
    }).strict(),
    primaryKeyField: field.nullish(),
    watermarkField: field.nullish(),
    timeField: field.nullish(),
    syncMode: z.enum(values(BRAIN_SYNC_MODES)).default("full"),
    syncIntervalMinutes: z.number().int().min(BRAIN_LIMITS.minSyncIntervalMinutes).max(BRAIN_LIMITS.maxSyncIntervalMinutes).nullish(),
    classification: z.enum(values(BRAIN_CLASSIFICATIONS)).default("internal"),
    freshnessSlaMinutes: z.number().int().min(5).max(60 * 24 * 90).default(BRAIN_LIMITS.defaultFreshnessSlaMinutes),
    qualityThreshold: z.number().min(0).max(1).default(BRAIN_LIMITS.defaultQualityThreshold),
    driftPolicy: z.enum(values(BRAIN_DRIFT_POLICIES)).default("accept"),
    ownerUserId: uuid.nullish(),
}).strict();

export const databaseLoadBody = z.object({
    scope: z.enum(["database", "tables"]),
    tables: z.array(z.object({ schema: text(128), name: text(128) }).strict()).min(1).max(BRAIN_LIMITS.maxTablesPerLoad).optional(),
    domain,
    schemaDomains: z.record(text(128), domain).refine(map => Object.keys(map).length <= 200, "Too many schemas.").optional(),
    includeViews: z.boolean().default(false),
    syncIntervalMinutes: z.number().int().min(BRAIN_LIMITS.minSyncIntervalMinutes).max(BRAIN_LIMITS.maxSyncIntervalMinutes).nullish(),
    classification: z.enum(values(BRAIN_CLASSIFICATIONS)).default("confidential"),
}).strict().refine(body => body.scope === "database" || Boolean(body.tables?.length), "Choose at least one table.");

export const qualityRuleBody = z.object({
    ruleType: z.enum(values(BRAIN_QUALITY_RULE_TYPES)),
    field,
    config: z.object({
        type: z.enum(values(BRAIN_FIELD_TYPES)).optional(),
        min: z.union([z.number().finite(), z.string().max(40)]).optional(),
        max: z.union([z.number().finite(), z.string().max(40)]).optional(),
        pattern: z.string().max(200).optional(),
        values: z.array(z.union([z.string().max(200), z.number().finite()])).max(200).optional(),
        datasetId: uuid.optional(),
    }).strict().default({}),
    severity: z.enum(values(BRAIN_QUALITY_SEVERITIES)).default("error"),
    enabled: z.boolean().default(true),
}).strict();

export const runsQuery = z.object({ datasetId: uuid.optional(), limit });
export const quarantineQuery = z.object({ datasetId: uuid.optional(), status: z.enum(["open", "resolved", "dismissed"]).optional(), limit });
export const quarantineResolveBody = z.object({ status: z.enum(["resolved", "dismissed"]) }).strict();

const attributeSchema = z.object({
    key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,59}$/), name: text(120), type: z.enum(values(BRAIN_FIELD_TYPES)),
    required: z.boolean().default(false), identifier: z.boolean().default(false), classification: z.enum(values(BRAIN_CLASSIFICATIONS)).default("internal"),
}).strict();
export const entityTypeBody = z.object({
    key: z.string().regex(/^[A-Z][A-Za-z0-9]{0,79}$/, "Use a PascalCase key such as Account."), name: text(255),
    description: z.string().trim().max(2_000).nullish(), attributes: z.array(attributeSchema).max(BRAIN_LIMITS.maxAttributesPerEntity),
}).strict();
export const entityTypeUpdateBody = entityTypeBody.omit({ key: true });
export const relationshipBody = z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/), name: text(255), description: z.string().trim().max(2_000).nullish(),
    fromTypeId: uuid, toTypeId: uuid, fromAttribute: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,59}$/),
    cardinality: z.enum(["one_to_one", "one_to_many", "many_to_many"]).default("one_to_many"),
}).strict();
export const relationshipUpdateBody = relationshipBody.omit({ key: true });
export const mappingsQuery = z.object({ datasetId: uuid.optional(), status: z.enum(["proposed", "approved", "rejected"]).optional(), limit: z.coerce.number().int().min(1).max(500).optional() });
export const mappingBody = z.object({ datasetId: uuid, sourceField: text(255), entityTypeId: uuid, attributeKey: z.string().max(120), transform: z.enum(values(BRAIN_MAPPING_TRANSFORMS)).default("identity") }).strict();
export const suggestBody = z.object({ useAgent: z.boolean().default(true) }).strict();
export const reviewBody = z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(1_000).nullish() }).strict();
export const entitiesQuery = z.object({ entityType: z.string().max(80).optional(), q: z.string().trim().max(120).optional(), limit });
export const mergeBody = z.object({ targetId: uuid }).strict();

export const metricBody = z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,79}$/, "Use a snake_case key such as net_revenue."), name: text(255), description: z.string().trim().max(2_000).nullish(),
    datasetId: uuid, aggregation: z.enum(values(BRAIN_METRIC_AGGREGATIONS)), valueField: field.nullish(), timeField: field,
    filters: z.array(filterSchema).max(10).default([]), dimensions: z.array(field).max(BRAIN_LIMITS.maxMetricDimensions).default([]),
    timeGrain: z.enum(values(BRAIN_TIME_GRAINS)).default("month"), unit: z.enum(values(BRAIN_METRIC_UNITS)).default("number"),
    currency: z.string().regex(/^[A-Z]{3}$/).nullish(), higherIsBetter: z.boolean().default(true), ownerUserId: uuid.nullish(),
}).strict();
export const semanticQueryBody = z.object({
    metricKey: z.string().max(80), grain: z.enum(values(BRAIN_TIME_GRAINS)).optional(), periods: z.number().int().min(1).max(BRAIN_LIMITS.maxObservationPeriods).optional(),
    from: z.string().date().optional(), to: z.string().date().optional(), dimension: field.optional(), dimensionValue: z.string().max(255).optional(),
}).strict();
export const policyBody = z.object({
    name: text(255), role: z.enum(["admin", "manager", "analyst", "employee", BRAIN_POLICY_ALL_ROLES]),
    resourceType: z.enum(values(BRAIN_POLICY_RESOURCES)), resourceId: uuid, effect: z.enum(values(BRAIN_POLICY_EFFECTS)),
    maskedFields: z.array(field).max(100).default([]), rowFilter: filterSchema.nullish(),
}).strict().refine(policy => policy.effect !== "mask" || policy.maskedFields.length > 0, "A mask policy needs at least one field.")
    .refine(policy => policy.effect !== "row_filter" || Boolean(policy.rowFilter), "A row filter policy needs a filter.");

const assumptionSchema = z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), label: text(120), type: z.enum(values(BRAIN_SCENARIO_ASSUMPTION_TYPES)), value: z.number().finite(),
    startPeriod: z.number().int().min(1).max(BRAIN_LIMITS.maxForecastHorizon).optional(), rampPeriods: z.number().int().min(1).max(BRAIN_LIMITS.maxForecastHorizon).optional(),
}).strict();
export const forecastBody = z.object({
    metricKey: z.string().max(80), horizon: z.number().int().min(1).max(BRAIN_LIMITS.maxForecastHorizon).optional(),
    method: z.enum(["auto", "holt-linear", "ols-linear-trend"]).optional(), confidence: z.union([z.literal(0.8), z.literal(0.9), z.literal(0.95)]).optional(),
    dimension: field.optional(), dimensionValue: z.string().max(255).optional(), history: z.number().int().min(6).max(BRAIN_LIMITS.maxObservationPeriods).optional(),
}).strict();
export const simulationBody = z.object({
    scenarioId: uuid.optional(), metricKey: z.string().max(80).optional(), horizon: z.number().int().min(1).max(BRAIN_LIMITS.maxForecastHorizon).optional(),
    assumptions: z.array(assumptionSchema).max(BRAIN_LIMITS.maxScenarioAssumptions).optional(), baselineRunId: uuid.optional(),
    save: z.object({ name: text(255), description: z.string().trim().max(2_000).nullish() }).strict().optional(),
}).strict().refine(body => Boolean(body.scenarioId) || (Boolean(body.metricKey) && Boolean(body.assumptions?.length)), "Provide a saved scenario, or a metric with assumptions.");
export const optimisationBody = z.object({
    spendMetricKey: z.string().max(80).optional(), returnMetricKey: z.string().max(80).optional(), dimension: field.optional(),
    periods: z.number().int().min(1).max(12).optional(), budget: z.number().positive().finite().optional(),
    options: z.array(z.object({ key: text(120), label: text(120), currentSpend: z.number().min(0).finite(), currentReturn: z.number().min(0).finite(), min: z.number().min(0).finite(), max: z.number().min(0).finite() }).strict().refine(option => option.min <= option.max, "min must not exceed max")).max(BRAIN_LIMITS.maxOptimisationOptions).optional(),
}).strict();
export const rootCauseBody = z.object({ metricKey: z.string().max(80), dimension: field.optional() }).strict();
export const analysisRunsQuery = z.object({ kind: z.enum(["forecast", "simulation", "optimisation", "root_cause"]).optional(), limit });
export const scenarioBody = z.object({ name: text(255), description: z.string().trim().max(2_000).nullish(), metricKey: z.string().max(80), horizon: z.number().int().min(1).max(BRAIN_LIMITS.maxForecastHorizon), assumptions: z.array(assumptionSchema).min(1).max(BRAIN_LIMITS.maxScenarioAssumptions) }).strict();
export const recommendationWorkflowBody = z.object({ recommendationIndex: z.number().int().min(0).max(10) }).strict();

export const policySettingsBody = z.object({
    actionTiers: z.record(z.string().regex(/^[a-z_.]{3,80}$/), z.enum(values(BRAIN_RISK_TIERS))).optional(),
    moderateRequiresApproval: z.boolean().optional(), criticalEnabled: z.boolean().optional(),
    criticalRequiredApprovals: z.number().int().min(2).max(5).optional(), approvalTtlHours: z.number().int().min(1).max(24 * 30).optional(),
    workflowsEnabled: z.boolean().optional(), externalSearchEnabled: z.boolean().optional(),
}).strict();

export const workflowBody = z.object({
    key: z.string().regex(/^[a-z][a-z0-9_-]{1,79}$/), name: text(255), description: z.string().trim().max(2_000).nullish(),
    inputSchema: z.array(workflowInputSchema).max(20).default([]), steps: z.array(workflowStepSchema).min(1).max(BRAIN_LIMITS.maxWorkflowSteps),
    trigger: workflowTriggerSchema.default({ type: "manual" }),
}).strict();
export const workflowUpdateBody = workflowBody.omit({ key: true });
export const workflowTemplateBody = z.object({ template: z.string().regex(/^[a-z0-9-]{1,40}$/), name: text(255), key: z.string().regex(/^[a-z][a-z0-9_-]{1,79}$/).optional(), description: z.string().trim().max(2_000).optional() }).strict();
export const workflowRunBody = z.object({ inputs: z.record(z.string(), z.unknown()).default({}), idempotencyKey: z.string().regex(/^[A-Za-z0-9_.:-]{8,120}$/).optional() }).strict();
export const workflowRunsQuery = z.object({ definitionId: uuid.optional(), status: z.enum(["queued", "running", "waiting_approval", "succeeded", "failed", "cancelled", "expired"]).optional(), limit });
export const approvalsQuery = z.object({ status: z.enum(["pending", "approved", "rejected", "expired", "invalidated"]).optional() });
export const decisionBody = z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(1_000).nullish(), payloadHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();

export const askBody = z.object({
    conversationId: uuid.optional(),
    message: text(BRAIN_LIMITS.maxQuestionCharacters),
    attachments: z.array(z.string().trim().min(1).max(255)).max(10).optional(),
}).strict();
export const auditQuery = z.object({ targetType: z.string().max(60).optional(), targetId: z.string().max(120).optional(), limit: z.coerce.number().int().min(1).max(BRAIN_LIMITS.auditListLimit).optional(), before: z.string().datetime().optional() });
