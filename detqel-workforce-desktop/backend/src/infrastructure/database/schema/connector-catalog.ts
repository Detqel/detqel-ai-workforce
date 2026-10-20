import { boolean, index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import type { ConfigurationSchema } from "../../../shared/types/connector-catalog.js";
import { connectorTypes } from "./connector-types.js";

export const connectorCatalog = pgTable("connector_catalog", {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 100 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    connectorType: varchar("connector_type", { length: 50 })
        .notNull()
        .references(() => connectorTypes.code, { onDelete: "restrict", onUpdate: "cascade" }),
    category: varchar("category", { length: 100 }).notNull(),
    description: text("description"),
    adapterKey: varchar("adapter_key", { length: 100 }).notNull(),
    configSchema: jsonb("config_schema").$type<ConfigurationSchema>().notNull(),
    isEnabled: boolean("is_enabled").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
    typeCategoryEnabledIndex: index("connector_catalog_type_category_enabled_idx")
        .on(table.connectorType, table.category, table.isEnabled),
}));

export type ConnectorCatalog = typeof connectorCatalog.$inferSelect;
export type NewConnectorCatalog = typeof connectorCatalog.$inferInsert;
