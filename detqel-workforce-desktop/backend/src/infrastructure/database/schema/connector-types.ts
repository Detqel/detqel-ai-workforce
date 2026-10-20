import { integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const connectorTypes = pgTable("connector_types", {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ConnectorType = typeof connectorTypes.$inferSelect;
export type NewConnectorType = typeof connectorTypes.$inferInsert;
