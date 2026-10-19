import { jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth.js";
import { agents } from "./workforce.js";
export const missions = pgTable("missions", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    userRequest: text("user_request").notNull(),
    intent: jsonb("intent").$type<Record<string, unknown>>().notNull().default({}),
    plan: jsonb("plan").$type<Record<string, unknown>>(),
    status: varchar("status", { length: 50 }).notNull().default("queued"), // queued | planning | investigating | collaborating | reasoning | review | executing | verifying | completed | failed | cancelled | blocked
    priority: varchar("priority", { length: 50 }).notNull().default("medium"), // low | medium | high | critical
    initiatedBy: uuid("initiated_by").references(() => users.id, { onDelete: "set null" }),
    parentMissionId: uuid("parent_mission_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const missionAgents = pgTable("mission_agents", {
    id: uuid("id").defaultRandom().primaryKey(),
    missionId: uuid("mission_id")
        .notNull()
        .references(() => missions.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
        .notNull()
        .references(() => agents.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("primary"), // primary | collaborator | reviewer | executor
    status: varchar("status", { length: 50 }).notNull().default("assigned"), // assigned | working | completed | failed
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const missionEvents = pgTable("mission_events", {
    id: uuid("id").defaultRandom().primaryKey(),
    missionId: uuid("mission_id")
        .notNull()
        .references(() => missions.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 50 }).notNull(), // intent | plan | research | analysis | agent_action | finding | recommendation | approval | execution | verification | error
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const missionSources = pgTable("mission_sources", {
    id: uuid("id").defaultRandom().primaryKey(),
    missionId: uuid("mission_id")
        .notNull()
        .references(() => missions.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", { length: 50 }).notNull(), // internal | web | connection | knowledge | agent
    sourceReference: text("source_reference").notNull(),
    title: varchar("title", { length: 255 }),
    url: text("url"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const approvals = pgTable("approvals", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id").references(() => missions.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    requestedAction: jsonb("requested_action").$type<Record<string, unknown>>().notNull(),
    riskLevel: varchar("risk_level", { length: 50 }).notNull().default("medium"), // low | medium | high | critical
    status: varchar("status", { length: 50 }).notNull().default("pending"), // pending | approved | rejected | expired
    requestedBy: uuid("requested_by").references(() => agents.id, { onDelete: "set null" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const executions = pgTable("executions", {
    id: uuid("id").defaultRandom().primaryKey(),
    missionId: uuid("mission_id")
        .notNull()
        .references(() => missions.id, { onDelete: "cascade" }),
    approvalId: uuid("approval_id").references(() => approvals.id, { onDelete: "set null" }),
    actionType: varchar("action_type", { length: 100 }).notNull(),
    actionPayload: jsonb("action_payload").$type<Record<string, unknown>>().notNull(),
    status: varchar("status", { length: 50 }).notNull().default("queued"), // queued | running | completed | failed | rolled_back
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type Mission = typeof missions.$inferSelect;
export type NewMission = typeof missions.$inferInsert;
export type MissionAgent = typeof missionAgents.$inferSelect;
export type NewMissionAgent = typeof missionAgents.$inferInsert;
export type MissionEvent = typeof missionEvents.$inferSelect;
export type NewMissionEvent = typeof missionEvents.$inferInsert;
export type MissionSource = typeof missionSources.$inferSelect;
export type NewMissionSource = typeof missionSources.$inferInsert;
export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
export type Execution = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
