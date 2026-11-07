import { boolean, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users, workspaces } from "./auth.js";
import { connections } from "./connections.js";
import { organizationAgents } from "./recruit.js";
import { agentTeams } from "./teams.js";

/** A teammate still due to speak in the current team turn, after the lead delegated to them or the user named them. */
export interface PendingResponder {
    readonly agentId: string;
    /** What the lead asked this teammate to contribute; null when the user addressed them directly. */
    readonly assignment: string | null;
}

/** The queue of teammates who still have to reply in the current turn, in speaking order, with the turn's settings. */
export interface PendingTurn {
    readonly turnId: string;
    readonly queue: ReadonlyArray<PendingResponder>;
    /** The lead who handed out assignments, named to the teammates it delegated to. */
    readonly leadName: string;
    readonly responseMode: string;
    readonly capabilityMode: string;
    readonly webEnabled: boolean;
}

/**
 * A chat session is one discussion thread with a recruited agent or a team. A team session is a discussion table:
 * the lead answers first and hands work to teammates, or the user addresses a teammate by name. Connectors are
 * attached per session, and the session's knowledge base and vector collection are keyed by its id. The session
 * keeps a rolling summary of older messages as memory, and running token and cost totals from the gateway.
 */
export const chatSessions = pgTable("chat_sessions", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    // conversations | teams — selects the file-server scope for this session's artifacts.
    scope: varchar("scope", { length: 50 }).notNull().default("conversations"),
    title: varchar("title", { length: 255 }).notNull().default("New discussion"),
    // The recruited agent this discussion is with, for a one-to-one discussion.
    agentId: uuid("agent_id").references(() => organizationAgents.id, { onDelete: "set null" }),
    // The team this discussion is with, for a team discussion.
    teamId: uuid("team_id").references(() => agentTeams.id, { onDelete: "set null" }),
    // Memory: a summary of messages older than the recent window, and how many messages it covers.
    summary: text("summary"),
    summarizedMessageCount: integer("summarized_message_count").notNull().default(0),
    // Teammates still due to reply in the current turn.
    pendingTurn: jsonb("pending_turn").$type<PendingTurn | null>(),
    // Running gateway usage for every model call made in this session, including memory summaries.
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatMessages = pgTable("chat_messages", {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(), // user | assistant
    content: text("content").notNull(),
    // Groups a user's message with every agent reply it produced.
    turnId: uuid("turn_id"),
    // Which agent spoke, for assistant messages. Name and role are kept so history survives agent removal.
    speakerAgentId: uuid("speaker_agent_id").references(() => organizationAgents.id, { onDelete: "set null" }),
    speakerName: varchar("speaker_name", { length: 255 }),
    speakerRole: varchar("speaker_role", { length: 255 }),
    isLead: boolean("is_lead").notNull().default(false),
    // Response mode (brief | detailed) and capability (fast | expert) recorded for assistant turns.
    responseMode: varchar("response_mode", { length: 20 }),
    capabilityMode: varchar("capability_mode", { length: 20 }),
    tokensUsed: integer("tokens_used").notNull().default(0),
    // Gateway usage for the model calls that produced this message.
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatMessageSources = pgTable("chat_message_sources", {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", { length: 50 }).notNull(), // knowledge | web | connection
    title: varchar("title", { length: 255 }),
    reference: text("reference").notNull(),
    url: text("url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatSessionConnections = pgTable("chat_session_connections", {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => connections.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_chat_session_connections").on(table.sessionId, table.connectionId)]);

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type ChatMessageSource = typeof chatMessageSources.$inferSelect;
export type NewChatMessageSource = typeof chatMessageSources.$inferInsert;
export type ChatSessionConnection = typeof chatSessionConnections.$inferSelect;
export type NewChatSessionConnection = typeof chatSessionConnections.$inferInsert;
