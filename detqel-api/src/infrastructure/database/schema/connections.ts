import { jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { workspaces } from "./auth.js";
import { connectorTypes } from "./connector-types.js";
import { connectorCatalog } from "./connector-catalog.js";
export const connections = pgTable("connections", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 100 }).notNull(),
    connectionType: varchar("connection_type", { length: 50 })
        .notNull()
        .references(() => connectorTypes.code, { onDelete: "restrict", onUpdate: "cascade" }),
    catalogId: uuid("catalog_id").references(() => connectorCatalog.id, { onDelete: "restrict" }),
    dataStream: varchar("data_stream", { length: 255 }),
    configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
    credentialReference: text("credential_reference"),
    status: varchar("status", { length: 50 }).notNull().default("pending"), // connected | disconnected | error | pending
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationMetadata: jsonb("verification_metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
