import { doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { workspaces } from "./auth.js";
export const businessProfile = pgTable("business_profile", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    businessName: varchar("business_name", { length: 255 }).notNull(),
    businessType: varchar("business_type", { length: 100 }),
    industry: varchar("industry", { length: 100 }),
    description: text("description"),
    productsServices: jsonb("products_services").$type<unknown[]>().default([]).notNull(),
    customers: jsonb("customers").$type<unknown[]>().default([]).notNull(),
    departments: jsonb("departments").$type<unknown[]>().default([]).notNull(),
    locations: jsonb("locations").$type<unknown[]>().default([]).notNull(),
    businessModel: jsonb("business_model").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_business_profile_workspace").on(table.workspaceId)]);
export const businessKnowledge = pgTable("business_knowledge", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    sourceType: varchar("source_type", { length: 50 }).notNull(), // document | manual | url | import | other
    sourceReference: text("source_reference"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const businessGoals = pgTable("business_goals", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    goalType: varchar("goal_type", { length: 50 }).notNull(), // revenue | growth | cost | efficiency | customer | operations | other
    targetValue: doublePrecision("target_value"),
    currentValue: doublePrecision("current_value"),
    targetDate: timestamp("target_date", { withTimezone: true }),
    priority: varchar("priority", { length: 50 }).notNull().default("medium"), // low | medium | high | critical
    status: varchar("status", { length: 50 }).notNull().default("active"), // active | completed | paused | cancelled
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const businessRules = pgTable("business_rules", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").notNull(),
    ruleType: varchar("rule_type", { length: 50 }).notNull(), // policy | constraint | approval | operational | financial | custom
    ruleDefinition: jsonb("rule_definition").$type<Record<string, unknown>>().notNull(),
    status: varchar("status", { length: 50 }).notNull().default("active"), // active | inactive
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const businessState = pgTable("business_state", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    stateType: varchar("state_type", { length: 50 }).notNull(), // financial | sales | customer | operations | marketing | inventory | workforce | overall | custom
    stateData: jsonb("state_data").$type<Record<string, unknown>>().notNull(),
    confidence: doublePrecision("confidence"),
    sourceCount: integer("source_count").notNull().default(0),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
});
export const businessMemory = pgTable("business_memory", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    memoryType: varchar("memory_type", { length: 50 }).notNull(), // decision | event | finding | preference | lesson | outcome | fact
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    sourceMissionId: uuid("source_mission_id"),
    importance: varchar("importance", { length: 50 }).notNull().default("medium"), // low | medium | high | critical
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type BusinessProfile = typeof businessProfile.$inferSelect;
export type NewBusinessProfile = typeof businessProfile.$inferInsert;
export type BusinessKnowledge = typeof businessKnowledge.$inferSelect;
export type NewBusinessKnowledge = typeof businessKnowledge.$inferInsert;
export type BusinessGoal = typeof businessGoals.$inferSelect;
export type NewBusinessGoal = typeof businessGoals.$inferInsert;
export type BusinessRule = typeof businessRules.$inferSelect;
export type NewBusinessRule = typeof businessRules.$inferInsert;
export type BusinessState = typeof businessState.$inferSelect;
export type NewBusinessState = typeof businessState.$inferInsert;
export type BusinessMemory = typeof businessMemory.$inferSelect;
export type NewBusinessMemory = typeof businessMemory.$inferInsert;
