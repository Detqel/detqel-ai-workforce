import { jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth.js";
import { missions } from "./missions.js";
export const automations = pgTable("automations", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").notNull(),
    trigger: jsonb("trigger").$type<Record<string, unknown>>().notNull().default({}),
    conditions: jsonb("conditions").$type<unknown[]>().notNull().default([]),
    actions: jsonb("actions").$type<unknown[]>().notNull().default([]),
    agentStrategy: jsonb("agent_strategy").$type<Record<string, unknown>>(),
    approvalPolicy: jsonb("approval_policy").$type<Record<string, unknown>>().notNull().default({}),
    faultTolerance: jsonb("fault_tolerance").$type<Record<string, unknown>>(),
    status: varchar("status", { length: 50 }).notNull().default("draft"), // draft | active | paused | disabled
    createdBy: uuid("created_by")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const automationRuns = pgTable("automation_runs", {
    id: uuid("id").defaultRandom().primaryKey(),
    automationId: uuid("automation_id")
        .notNull()
        .references(() => automations.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id").references(() => missions.id, { onDelete: "set null" }),
    status: varchar("status", { length: 50 }).notNull().default("running"), // running | waiting_approval | completed | failed | cancelled
    triggerData: jsonb("trigger_data").$type<Record<string, unknown>>(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
});
export const scheduledTasks = pgTable("scheduled_tasks", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    taskType: varchar("task_type", { length: 50 }).notNull(), // state_refresh | mission | prediction | automation | agent_task | other
    targetId: uuid("target_id"),
    schedule: varchar("schedule", { length: 100 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("active"), // active | paused | completed | failed
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type NewAutomationRun = typeof automationRuns.$inferInsert;
export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type NewScheduledTask = typeof scheduledTasks.$inferInsert;
