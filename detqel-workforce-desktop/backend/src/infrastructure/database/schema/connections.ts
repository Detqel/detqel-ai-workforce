import { jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { workspaces } from "./auth.js";
export const connections = pgTable("connections", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 100 }).notNull(),
    connectionType: varchar("connection_type", { length: 50 }).notNull(), // database | api | file | saas | mcp | other
    configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
    credentialReference: text("credential_reference"),
    status: varchar("status", { length: 50 }).notNull().default("pending"), // connected | disconnected | error | pending
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
