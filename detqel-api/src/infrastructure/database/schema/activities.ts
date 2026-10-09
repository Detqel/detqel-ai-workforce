import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth.js";
export const userActivities = pgTable("user_activities", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
        .references(() => users.id, { onDelete: "set null" }),
    activityType: varchar("activity_type", { length: 50 }).notNull(), // 'investigations' | 'predictions' | 'simulations' | 'automations' | 'decisions'
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    entityId: uuid("entity_id"),
    entityType: varchar("entity_type", { length: 50 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_user_activities_ws_created").on(table.workspaceId, table.createdAt),
    index("idx_user_activities_user_created").on(table.userId, table.createdAt),
    index("idx_user_activities_ws_type_created").on(table.workspaceId, table.activityType, table.createdAt),
]);
export type UserActivity = typeof userActivities.$inferSelect;
export type NewUserActivity = typeof userActivities.$inferInsert;
