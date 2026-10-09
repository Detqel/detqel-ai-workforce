import { pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
export const seedHistory = pgTable("seed_history", {
    name: varchar("name", { length: 150 }).primaryKey(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
});
