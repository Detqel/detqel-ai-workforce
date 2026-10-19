import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    username: varchar("username", { length: 100 }).unique(),
    name: varchar("name", { length: 255 }).notNull(),
    passwordHash: text("password_hash"),
    avatarUrl: text("avatar_url"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const workspaces = pgTable("workspaces", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    description: text("description"),
    industry: varchar("industry", { length: 100 }),
    timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
    logoUrl: text("logo_url"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_workspaces_name_industry").on(table.createdBy, sql `lower(trim(${table.name}))`, sql `lower(trim(coalesce(${table.industry}, '')))`)]);
export const workspaceMembers = pgTable("workspace_members", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 50 }).notNull().default("employee"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_workspace_members_workspace_user").on(table.workspaceId, table.userId)]);
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMember = typeof workspaceMembers.$inferInsert;
