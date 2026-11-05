-- Reconcile real-database drift with the Drizzle model. No data is changed except clearing the invalid VYRA placeholder key.
--
-- 1. Migrations 0005, 0006 and 0008-0010 were written by hand, so Postgres auto-named their constraints
--    (<table>_<column>_key, _fkey, _pkey). Drizzle expects <table>_<column>_unique, _fk and _pk, and a future
--    generated "DROP CONSTRAINT" would fail against the real names. Each rename is guarded and idempotent.
DO $$
DECLARE
  item record;
  target regclass;
  stored_name text;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('agent_assignment_types', 'agent_assignment_types_code_key', 'agent_assignment_types_code_unique'),
    ('agent_assignment_types', 'agent_assignment_types_name_key', 'agent_assignment_types_name_unique'),
    ('agent_capabilities', 'agent_capabilities_capability_type_id_fkey', 'agent_capabilities_capability_type_id_agent_capability_types_id_fk'),
    ('agent_capabilities', 'agent_capabilities_code_key', 'agent_capabilities_code_unique'),
    ('agent_capabilities', 'agent_capabilities_name_key', 'agent_capabilities_name_unique'),
    ('agent_capability_types', 'agent_capability_types_code_key', 'agent_capability_types_code_unique'),
    ('agent_capability_types', 'agent_capability_types_name_key', 'agent_capability_types_name_unique'),
    ('agent_execution_logs', 'agent_execution_logs_run_id_fkey', 'agent_execution_logs_run_id_agent_runs_id_fk'),
    ('agent_levels', 'agent_levels_code_key', 'agent_levels_code_unique'),
    ('agent_run_steps', 'agent_run_steps_run_id_fkey', 'agent_run_steps_run_id_agent_runs_id_fk'),
    ('agent_runs', 'agent_runs_organization_agent_id_fkey', 'agent_runs_organization_agent_id_organization_agents_id_fk'),
    ('agent_runs', 'agent_runs_trigger_type_id_fkey', 'agent_runs_trigger_type_id_agent_trigger_types_id_fk'),
    ('agent_sections', 'agent_sections_name_key', 'agent_sections_name_unique'),
    ('agent_sections', 'agent_sections_slug_key', 'agent_sections_slug_unique'),
    ('agent_skill_categories', 'agent_skill_categories_code_key', 'agent_skill_categories_code_unique'),
    ('agent_skill_categories', 'agent_skill_categories_name_key', 'agent_skill_categories_name_unique'),
    ('agent_skills', 'agent_skills_category_id_fkey', 'agent_skills_category_id_agent_skill_categories_id_fk'),
    ('agent_skills', 'agent_skills_code_key', 'agent_skills_code_unique'),
    ('agent_skills', 'agent_skills_name_key', 'agent_skills_name_unique'),
    ('agent_statuses', 'agent_statuses_code_key', 'agent_statuses_code_unique'),
    ('agent_template_capabilities', 'agent_template_capabilities_capability_id_fkey', 'agent_template_capabilities_capability_id_agent_capabilities_id_fk'),
    ('agent_template_capabilities', 'agent_template_capabilities_pkey', 'agent_template_capabilities_template_id_capability_id_pk'),
    ('agent_template_capabilities', 'agent_template_capabilities_template_id_fkey', 'agent_template_capabilities_template_id_agent_templates_id_fk'),
    ('agent_template_skills', 'agent_template_skills_pkey', 'agent_template_skills_template_id_skill_id_pk'),
    ('agent_template_skills', 'agent_template_skills_skill_id_fkey', 'agent_template_skills_skill_id_agent_skills_id_fk'),
    ('agent_template_skills', 'agent_template_skills_template_id_fkey', 'agent_template_skills_template_id_agent_templates_id_fk'),
    ('agent_template_tools', 'agent_template_tools_pkey', 'agent_template_tools_template_id_tool_id_pk'),
    ('agent_template_tools', 'agent_template_tools_template_id_fkey', 'agent_template_tools_template_id_agent_templates_id_fk'),
    ('agent_template_tools', 'agent_template_tools_tool_id_fkey', 'agent_template_tools_tool_id_agent_tools_id_fk'),
    ('agent_template_versions', 'agent_template_versions_template_id_fkey', 'agent_template_versions_template_id_agent_templates_id_fk'),
    ('agent_templates', 'agent_templates_level_id_fkey', 'agent_templates_level_id_agent_levels_id_fk'),
    ('agent_templates', 'agent_templates_section_id_fkey', 'agent_templates_section_id_agent_sections_id_fk'),
    ('agent_templates', 'agent_templates_slug_key', 'agent_templates_slug_unique'),
    ('agent_templates', 'agent_templates_status_id_fkey', 'agent_templates_status_id_agent_statuses_id_fk'),
    ('agent_tool_categories', 'agent_tool_categories_code_key', 'agent_tool_categories_code_unique'),
    ('agent_tool_categories', 'agent_tool_categories_name_key', 'agent_tool_categories_name_unique'),
    ('agent_tools', 'agent_tools_category_id_fkey', 'agent_tools_category_id_agent_tool_categories_id_fk'),
    ('agent_tools', 'agent_tools_code_key', 'agent_tools_code_unique'),
    ('agent_tools', 'agent_tools_name_key', 'agent_tools_name_unique'),
    ('agent_trigger_types', 'agent_trigger_types_code_key', 'agent_trigger_types_code_unique'),
    ('agent_trigger_types', 'agent_trigger_types_name_key', 'agent_trigger_types_name_unique'),
    ('connector_catalog', 'connector_catalog_code_key', 'connector_catalog_code_unique'),
    ('connector_types', 'connector_types_code_key', 'connector_types_code_unique'),
    ('organization_agent_assignments', 'organization_agent_assignments_assigned_by_fkey', 'organization_agent_assignments_assigned_by_users_id_fk'),
    ('organization_agent_assignments', 'organization_agent_assignments_assignment_type_id_fkey', 'organization_agent_assignments_assignment_type_id_agent_assignment_types_id_fk'),
    ('organization_agent_assignments', 'organization_agent_assignments_organization_agent_id_fkey', 'organization_agent_assignments_organization_agent_id_organization_agents_id_fk'),
    ('organization_agent_tools', 'organization_agent_tools_organization_agent_id_fkey', 'organization_agent_tools_organization_agent_id_organization_agents_id_fk'),
    ('organization_agent_tools', 'organization_agent_tools_tool_id_fkey', 'organization_agent_tools_tool_id_agent_tools_id_fk'),
    ('organization_agents', 'organization_agents_organization_id_fkey', 'organization_agents_organization_id_organizations_id_fk'),
    ('organization_agents', 'organization_agents_recruited_by_fkey', 'organization_agents_recruited_by_users_id_fk'),
    ('organization_agents', 'organization_agents_template_id_fkey', 'organization_agents_template_id_agent_templates_id_fk'),
    ('organization_agents', 'organization_agents_template_version_id_fkey', 'organization_agents_template_version_id_agent_template_versions_id_fk'),
    ('organization_agents', 'organization_agents_workspace_id_fkey', 'organization_agents_workspace_id_workspaces_id_fk'),
    ('organizations', 'organizations_slug_key', 'organizations_slug_unique')
  ) AS renames(table_name, old_name, new_name)
  LOOP
    target := to_regclass(format('public.%I', item.table_name));
    -- Postgres stores identifiers truncated to 63 bytes, so compare against the stored form.
    stored_name := left(item.new_name, 63);
    IF target IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = target AND conname = item.old_name)
      AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = target AND conname = stored_name)
    THEN
      EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', target, item.old_name, stored_name);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
-- 2. Migration 0004 gave vyra_settings demo defaults (a fake "sk-" key, a valid-key flag, and a pre-selected provider)
--    that the application model never had. A column default must not make an unconfigured row look configured.
UPDATE "vyra_settings"
SET "api_key" = '', "key_status" = '', "is_valid_key" = false
WHERE "api_key" LIKE 'sk-' || chr(8226) || '%';
--> statement-breakpoint
ALTER TABLE "vyra_settings" ALTER COLUMN "selected_provider_id" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "vyra_settings" ALTER COLUMN "selected_model_id" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "vyra_settings" ALTER COLUMN "api_key" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "vyra_settings" ALTER COLUMN "key_status" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "vyra_settings" ALTER COLUMN "is_valid_key" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "vyra_settings" ALTER COLUMN "instructions" SET DEFAULT '{"core":"","behaviour":"","knowledge":"","boundaries":"","responseStyle":""}'::jsonb;
