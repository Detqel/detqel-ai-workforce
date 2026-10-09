import { jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth.js";
import { connections } from "./connections.js";
export const agents = pgTable("agents", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }), // null if platform wide
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").notNull(),
    purpose: text("purpose").notNull(),
    instructions: text("instructions").notNull(),
    agentType: varchar("agent_type", { length: 50 }).notNull(), // platform | custom | marketplace
    scope: jsonb("scope").$type<Record<string, unknown>>().notNull().default({}),
    capabilities: jsonb("capabilities").$type<unknown[]>().notNull().default([]),
    approvalPolicy: jsonb("approval_policy").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 50 }).notNull().default("active"), // draft | active | paused | archived
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const agentConnections = pgTable("agent_connections", {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
        .notNull()
        .references(() => agents.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
        .notNull()
        .references(() => connections.id, { onDelete: "cascade" }),
    permissions: jsonb("permissions").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const agentMemory = pgTable("agent_memory", {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id")
        .notNull()
        .references(() => agents.id, { onDelete: "cascade" }),
    memoryType: varchar("memory_type", { length: 50 }).notNull(), // fact | context | lesson | preference | interaction
    content: text("content").notNull(),
    sourceReference: text("source_reference"),
    importance: varchar("importance", { length: 50 }).notNull().default("medium"), // low | medium | high
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type AgentConnection = typeof agentConnections.$inferSelect;
export type NewAgentConnection = typeof agentConnections.$inferInsert;
export type AgentMemory = typeof agentMemory.$inferSelect;
export type NewAgentMemory = typeof agentMemory.$inferInsert;
