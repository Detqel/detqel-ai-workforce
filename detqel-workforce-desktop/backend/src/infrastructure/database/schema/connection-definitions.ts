import { boolean, index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import type { ConfigurationSchema } from "../../../shared/types/connection-adapter.js";
import { workspaces } from "./auth.js";

/** Immutable, workspace-owned connection forms discovered from provider documentation. */
export const connectionDefinitions = pgTable("connection_definitions", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 100 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    adapterKey: varchar("adapter_key", { length: 100 }).notNull(),
    configSchema: jsonb("config_schema").$type<ConfigurationSchema>().notNull(),
    isEnabled: boolean("is_enabled").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({ workspaceIndex: index("connection_definitions_workspace_idx").on(table.workspaceId) }));

export type ConnectionDefinition = typeof connectionDefinitions.$inferSelect;
export type NewConnectionDefinition = typeof connectionDefinitions.$inferInsert;
