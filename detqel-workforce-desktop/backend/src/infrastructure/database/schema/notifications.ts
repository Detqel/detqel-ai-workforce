import { boolean, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth.js";
export const userNotifications = pgTable("user_notifications", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
        .references(() => workspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    type: varchar("type", { length: 50 }).notNull().default("info"), // info | success | warning | alert
    isRead: boolean("is_read").notNull().default(false),
    link: varchar("link", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
    index("idx_user_notifications_user_created").on(table.userId, table.createdAt),
    index("idx_user_notifications_user_unread").on(table.userId, table.isRead),
]);
export type UserNotification = typeof userNotifications.$inferSelect;
export type NewUserNotification = typeof userNotifications.$inferInsert;
