/**
 * Business Brain: the governed data, semantic, intelligence, workforce and workflow layers behind the Business
 * Brain page. Every value that shapes behaviour (limits, versions, thresholds, state names) lives here so the
 * layers agree and tests can assert against the same source.
 */

/** Medallion processing zones. Gold is a processing stage, not business truth; meaning lives in the ontology. */
export const BRAIN_ZONES = { bronze: "bronze", silver: "silver", gold: "gold" } as const;
export type BrainZone = (typeof BRAIN_ZONES)[keyof typeof BRAIN_ZONES];

export const BRAIN_DATASET_STATUSES = { active: "active", paused: "paused", error: "error", revoked: "revoked" } as const;
export type BrainDatasetStatus = (typeof BRAIN_DATASET_STATUSES)[keyof typeof BRAIN_DATASET_STATUSES];

export const BRAIN_SYNC_MODES = { full: "full", incremental: "incremental" } as const;
export type BrainSyncMode = (typeof BRAIN_SYNC_MODES)[keyof typeof BRAIN_SYNC_MODES];

/** How a dataset is extracted, decided by the connector it reads. Only read operations exist on this path. */
export const BRAIN_SOURCE_KINDS = { database: "database", api: "api", files: "files" } as const;
export type BrainSourceKind = (typeof BRAIN_SOURCE_KINDS)[keyof typeof BRAIN_SOURCE_KINDS];

export const BRAIN_FILE_FORMATS = { json: "json", jsonl: "jsonl", csv: "csv" } as const;
export type BrainFileFormat = (typeof BRAIN_FILE_FORMATS)[keyof typeof BRAIN_FILE_FORMATS];

export const BRAIN_DRIFT_POLICIES = { accept: "accept", hold: "hold" } as const;
export type BrainDriftPolicy = (typeof BRAIN_DRIFT_POLICIES)[keyof typeof BRAIN_DRIFT_POLICIES];

export const BRAIN_CLASSIFICATIONS = { public: "public", internal: "internal", confidential: "confidential", restricted: "restricted" } as const;
export type BrainClassification = (typeof BRAIN_CLASSIFICATIONS)[keyof typeof BRAIN_CLASSIFICATIONS];

export const BRAIN_RUN_STATUSES = { queued: "queued", running: "running", succeeded: "succeeded", partial: "partial", failed: "failed", cancelled: "cancelled" } as const;
export type BrainRunStatus = (typeof BRAIN_RUN_STATUSES)[keyof typeof BRAIN_RUN_STATUSES];

export const BRAIN_RUN_TRIGGERS = { initial: "initial", manual: "manual", schedule: "schedule", retry: "retry", workflow: "workflow" } as const;
export type BrainRunTrigger = (typeof BRAIN_RUN_TRIGGERS)[keyof typeof BRAIN_RUN_TRIGGERS];

/** What a user sees about a dataset's data: these five states are always distinguishable (FR-DATA-014). */
export const BRAIN_FRESHNESS_STATES = { missing: "missing", delayed: "delayed", stale: "stale", partial: "partial", validated: "validated" } as const;
export type BrainFreshnessState = (typeof BRAIN_FRESHNESS_STATES)[keyof typeof BRAIN_FRESHNESS_STATES];

export const BRAIN_FIELD_TYPES = { string: "string", number: "number", integer: "integer", boolean: "boolean", date: "date", datetime: "datetime", json: "json" } as const;
export type BrainFieldType = (typeof BRAIN_FIELD_TYPES)[keyof typeof BRAIN_FIELD_TYPES];

export const BRAIN_QUALITY_RULE_TYPES = {
    required: "required", type: "type", unique: "unique", range: "range", pattern: "pattern",
    allowedValues: "allowed_values", maxLength: "max_length", referential: "referential",
} as const;
export type BrainQualityRuleType = (typeof BRAIN_QUALITY_RULE_TYPES)[keyof typeof BRAIN_QUALITY_RULE_TYPES];

export const BRAIN_QUALITY_SEVERITIES = { error: "error", warning: "warning" } as const;
export type BrainQualitySeverity = (typeof BRAIN_QUALITY_SEVERITIES)[keyof typeof BRAIN_QUALITY_SEVERITIES];

/** Reason codes attached to quarantined or flagged records. Records are never dropped silently (FR-DATA-010). */
export const BRAIN_REASON_CODES = {
    missingKey: "missing_key",
    duplicateKey: "duplicate_key",
    requiredMissing: "required_missing",
    typeMismatch: "type_mismatch",
    notUnique: "not_unique",
    outOfRange: "out_of_range",
    patternMismatch: "pattern_mismatch",
    valueNotAllowed: "value_not_allowed",
    tooLong: "too_long",
    referenceMissing: "reference_missing",
    invalidTimestamp: "invalid_timestamp",
    recordTooLarge: "record_too_large",
    notAnObject: "not_an_object",
} as const;
export type BrainReasonCode = (typeof BRAIN_REASON_CODES)[keyof typeof BRAIN_REASON_CODES];

export const BRAIN_QUARANTINE_STATUSES = { open: "open", resolved: "resolved", dismissed: "dismissed" } as const;

export const BRAIN_MAPPING_STATUSES = { proposed: "proposed", approved: "approved", rejected: "rejected" } as const;
export type BrainMappingStatus = (typeof BRAIN_MAPPING_STATUSES)[keyof typeof BRAIN_MAPPING_STATUSES];

export const BRAIN_MAPPING_METHODS = { rule: "rule", agent: "agent", manual: "manual" } as const;
export type BrainMappingMethod = (typeof BRAIN_MAPPING_METHODS)[keyof typeof BRAIN_MAPPING_METHODS];

export const BRAIN_MAPPING_TRANSFORMS = { identity: "identity", trim: "trim", lowercase: "lowercase", uppercase: "uppercase", number: "number", date: "date" } as const;
export type BrainMappingTransform = (typeof BRAIN_MAPPING_TRANSFORMS)[keyof typeof BRAIN_MAPPING_TRANSFORMS];

export const BRAIN_RELATIONSHIP_CARDINALITIES = { oneToOne: "one_to_one", oneToMany: "one_to_many", manyToMany: "many_to_many" } as const;

export const BRAIN_ENTITY_STATUSES = { active: "active", merged: "merged" } as const;

export const BRAIN_METRIC_AGGREGATIONS = { sum: "sum", count: "count", avg: "avg", min: "min", max: "max", countDistinct: "count_distinct" } as const;
export type BrainMetricAggregation = (typeof BRAIN_METRIC_AGGREGATIONS)[keyof typeof BRAIN_METRIC_AGGREGATIONS];

export const BRAIN_TIME_GRAINS = { day: "day", week: "week", month: "month", quarter: "quarter" } as const;
export type BrainTimeGrain = (typeof BRAIN_TIME_GRAINS)[keyof typeof BRAIN_TIME_GRAINS];

export const BRAIN_METRIC_UNITS = { currency: "currency", count: "count", percent: "percent", ratio: "ratio", number: "number", duration: "duration" } as const;
export type BrainMetricUnit = (typeof BRAIN_METRIC_UNITS)[keyof typeof BRAIN_METRIC_UNITS];

export const BRAIN_METRIC_STATUSES = { draft: "draft", approved: "approved", retired: "retired" } as const;
export type BrainMetricStatus = (typeof BRAIN_METRIC_STATUSES)[keyof typeof BRAIN_METRIC_STATUSES];

export const BRAIN_FILTER_OPERATORS = { eq: "eq", neq: "neq", in: "in", gt: "gt", gte: "gte", lt: "lt", lte: "lte" } as const;
export type BrainFilterOperator = (typeof BRAIN_FILTER_OPERATORS)[keyof typeof BRAIN_FILTER_OPERATORS];

export const BRAIN_POLICY_RESOURCES = { dataset: "dataset", metric: "metric", entityType: "entity_type" } as const;
export type BrainPolicyResource = (typeof BRAIN_POLICY_RESOURCES)[keyof typeof BRAIN_POLICY_RESOURCES];

export const BRAIN_POLICY_EFFECTS = { deny: "deny", mask: "mask", rowFilter: "row_filter" } as const;
export type BrainPolicyEffect = (typeof BRAIN_POLICY_EFFECTS)[keyof typeof BRAIN_POLICY_EFFECTS];

/** A policy naming this role applies to every member below workspace owner. */
export const BRAIN_POLICY_ALL_ROLES = "*";

export const BRAIN_ANALYSIS_KINDS = {
    forecast: "forecast", simulation: "simulation", optimisation: "optimisation",
    rootCause: "root_cause", recommendation: "recommendation", analytics: "analytics",
} as const;
export type BrainAnalysisKind = (typeof BRAIN_ANALYSIS_KINDS)[keyof typeof BRAIN_ANALYSIS_KINDS];

export const BRAIN_ANALYSIS_STATUSES = { succeeded: "succeeded", insufficientData: "insufficient_data", failed: "failed" } as const;
export type BrainAnalysisStatus = (typeof BRAIN_ANALYSIS_STATUSES)[keyof typeof BRAIN_ANALYSIS_STATUSES];

/** Deterministic computational methods. A changed algorithm gets a new version so old runs stay reproducible. */
export const BRAIN_METHODS = {
    holtLinear: { key: "holt-linear", version: "1.0.0" },
    linearTrend: { key: "ols-linear-trend", version: "1.0.0" },
    driverSimulation: { key: "driver-simulation", version: "1.0.0" },
    marginalAllocation: { key: "marginal-allocation", version: "1.0.0" },
    varianceDecomposition: { key: "variance-decomposition", version: "1.0.0" },
    recommendationRules: { key: "recommendation-rules", version: "1.0.0" },
} as const;

/** Labels the interface shows on every result statement (FR-INT-003). */
export const BRAIN_STATEMENT_KINDS = { fact: "fact", estimate: "estimate", assumption: "assumption", recommendation: "recommendation", caveat: "caveat" } as const;
export type BrainStatementKind = (typeof BRAIN_STATEMENT_KINDS)[keyof typeof BRAIN_STATEMENT_KINDS];

export const BRAIN_SCENARIO_ASSUMPTION_TYPES = {
    levelPercent: "level_percent",
    levelAbsolute: "level_absolute",
    growthPercent: "growth_percent",
    rampPercent: "ramp_percent",
} as const;
export type BrainScenarioAssumptionType = (typeof BRAIN_SCENARIO_ASSUMPTION_TYPES)[keyof typeof BRAIN_SCENARIO_ASSUMPTION_TYPES];

export const BRAIN_SCENARIO_STATUSES = { draft: "draft", saved: "saved", archived: "archived" } as const;

/** Action risk tiers (PRD 8.4). A user prompt never changes a tier; only platform code and tenant policy do. */
export const BRAIN_RISK_TIERS = { low: "low", moderate: "moderate", high: "high", critical: "critical" } as const;
export type BrainRiskTier = (typeof BRAIN_RISK_TIERS)[keyof typeof BRAIN_RISK_TIERS];
export const BRAIN_RISK_ORDER: Readonly<Record<BrainRiskTier, number>> = { low: 0, moderate: 1, high: 2, critical: 3 };

export const BRAIN_POLICY_DECISIONS = { allow: "allow", requireApproval: "require_approval", deny: "deny" } as const;
export type BrainPolicyDecision = (typeof BRAIN_POLICY_DECISIONS)[keyof typeof BRAIN_POLICY_DECISIONS];

export const BRAIN_TASK_STATUSES = { planned: "planned", running: "running", waitingApproval: "waiting_approval", succeeded: "succeeded", partial: "partial", failed: "failed", cancelled: "cancelled" } as const;
export type BrainTaskStatus = (typeof BRAIN_TASK_STATUSES)[keyof typeof BRAIN_TASK_STATUSES];

export const BRAIN_STEP_STATUSES = {
    pending: "pending", running: "running", waitingApproval: "waiting_approval", succeeded: "succeeded",
    failed: "failed", skipped: "skipped", blocked: "blocked", cancelled: "cancelled",
} as const;
export type BrainStepStatus = (typeof BRAIN_STEP_STATUSES)[keyof typeof BRAIN_STEP_STATUSES];

export const BRAIN_PLANNERS = { model: "model", rules: "rules" } as const;

export const BRAIN_WORKFLOW_STATUSES = { draft: "draft", active: "active", archived: "archived" } as const;
export type BrainWorkflowStatus = (typeof BRAIN_WORKFLOW_STATUSES)[keyof typeof BRAIN_WORKFLOW_STATUSES];

/** Durable workflow run states (PRD 9.1). Transitions are checked by the engine, never set freely. */
export const BRAIN_WORKFLOW_RUN_STATUSES = {
    queued: "queued", running: "running", waitingApproval: "waiting_approval",
    succeeded: "succeeded", failed: "failed", cancelled: "cancelled", expired: "expired",
} as const;
export type BrainWorkflowRunStatus = (typeof BRAIN_WORKFLOW_RUN_STATUSES)[keyof typeof BRAIN_WORKFLOW_RUN_STATUSES];
export const BRAIN_TERMINAL_RUN_STATUSES: ReadonlyArray<BrainWorkflowRunStatus> = ["succeeded", "failed", "cancelled", "expired"];

export const BRAIN_WORKFLOW_TRIGGERS = { manual: "manual", schedule: "schedule", event: "event" } as const;
export type BrainWorkflowTrigger = (typeof BRAIN_WORKFLOW_TRIGGERS)[keyof typeof BRAIN_WORKFLOW_TRIGGERS];

export const BRAIN_ERROR_CLASSES = { transient: "transient", permanent: "permanent", policy: "policy" } as const;
export type BrainErrorClass = (typeof BRAIN_ERROR_CLASSES)[keyof typeof BRAIN_ERROR_CLASSES];

export const BRAIN_APPROVAL_STATUSES = { pending: "pending", approved: "approved", rejected: "rejected", expired: "expired", invalidated: "invalidated" } as const;
export type BrainApprovalStatus = (typeof BRAIN_APPROVAL_STATUSES)[keyof typeof BRAIN_APPROVAL_STATUSES];

export const BRAIN_ACTOR_TYPES = { user: "user", agent: "agent", system: "system" } as const;
export type BrainActorType = (typeof BRAIN_ACTOR_TYPES)[keyof typeof BRAIN_ACTOR_TYPES];

export const BRAIN_AUDIT_OUTCOMES = { success: "success", failure: "failure", denied: "denied" } as const;
export type BrainAuditOutcome = (typeof BRAIN_AUDIT_OUTCOMES)[keyof typeof BRAIN_AUDIT_OUTCOMES];

/** Versioned asynchronous event types, published through the outbox with the PRD 13.1 envelope. */
export const BRAIN_EVENT_TYPES = {
    pipelineCompleted: "dataset.pipeline.completed",
    pipelineFailed: "dataset.pipeline.failed",
    schemaDrift: "dataset.schema.drift",
    mappingProposed: "ontology.mapping.proposed",
    mappingReviewed: "ontology.mapping.reviewed",
    metricApproved: "semantic.metric.approved",
    analysisCompleted: "intelligence.analysis.completed",
    approvalRequested: "workforce.approval.requested",
    approvalDecided: "workforce.approval.decided",
    taskCompleted: "workforce.task.completed",
    workflowRunFinished: "workflow.run.finished",
} as const;
export type BrainEventType = (typeof BRAIN_EVENT_TYPES)[keyof typeof BRAIN_EVENT_TYPES];
export const BRAIN_EVENT_VERSION = 1;

export const BRAIN_MESSAGE_ROLES = { user: "user", assistant: "assistant" } as const;

/** Markdown prompts (backend/prompts) used by the Business Brain agents. */
export const BRAIN_PROMPT_IDS = { planner: "brain-orchestrator", composer: "brain-composer", ontologySteward: "brain-ontology-steward" } as const;

/** Silver normalizer version; recorded on every run so a transformation can be reproduced (FR-DATA-013). */
export const BRAIN_TRANSFORMATION_VERSION = "silver-normalizer@1.0.0";

export const BRAIN_LIMITS = {
    /** Rows per extraction page; matches the connector's read-only row cap. */
    pageRows: 200,
    maxPagesPerRun: 50,
    maxRecordsPerFile: 10_000,
    maxRecordBytes: 64 * 1024,
    maxFields: 200,
    maxDatasetsPerWorkspace: 300,
    /** Tables one Data Layer load may register, and tables discovery may list. */
    maxTablesPerLoad: 300,
    maxDiscoveredTables: 1_000,
    /** Concurrent column lookups while preparing a database load. */
    discoveryConcurrency: 4,
    databaseLoadsPerMinute: 3,
    /** Bronze rows written before sealing existed, sealed per scheduler tick. */
    legacySealBatch: 200,
    maxQualityRulesPerDataset: 100,
    maxSourceKeyCharacters: 512,
    sampleValuesPerField: 5,
    /** Datasets started by one scheduler tick, so a backlog cannot starve the API. */
    datasetsPerTick: 4,
    eventsPerTick: 50,
    workflowRunsPerTick: 5,
    schedulerTickMs: 15_000,
    schedulerStartupDelayMs: 5_000,
    leaseMs: 10 * 60_000,
    defaultSyncIntervalMinutes: 60,
    minSyncIntervalMinutes: 5,
    maxSyncIntervalMinutes: 7 * 24 * 60,
    defaultFreshnessSlaMinutes: 24 * 60,
    maxTransientRetries: 3,
    retryBaseDelayMs: 60_000,
    defaultQualityThreshold: 0.95,
    mappingConfidenceThreshold: 0.85,
    /** A rule-based proposal is approved automatically only above the threshold and with no close runner-up. */
    mappingAmbiguityMargin: 0.1,
    /** Agent proposals are capped below the threshold, so a person always reviews them. */
    agentMappingConfidenceCap: 0.84,
    maxEntityTypes: 200,
    maxAttributesPerEntity: 100,
    maxMetrics: 500,
    maxMetricDimensions: 6,
    maxObservationPeriods: 400,
    maxForecastHorizon: 24,
    minForecastPoints: 6,
    minHoltPoints: 8,
    maxScenarioAssumptions: 8,
    maxOptimisationOptions: 20,
    optimisationSteps: 200,
    maxRootCauseDrivers: 10,
    maxPlanSteps: 6,
    maxParallelSteps: 4,
    toolTimeoutMs: 45_000,
    maxToolOutputCharacters: 16_000,
    maxContextCharacters: 24_000,
    maxQuestionCharacters: 4_000,
    conversationHistoryMessages: 10,
    assistantRequestsPerMinute: 20,
    manualSyncsPerMinute: 6,
    maxWorkflowSteps: 25,
    maxWorkflowStepAttempts: 5,
    defaultWorkflowStepAttempts: 3,
    workflowStepTimeoutMs: 60_000,
    workflowRunTtlHours: 7 * 24,
    defaultApprovalTtlHours: 72,
    defaultCriticalApprovals: 2,
    overviewCacheMs: 10_000,
    listLimit: 100,
    auditListLimit: 200,
} as const;

/** How business records are protected before they are stored (see BrainDataProtector). */
export const BRAIN_DATA_PROTECTION = {
    rawRecordPurpose: "brain-raw-records",
    pseudonymPurpose: "brain-pseudonyms",
    pseudonymPrefix: "pii_",
    pseudonymHexLength: 24,
    /** A text field is personal when at least this share of its values are e-mail addresses. */
    emailShareThreshold: 0.6,
    /** Column names that hold personal data. Generic names such as "name" or "city" stay readable for analysis. */
    personalFieldPattern: /(?:^|_)(?:e_?mail|email_?address|phone|phone_?number|mobile|telephone|tel|fax|first_?name|last_?name|middle_?name|full_?name|surname|given_?name|maiden_?name|contact_?name|person_?name|dob|date_?of_?birth|birth_?date|birthday|address|address_?line_?\d?|street|street_?address|postcode|post_?code|postal_?code|zip|zip_?code|passport|passport_?number|national_?id|nin|tax_?id|tin|vat_?number|driver_?licen[cs]e|licen[cs]e_?number|ip_?address|ip|mac_?address|device_?id|gender|sex|ethnicity|religion|nationality|marital_?status|medical|diagnosis|health|biometric|geo_?location|latitude|longitude|lat|lng|lon)(?:_|$)/,
} as const;

export const BRAIN_ERRORS = {
    datasetNotFound: "Dataset not found",
    runNotFound: "Pipeline run not found",
    connectionNotFound: "The connection was not found in this workspace.",
    unsupportedConnector: "This connector cannot supply a dataset. Use a database, HTTP API or file connector.",
    sourceNotLinked: "Link this connection in the Data Layer before the Business Brain uses it.",
    tablesUnsupported: "Table discovery is available for database connections only.",
    sourceKindMismatch: "The dataset source does not match the connector type.",
    datasetRevoked: "This dataset was revoked. Register it again to resume ingestion.",
    datasetBusy: "This dataset is already syncing. Wait for the current run to finish.",
    datasetLimit: "This workspace has reached its dataset limit.",
    invalidField: "Field names may contain letters, numbers and underscores only.",
    schemaDriftHeld: "The source schema changed in a way the drift policy holds for review. Review the schema change, then retry.",
    qualityBelowThreshold: "The run passed fewer records than the dataset's quality threshold, so it was not published to Gold.",
    entityTypeNotFound: "Entity type not found",
    relationshipNotFound: "Relationship type not found",
    mappingNotFound: "Mapping not found",
    mappingReviewed: "This mapping was already reviewed.",
    entityNotFound: "Entity not found",
    metricNotFound: "Metric not found",
    metricNotApproved: "This metric is not approved yet. Approve its definition before using it for analysis.",
    metricFieldMissing: "This aggregation needs a value field.",
    scenarioNotFound: "Scenario not found",
    analysisNotFound: "Analysis run not found",
    insufficientData: "There is not enough validated data to produce this result.",
    taskNotFound: "Task not found",
    workflowNotFound: "Workflow not found",
    workflowRunNotFound: "Workflow run not found",
    workflowNotActive: "Only an active workflow can start a run.",
    workflowsDisabled: "Workflows are disabled for this workspace.",
    invalidTransition: "This workflow run cannot move to the requested state.",
    approvalNotFound: "Approval not found",
    approvalClosed: "This approval is no longer pending.",
    approvalChanged: "The action changed after this preview. Review the new preview before deciding.",
    approvalDuplicateDecision: "You already decided this approval. Another authorised person must decide next.",
    approvalSelf: "The person who requested a critical action cannot approve it.",
    policyNotFound: "Access policy not found",
    conversationNotFound: "Conversation not found",
    rateLimited: "Too many requests. Wait a moment and try again.",
    modelUnavailable: "No AI model is configured, so the assistant answered from governed data only.",
} as const;

/** Small synonyms used by the deterministic mapping suggester; agents may add evidence but never approve. */
export const BRAIN_FIELD_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
    id: ["identifier", "key", "code", "ref", "reference", "uuid", "number", "no"],
    name: ["title", "label", "display", "fullname"],
    email: ["mail", "emailaddress", "e_mail"],
    phone: ["telephone", "mobile", "tel", "contact_number"],
    amount: ["value", "total", "price", "revenue", "sum", "net", "gross"],
    status: ["state", "stage", "phase", "lifecycle"],
    created: ["createdat", "created_on", "opened", "start", "date"],
    closed: ["closedat", "close", "end", "won", "completed"],
    region: ["territory", "geo", "area", "zone", "country"],
    segment: ["tier", "category", "class", "type"],
    owner: ["rep", "manager", "assignee", "user"],
    account: ["customer", "client", "company", "organization", "organisation"],
};
