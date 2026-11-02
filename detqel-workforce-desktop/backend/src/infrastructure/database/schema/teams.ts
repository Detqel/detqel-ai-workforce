import { boolean, index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth.js";
import { organizationAgents } from "./recruit.js";

export const agentTeams = pgTable("agent_teams", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    focus: varchar("focus", { length: 150 }).notNull().default("Cross-Functional"),
    icon: varchar("icon", { length: 100 }).notNull().default("Users"),
    accentColor: varchar("accent_color", { length: 50 }).notNull().default("purple"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    missionObjective: text("mission_objective"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
    workspaceIdx: index("agent_teams_workspace_idx").on(table.workspaceId, table.status),
}));

export const agentTeamMembers = pgTable("agent_team_members", {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
        .notNull()
        .references(() => agentTeams.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
        .notNull()
        .references(() => organizationAgents.id, { onDelete: "cascade" }),
    memberRole: varchar("member_role", { length: 100 }).notNull().default("Specialist"),
    isLead: boolean("is_lead").notNull().default(false),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, table => ({
    teamIdx: index("agent_team_members_team_idx").on(table.teamId),
    agentIdx: index("agent_team_members_agent_idx").on(table.agentId),
}));

export type AgentTeam = typeof agentTeams.$inferSelect;
export type NewAgentTeam = typeof agentTeams.$inferInsert;
export type AgentTeamMember = typeof agentTeamMembers.$inferSelect;
export type NewAgentTeamMember = typeof agentTeamMembers.$inferInsert;

