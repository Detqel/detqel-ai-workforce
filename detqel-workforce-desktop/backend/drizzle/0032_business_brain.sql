CREATE TABLE "brain_datasets" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "connection_id" uuid REFERENCES "connections"("id") ON DELETE SET NULL,
    "name" varchar(255) NOT NULL,
    "domain" varchar(120) NOT NULL,
    "description" text,
    "source_kind" varchar(30) NOT NULL,
    "source_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "primary_key_field" varchar(120),
    "watermark_field" varchar(120),
    "time_field" varchar(120),
    "sync_mode" varchar(20) DEFAULT 'full' NOT NULL,
    "sync_interval_minutes" integer,
    "status" varchar(20) DEFAULT 'active' NOT NULL,
    "classification" varchar(20) DEFAULT 'internal' NOT NULL,
    "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "freshness_sla_minutes" integer DEFAULT 1440 NOT NULL,
    "quality_threshold" double precision DEFAULT 0.95 NOT NULL,
    "drift_policy" varchar(20) DEFAULT 'accept' NOT NULL,
    "schema_version" integer DEFAULT 0 NOT NULL,
    "current_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "published_zone" varchar(10) DEFAULT 'bronze' NOT NULL,
    "published_version" integer DEFAULT 0 NOT NULL,
    "last_run_id" uuid,
    "last_run_status" varchar(20),
    "last_success_at" timestamp with time zone,
    "last_attempt_at" timestamp with time zone,
    "next_sync_at" timestamp with time zone,
    "consecutive_failures" integer DEFAULT 0 NOT NULL,
    "lease_owner" varchar(64),
    "lease_expires_at" timestamp with time zone,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "brain_datasets_source_kind_check" CHECK ("source_kind" IN ('database', 'api', 'files')),
    CONSTRAINT "brain_datasets_status_check" CHECK ("status" IN ('active', 'paused', 'error', 'revoked')),
    CONSTRAINT "brain_datasets_threshold_check" CHECK ("quality_threshold" >= 0 AND "quality_threshold" <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_datasets_workspace_name" ON "brain_datasets" ("workspace_id", lower("name"));
--> statement-breakpoint
CREATE INDEX "idx_brain_datasets_due" ON "brain_datasets" ("status", "next_sync_at");
--> statement-breakpoint
CREATE INDEX "idx_brain_datasets_connection" ON "brain_datasets" ("connection_id");
--> statement-breakpoint
CREATE TABLE "brain_pipeline_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "dataset_id" uuid NOT NULL REFERENCES "brain_datasets"("id") ON DELETE CASCADE,
    "trigger" varchar(20) NOT NULL,
    "status" varchar(20) DEFAULT 'running' NOT NULL,
    "attempt" integer DEFAULT 1 NOT NULL,
    "transformation_version" varchar(60) NOT NULL,
    "config_hash" char(64) NOT NULL,
    "cursor_from" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "cursor_to" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "schema_version" integer DEFAULT 0 NOT NULL,
    "extracted_count" integer DEFAULT 0 NOT NULL,
    "bronze_inserted" integer DEFAULT 0 NOT NULL,
    "silver_upserted" integer DEFAULT 0 NOT NULL,
    "quarantined_count" integer DEFAULT 0 NOT NULL,
    "warning_count" integer DEFAULT 0 NOT NULL,
    "pass_rate" double precision,
    "published" boolean DEFAULT false NOT NULL,
    "published_version" integer,
    "error_code" varchar(60),
    "error_message" text,
    "correlation_id" uuid NOT NULL,
    "started_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_brain_runs_dataset_started" ON "brain_pipeline_runs" ("dataset_id", "started_at");
--> statement-breakpoint
CREATE INDEX "idx_brain_runs_workspace_started" ON "brain_pipeline_runs" ("workspace_id", "started_at");
--> statement-breakpoint
CREATE TABLE "brain_bronze_records" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "dataset_id" uuid NOT NULL REFERENCES "brain_datasets"("id") ON DELETE CASCADE,
    "run_id" uuid REFERENCES "brain_pipeline_runs"("id") ON DELETE SET NULL,
    "source_key" varchar(512) NOT NULL,
    "payload" jsonb NOT NULL,
    "payload_hash" char(64) NOT NULL,
    "schema_version" integer NOT NULL,
    "extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_bronze_record" ON "brain_bronze_records" ("dataset_id", "source_key", "payload_hash");
--> statement-breakpoint
CREATE INDEX "idx_brain_bronze_dataset_extracted" ON "brain_bronze_records" ("dataset_id", "extracted_at");
--> statement-breakpoint
CREATE TABLE "brain_entity_types" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "key" varchar(80) NOT NULL,
    "name" varchar(255) NOT NULL,
    "description" text,
    "attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "status" varchar(20) DEFAULT 'active' NOT NULL,
    "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_entity_types_key" ON "brain_entity_types" ("workspace_id", "key");
--> statement-breakpoint
CREATE TABLE "brain_entities" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "entity_type_id" uuid NOT NULL REFERENCES "brain_entity_types"("id") ON DELETE CASCADE,
    "canonical_key" varchar(512) NOT NULL,
    "display_name" varchar(255) NOT NULL,
    "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "source_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "confidence" double precision DEFAULT 1 NOT NULL,
    "status" varchar(20) DEFAULT 'active' NOT NULL,
    "merged_into" uuid REFERENCES "brain_entities"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_entities_canonical" ON "brain_entities" ("workspace_id", "entity_type_id", "canonical_key");
--> statement-breakpoint
CREATE INDEX "idx_brain_entities_type_name" ON "brain_entities" ("entity_type_id", "display_name");
--> statement-breakpoint
CREATE TABLE "brain_silver_records" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "dataset_id" uuid NOT NULL REFERENCES "brain_datasets"("id") ON DELETE CASCADE,
    "source_key" varchar(512) NOT NULL,
    "entity_id" uuid REFERENCES "brain_entities"("id") ON DELETE SET NULL,
    "data" jsonb NOT NULL,
    "record_hash" char(64) NOT NULL,
    "observed_at" timestamp with time zone,
    "run_id" uuid REFERENCES "brain_pipeline_runs"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_silver_record" ON "brain_silver_records" ("dataset_id", "source_key");
--> statement-breakpoint
CREATE INDEX "idx_brain_silver_dataset_observed" ON "brain_silver_records" ("dataset_id", "observed_at");
--> statement-breakpoint
CREATE INDEX "idx_brain_silver_entity" ON "brain_silver_records" ("entity_id");
--> statement-breakpoint
CREATE TABLE "brain_quarantine_records" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "dataset_id" uuid NOT NULL REFERENCES "brain_datasets"("id") ON DELETE CASCADE,
    "run_id" uuid REFERENCES "brain_pipeline_runs"("id") ON DELETE SET NULL,
    "source_key" varchar(512) NOT NULL,
    "payload" jsonb NOT NULL,
    "reasons" jsonb NOT NULL,
    "status" varchar(20) DEFAULT 'open' NOT NULL,
    "resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_brain_quarantine_dataset_status" ON "brain_quarantine_records" ("dataset_id", "status");
--> statement-breakpoint
CREATE INDEX "idx_brain_quarantine_workspace_created" ON "brain_quarantine_records" ("workspace_id", "created_at");
--> statement-breakpoint
CREATE TABLE "brain_quality_rules" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "dataset_id" uuid NOT NULL REFERENCES "brain_datasets"("id") ON DELETE CASCADE,
    "rule_type" varchar(30) NOT NULL,
    "field" varchar(120) NOT NULL,
    "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "severity" varchar(10) DEFAULT 'error' NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_brain_quality_rules_dataset" ON "brain_quality_rules" ("dataset_id");
--> statement-breakpoint
CREATE TABLE "brain_schema_versions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "dataset_id" uuid NOT NULL REFERENCES "brain_datasets"("id") ON DELETE CASCADE,
    "version" integer NOT NULL,
    "fields" jsonb NOT NULL,
    "changes" jsonb NOT NULL,
    "run_id" uuid REFERENCES "brain_pipeline_runs"("id") ON DELETE SET NULL,
    "detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_schema_version" ON "brain_schema_versions" ("dataset_id", "version");
--> statement-breakpoint
CREATE TABLE "brain_relationship_types" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "key" varchar(80) NOT NULL,
    "name" varchar(255) NOT NULL,
    "description" text,
    "from_type_id" uuid NOT NULL REFERENCES "brain_entity_types"("id") ON DELETE CASCADE,
    "to_type_id" uuid NOT NULL REFERENCES "brain_entity_types"("id") ON DELETE CASCADE,
    "from_attribute" varchar(120) NOT NULL,
    "cardinality" varchar(20) DEFAULT 'one_to_many' NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "status" varchar(20) DEFAULT 'active' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_relationship_types_key" ON "brain_relationship_types" ("workspace_id", "key");
--> statement-breakpoint
CREATE TABLE "brain_semantic_mappings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "dataset_id" uuid NOT NULL REFERENCES "brain_datasets"("id") ON DELETE CASCADE,
    "source_field" varchar(255) NOT NULL,
    "entity_type_id" uuid NOT NULL REFERENCES "brain_entity_types"("id") ON DELETE CASCADE,
    "attribute_key" varchar(120) NOT NULL,
    "transform" varchar(20) DEFAULT 'identity' NOT NULL,
    "confidence" double precision NOT NULL,
    "method" varchar(20) NOT NULL,
    "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "status" varchar(20) DEFAULT 'proposed' NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
    "proposed_by" varchar(80) NOT NULL,
    "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "reviewed_at" timestamp with time zone,
    "review_note" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "brain_mappings_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_mapping_target" ON "brain_semantic_mappings" ("dataset_id", "source_field", "entity_type_id", "attribute_key");
--> statement-breakpoint
CREATE INDEX "idx_brain_mappings_workspace_status" ON "brain_semantic_mappings" ("workspace_id", "status");
--> statement-breakpoint
CREATE TABLE "brain_entity_links" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "relationship_type_id" uuid NOT NULL REFERENCES "brain_relationship_types"("id") ON DELETE CASCADE,
    "from_entity_id" uuid NOT NULL REFERENCES "brain_entities"("id") ON DELETE CASCADE,
    "to_entity_id" uuid NOT NULL REFERENCES "brain_entities"("id") ON DELETE CASCADE,
    "source_dataset_id" uuid REFERENCES "brain_datasets"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_entity_link" ON "brain_entity_links" ("relationship_type_id", "from_entity_id", "to_entity_id");
--> statement-breakpoint
CREATE INDEX "idx_brain_entity_links_workspace" ON "brain_entity_links" ("workspace_id");
--> statement-breakpoint
CREATE TABLE "brain_metric_definitions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "key" varchar(80) NOT NULL,
    "name" varchar(255) NOT NULL,
    "description" text,
    "dataset_id" uuid NOT NULL REFERENCES "brain_datasets"("id") ON DELETE CASCADE,
    "aggregation" varchar(20) NOT NULL,
    "value_field" varchar(120),
    "time_field" varchar(120) NOT NULL,
    "filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "dimensions" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "time_grain" varchar(10) DEFAULT 'month' NOT NULL,
    "unit" varchar(20) DEFAULT 'number' NOT NULL,
    "currency" varchar(3),
    "higher_is_better" boolean DEFAULT true NOT NULL,
    "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "status" varchar(20) DEFAULT 'draft' NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
    "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "approved_at" timestamp with time zone,
    "computed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "brain_metrics_aggregation_check" CHECK ("aggregation" IN ('sum', 'count', 'avg', 'min', 'max', 'count_distinct')),
    CONSTRAINT "brain_metrics_grain_check" CHECK ("time_grain" IN ('day', 'week', 'month', 'quarter'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_metrics_key" ON "brain_metric_definitions" ("workspace_id", "key");
--> statement-breakpoint
CREATE INDEX "idx_brain_metrics_dataset" ON "brain_metric_definitions" ("dataset_id");
--> statement-breakpoint
CREATE TABLE "brain_metric_observations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "metric_id" uuid NOT NULL REFERENCES "brain_metric_definitions"("id") ON DELETE CASCADE,
    "metric_version" integer NOT NULL,
    "grain" varchar(10) NOT NULL,
    "period_start" date NOT NULL,
    "dimension" varchar(120) DEFAULT '' NOT NULL,
    "dimension_value" varchar(255) DEFAULT '' NOT NULL,
    "value" double precision NOT NULL,
    "sample_count" integer NOT NULL,
    "dataset_version" integer NOT NULL,
    "computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_observation" ON "brain_metric_observations" ("metric_id", "grain", "period_start", "dimension", "dimension_value");
--> statement-breakpoint
CREATE INDEX "idx_brain_observations_metric_period" ON "brain_metric_observations" ("metric_id", "dimension", "period_start");
--> statement-breakpoint
CREATE TABLE "brain_access_policies" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "name" varchar(255) NOT NULL,
    "role" varchar(30) NOT NULL,
    "resource_type" varchar(20) NOT NULL,
    "resource_id" uuid NOT NULL,
    "effect" varchar(20) NOT NULL,
    "masked_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "row_filter" jsonb,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "brain_policies_effect_check" CHECK ("effect" IN ('deny', 'mask', 'row_filter')),
    CONSTRAINT "brain_policies_resource_check" CHECK ("resource_type" IN ('dataset', 'metric', 'entity_type'))
);
--> statement-breakpoint
CREATE INDEX "idx_brain_policies_resource" ON "brain_access_policies" ("workspace_id", "resource_type", "resource_id");
--> statement-breakpoint
CREATE TABLE "brain_scenarios" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "name" varchar(255) NOT NULL,
    "description" text,
    "metric_id" uuid NOT NULL REFERENCES "brain_metric_definitions"("id") ON DELETE CASCADE,
    "horizon" integer NOT NULL,
    "assumptions" jsonb NOT NULL,
    "status" varchar(20) DEFAULT 'saved' NOT NULL,
    "last_run_id" uuid,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_scenarios_name" ON "brain_scenarios" ("workspace_id", lower("name"));
--> statement-breakpoint
CREATE TABLE "brain_conversations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "title" varchar(255) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_brain_conversations_owner" ON "brain_conversations" ("workspace_id", "user_id", "updated_at");
--> statement-breakpoint
CREATE TABLE "brain_agent_tasks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "conversation_id" uuid REFERENCES "brain_conversations"("id") ON DELETE SET NULL,
    "objective" text NOT NULL,
    "initiated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "trace_id" uuid NOT NULL,
    "status" varchar(30) DEFAULT 'planned' NOT NULL,
    "planner" varchar(20) NOT NULL,
    "permission_context" jsonb NOT NULL,
    "plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "result" jsonb,
    "verification" jsonb,
    "usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "error" text,
    "started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_brain_tasks_workspace_created" ON "brain_agent_tasks" ("workspace_id", "created_at");
--> statement-breakpoint
CREATE TABLE "brain_analysis_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "kind" varchar(30) NOT NULL,
    "metric_id" uuid REFERENCES "brain_metric_definitions"("id") ON DELETE SET NULL,
    "scenario_id" uuid REFERENCES "brain_scenarios"("id") ON DELETE SET NULL,
    "baseline_run_id" uuid,
    "method_key" varchar(80) NOT NULL,
    "method_version" varchar(40) NOT NULL,
    "status" varchar(30) NOT NULL,
    "inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "input_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "result" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "reproducibility_hash" char(64) NOT NULL,
    "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "task_id" uuid REFERENCES "brain_agent_tasks"("id") ON DELETE SET NULL,
    "correlation_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_brain_analysis_workspace_kind" ON "brain_analysis_runs" ("workspace_id", "kind", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_brain_analysis_metric" ON "brain_analysis_runs" ("metric_id", "created_at");
--> statement-breakpoint
CREATE TABLE "brain_task_steps" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "task_id" uuid NOT NULL REFERENCES "brain_agent_tasks"("id") ON DELETE CASCADE,
    "step_index" integer NOT NULL,
    "agent_key" varchar(60) NOT NULL,
    "agent_version" varchar(20) NOT NULL,
    "skill_key" varchar(60),
    "tool_key" varchar(80) NOT NULL,
    "tool_version" varchar(20) NOT NULL,
    "purpose" text,
    "input" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "input_hash" char(64) NOT NULL,
    "output" jsonb,
    "risk_tier" varchar(20) NOT NULL,
    "policy_decision" varchar(30) NOT NULL,
    "policy_reason" text,
    "status" varchar(30) DEFAULT 'pending' NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "depends_on" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "approval_id" uuid,
    "error" text,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_task_step" ON "brain_task_steps" ("task_id", "step_index");
--> statement-breakpoint
CREATE TABLE "brain_policy_settings" (
    "workspace_id" uuid PRIMARY KEY NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "action_tiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "moderate_requires_approval" boolean DEFAULT false NOT NULL,
    "critical_enabled" boolean DEFAULT false NOT NULL,
    "critical_required_approvals" integer DEFAULT 2 NOT NULL,
    "approval_ttl_hours" integer DEFAULT 72 NOT NULL,
    "workflows_enabled" boolean DEFAULT true NOT NULL,
    "external_search_enabled" boolean DEFAULT true NOT NULL,
    "updated_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "brain_policy_settings_approvals_check" CHECK ("critical_required_approvals" BETWEEN 2 AND 5)
);
--> statement-breakpoint
CREATE TABLE "brain_workflow_definitions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "key" varchar(80) NOT NULL,
    "name" varchar(255) NOT NULL,
    "description" text,
    "version" integer DEFAULT 1 NOT NULL,
    "status" varchar(20) DEFAULT 'draft' NOT NULL,
    "input_schema" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "steps" jsonb NOT NULL,
    "trigger" jsonb DEFAULT '{"type":"manual"}'::jsonb NOT NULL,
    "next_run_at" timestamp with time zone,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_workflow_version" ON "brain_workflow_definitions" ("workspace_id", "key", "version");
--> statement-breakpoint
CREATE INDEX "idx_brain_workflows_due" ON "brain_workflow_definitions" ("status", "next_run_at");
--> statement-breakpoint
CREATE TABLE "brain_workflow_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "definition_id" uuid NOT NULL REFERENCES "brain_workflow_definitions"("id") ON DELETE CASCADE,
    "definition_version" integer NOT NULL,
    "status" varchar(30) DEFAULT 'queued' NOT NULL,
    "trigger_type" varchar(20) NOT NULL,
    "inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "idempotency_key" varchar(160) NOT NULL,
    "correlation_id" uuid NOT NULL,
    "error" text,
    "started_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "lease_owner" varchar(64),
    "lease_expires_at" timestamp with time zone,
    "wake_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "brain_workflow_runs_status_check" CHECK ("status" IN ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_workflow_run_idempotency" ON "brain_workflow_runs" ("workspace_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "idx_brain_workflow_runs_ready" ON "brain_workflow_runs" ("status", "wake_at");
--> statement-breakpoint
CREATE INDEX "idx_brain_workflow_runs_workspace" ON "brain_workflow_runs" ("workspace_id", "created_at");
--> statement-breakpoint
CREATE TABLE "brain_workflow_step_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "run_id" uuid NOT NULL REFERENCES "brain_workflow_runs"("id") ON DELETE CASCADE,
    "step_key" varchar(80) NOT NULL,
    "action" varchar(80) NOT NULL,
    "status" varchar(30) DEFAULT 'pending' NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "retry_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "input" jsonb,
    "output" jsonb,
    "error" text,
    "error_class" varchar(20),
    "idempotency_key" char(64),
    "approval_id" uuid,
    "next_attempt_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_workflow_step_run" ON "brain_workflow_step_runs" ("run_id", "step_key");
--> statement-breakpoint
CREATE TABLE "brain_action_approvals" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "run_id" uuid REFERENCES "brain_workflow_runs"("id") ON DELETE CASCADE,
    "step_key" varchar(80),
    "task_id" uuid REFERENCES "brain_agent_tasks"("id") ON DELETE CASCADE,
    "action" varchar(80) NOT NULL,
    "title" varchar(255) NOT NULL,
    "risk_tier" varchar(20) NOT NULL,
    "payload" jsonb NOT NULL,
    "payload_hash" char(64) NOT NULL,
    "preview" jsonb NOT NULL,
    "status" varchar(20) DEFAULT 'pending' NOT NULL,
    "required_approvals" integer DEFAULT 1 NOT NULL,
    "decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "requested_by_agent" varchar(80),
    "requested_by_user" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "decided_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "brain_approvals_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'expired', 'invalidated'))
);
--> statement-breakpoint
CREATE INDEX "idx_brain_approvals_workspace_status" ON "brain_action_approvals" ("workspace_id", "status", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_brain_approvals_expiry" ON "brain_action_approvals" ("status", "expires_at");
--> statement-breakpoint
CREATE TABLE "brain_audit_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "actor_type" varchar(20) NOT NULL,
    "actor_id" varchar(120) NOT NULL,
    "action" varchar(120) NOT NULL,
    "target_type" varchar(60) NOT NULL,
    "target_id" varchar(120),
    "policy_decision" varchar(30),
    "outcome" varchar(20) NOT NULL,
    "correlation_id" uuid,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_brain_audit_workspace_created" ON "brain_audit_events" ("workspace_id", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_brain_audit_target" ON "brain_audit_events" ("workspace_id", "target_type", "target_id");
--> statement-breakpoint
CREATE TABLE "brain_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "event_type" varchar(120) NOT NULL,
    "event_version" integer DEFAULT 1 NOT NULL,
    "actor_id" varchar(120) NOT NULL,
    "correlation_id" uuid NOT NULL,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
    "processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_brain_events_pending" ON "brain_events" ("occurred_at") WHERE "processed_at" IS NULL;
--> statement-breakpoint
CREATE TABLE "brain_messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "conversation_id" uuid NOT NULL REFERENCES "brain_conversations"("id") ON DELETE CASCADE,
    "role" varchar(20) NOT NULL,
    "content" text NOT NULL,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "task_id" uuid REFERENCES "brain_agent_tasks"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_brain_messages_conversation" ON "brain_messages" ("conversation_id", "created_at");
