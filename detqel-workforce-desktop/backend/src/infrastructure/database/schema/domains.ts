import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
export const industryDomains = pgTable("industry_domains", {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 150 }).notNull().unique(),
    description: text("description"),
    isCustom: boolean("is_custom").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_industry_domains_normalized_name").on(sql `lower(trim(${table.name}))`)]);
export type IndustryDomain = typeof industryDomains.$inferSelect;
export type NewIndustryDomain = typeof industryDomains.$inferInsert;
