import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth.js";

export const organizations = pgTable("organizations", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentSections = pgTable("agent_sections", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    description: text("description"),
    icon: varchar("icon", { length: 100 }),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentLevels = pgTable("agent_levels", {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    rank: integer("rank").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentStatuses = pgTable("agent_statuses", {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentSkillCategories = pgTable("agent_skill_categories", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentToolCategories = pgTable("agent_tool_categories", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentCapabilityTypes = pgTable("agent_capability_types", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentTriggerTypes = pgTable("agent_trigger_types", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentAssignmentTypes = pgTable("agent_assignment_types", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentSkills = pgTable("agent_skills", {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id").references(() => agentSkillCategories.id, { onDelete: "set null" }),
    name: varchar("name", { length: 100 }).notNull().unique(),
    code: varchar("code", { length: 100 }).notNull().unique(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentTools = pgTable("agent_tools", {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id").references(() => agentToolCategories.id, { onDelete: "set null" }),
    name: varchar("name", { length: 100 }).notNull().unique(),
    code: varchar("code", { length: 100 }).notNull().unique(),
    description: text("description"),
    configurationSchema: jsonb("configuration_schema").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentCapabilities = pgTable("agent_capabilities", {
    id: uuid("id").defaultRandom().primaryKey(),
    capabilityTypeId: uuid("capability_type_id").references(() => agentCapabilityTypes.id, { onDelete: "set null" }),
    name: varchar("name", { length: 100 }).notNull().unique(),
    code: varchar("code", { length: 100 }).notNull().unique(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentTemplates = pgTable("agent_templates", {
    id: uuid("id").defaultRandom().primaryKey(),
    sectionId: uuid("section_id")
        .notNull()
        .references(() => agentSections.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 100 }).notNull(),
    role: varchar("role", { length: 150 }).notNull(),
    slug: varchar("slug", { length: 150 }).notNull().unique(),
    levelId: uuid("level_id")
        .notNull()
        .references(() => agentLevels.id, { onDelete: "restrict" }),
    statusId: uuid("status_id")
        .notNull()
        .references(() => agentStatuses.id, { onDelete: "restrict" }),
    summary: text("summary"),
    description: text("description"),
    avatarUrl: text("avatar_url"),
    isFeatured: boolean("is_featured").notNull().default(false),
    isUserCreated: boolean("is_user_created").notNull().default(false),
    currentVersion: varchar("current_version", { length: 20 }).notNull().default("1.0.0"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
    sectionIdx: index("agent_templates_section_idx").on(table.sectionId, table.isFeatured),
    userCreatedIdx: index("agent_templates_user_created_idx").on(table.isUserCreated),
}));

export const agentTemplateVersions = pgTable("agent_template_versions", {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id")
        .notNull()
        .references(() => agentTemplates.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 20 }).notNull(),
    systemPrompt: text("system_prompt"),
    instructionTemplate: text("instruction_template"),
    configurationSchema: jsonb("configuration_schema").$type<Record<string, unknown>>().notNull().default({}),
    changeLog: text("change_log"),
    isLatest: boolean("is_latest").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
    uqTemplateVersion: unique("uq_agent_template_versions_template_version").on(table.templateId, table.version),
}));

export const agentTemplateSkills = pgTable("agent_template_skills", {
    templateId: uuid("template_id")
        .notNull()
        .references(() => agentTemplates.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
        .notNull()
        .references(() => agentSkills.id, { onDelete: "cascade" }),
}, table => ({
    pk: primaryKey({ columns: [table.templateId, table.skillId] }),
}));

export const agentTemplateTools = pgTable("agent_template_tools", {
    templateId: uuid("template_id")
        .notNull()
        .references(() => agentTemplates.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id")
        .notNull()
        .references(() => agentTools.id, { onDelete: "cascade" }),
}, table => ({
    pk: primaryKey({ columns: [table.templateId, table.toolId] }),
}));

export const agentTemplateCapabilities = pgTable("agent_template_capabilities", {
    templateId: uuid("template_id")
        .notNull()
        .references(() => agentTemplates.id, { onDelete: "cascade" }),
    capabilityId: uuid("capability_id")
        .notNull()
        .references(() => agentCapabilities.id, { onDelete: "cascade" }),
}, table => ({
    pk: primaryKey({ columns: [table.templateId, table.capabilityId] }),
}));

export const organizationAgents = pgTable("organization_agents", {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
        .notNull()
        .references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
        .references(() => workspaces.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
        .references(() => agentTemplates.id, { onDelete: "set null" }),
    templateVersionId: uuid("template_version_id")
        .references(() => agentTemplateVersions.id, { onDelete: "set null" }),
    customName: varchar("custom_name", { length: 100 }),
    customRole: varchar("custom_role", { length: 150 }),
    systemPrompt: text("system_prompt"),
    customInstructions: text("custom_instructions"),
    configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 50 }).notNull().default("idle"),
    isUserCreated: boolean("is_user_created").notNull().default(false),
    recruitedAt: timestamp("recruited_at", { withTimezone: true }).defaultNow().notNull(),
    recruitedBy: uuid("recruited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
    workspaceIdx: index("organization_agents_workspace_idx").on(table.workspaceId, table.status),
    organizationIdx: index("organization_agents_organization_idx").on(table.organizationId, table.status),
    userCreatedIdx: index("organization_agents_user_created_idx").on(table.isUserCreated),
}));

export const organizationAgentTools = pgTable("organization_agent_tools", {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationAgentId: uuid("organization_agent_id")
        .notNull()
        .references(() => organizationAgents.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id")
        .notNull()
        .references(() => agentTools.id, { onDelete: "cascade" }),
    configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
    uqAgentTool: unique("uq_organization_agent_tools_agent_tool").on(table.organizationAgentId, table.toolId),
}));

export const organizationAgentAssignments = pgTable("organization_agent_assignments", {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationAgentId: uuid("organization_agent_id")
        .notNull()
        .references(() => organizationAgents.id, { onDelete: "cascade" }),
    assignmentTypeId: uuid("assignment_type_id")
        .notNull()
        .references(() => agentAssignmentTypes.id, { onDelete: "restrict" }),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    assignmentMetadata: jsonb("assignment_metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentRuns = pgTable("agent_runs", {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationAgentId: uuid("organization_agent_id")
        .notNull()
        .references(() => organizationAgents.id, { onDelete: "cascade" }),
    triggerTypeId: uuid("trigger_type_id")
        .notNull()
        .references(() => agentTriggerTypes.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    inputPayload: jsonb("input_payload").$type<Record<string, unknown>>().notNull().default({}),
    outputPayload: jsonb("output_payload").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
    agentIdx: index("agent_runs_agent_idx").on(table.organizationAgentId, table.createdAt),
}));

export const agentRunSteps = pgTable("agent_run_steps", {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
        .notNull()
        .references(() => agentRuns.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    stepType: varchar("step_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("completed"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
    runIdx: index("agent_run_steps_run_idx").on(table.runId, table.stepNumber),
}));

export const agentExecutionLogs = pgTable("agent_execution_logs", {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
        .notNull()
        .references(() => agentRuns.id, { onDelete: "cascade" }),
    logLevel: varchar("log_level", { length: 20 }).notNull().default("info"),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
    runIdx: index("agent_execution_logs_run_idx").on(table.runId, table.createdAt),
}));

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type AgentSection = typeof agentSections.$inferSelect;
export type NewAgentSection = typeof agentSections.$inferInsert;
export type AgentLevel = typeof agentLevels.$inferSelect;
export type NewAgentLevel = typeof agentLevels.$inferInsert;
export type AgentStatus = typeof agentStatuses.$inferSelect;
export type NewAgentStatus = typeof agentStatuses.$inferInsert;
export type AgentTemplate = typeof agentTemplates.$inferSelect;
export type NewAgentTemplate = typeof agentTemplates.$inferInsert;
export type AgentTemplateVersion = typeof agentTemplateVersions.$inferSelect;
export type NewAgentTemplateVersion = typeof agentTemplateVersions.$inferInsert;
export type OrganizationAgent = typeof organizationAgents.$inferSelect;
export type NewOrganizationAgent = typeof organizationAgents.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;

