import { boolean, check, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { ClarificationQuestion } from "../../../shared/agents/graphs/clarification.js";
import { users, workspaces } from "./auth.js";
import { connections } from "./connections.js";
import { organizationAgents } from "./recruit.js";
import { agentTeams } from "./teams.js";
import type { DiscussionActivityStep } from "../../../shared/types/discussion-activity.js";
import type { ConversationContext } from "../../../shared/agents/context/conversation-context.js";
import type { TaskExecutionPlan, RepositorySnapshot } from "../../../shared/agents/graphs/task-plan.js";
import type { TurnCheckpoint } from "../../../shared/agents/graphs/turn-checkpoint.js";

/** An agent still due to speak in the current turn: the lead or solo agent, a delegate, or a teammate the user named. */
export interface PendingResponder {
    readonly agentId: string;
    /** What the lead asked this teammate to contribute; null when the user addressed them directly. */
    readonly assignment: string | null;
    /** Set for the agent answering first: the team lead (who may delegate) or the agent of a one-to-one discussion. */
    readonly first?: boolean;
    /** Set for the lead's closing reply, which brings its teammates' contributions together. */
    readonly wrapUp?: boolean;
}

/** The queue of teammates who still have to reply in the current turn, in speaking order, with the turn's settings. */
export interface PendingTurn {
    readonly checkpoint?: TurnCheckpoint;
    /** A format-only request: a saved reply (sourceMessageId) or an attached document (attachment), exported as written. */
    readonly delivery?: { readonly sourceMessageId?: string; readonly attachment?: string; readonly format: "md" | "docx" | "pdf"; readonly font?: string };
    readonly taskPlan?: TaskExecutionPlan | null;
    readonly repositorySnapshots?: ReadonlyArray<RepositorySnapshot>;
    readonly turnId: string;
    readonly queue: ReadonlyArray<PendingResponder>;
    /** The lead who handed out assignments, named to the teammates it delegated to. */
    readonly leadName: string;
    readonly responseMode: string;
    readonly capabilityMode: string;
    readonly webEnabled: boolean;
    /** A document the user asked for in this turn that is not written yet, and the agent who will write it. */
    readonly document?: { readonly title: string; readonly ownerAgentId: string; readonly imageCount?: number; readonly requiredSections?: ReadonlyArray<string> } | null;
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
    memoryRevision: integer("memory_revision").notNull().default(0),
    contextState: jsonb("context_state").$type<ConversationContext | null>(),
    // A request returned to the composer by restore, retained until a new user message is accepted.
    composerDraft: jsonb("composer_draft").$type<{ readonly messageId: string; readonly content: string; readonly answerToQuestionId?: string } | null>(),
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
    // The speaker's part in the turn (solo, lead, addressed, delegate, wrapUp), so a handoff can be shown apart.
    turnRole: varchar("turn_role", { length: 20 }),
    // Response mode (brief | detailed) and capability (fast | expert) recorded for assistant turns.
    responseMode: varchar("response_mode", { length: 20 }),
    capabilityMode: varchar("capability_mode", { length: 20 }),
    tokensUsed: integer("tokens_used").notNull().default(0),
    // The steps the agent worked through for this reply, shown as activity traces.
    activity: jsonb("activity").$type<DiscussionActivityStep[]>().notNull().default([]),
    // Documents the user attached to this message (stored as session knowledge files).
    attachments: jsonb("attachments").$type<Array<{ name: string; size: number }>>().notNull().default([]),
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
/** A structured request for user input. Deleting an answer during restore makes the question pending again. */
export const chatQuestions = pgTable("chat_questions", {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
    questions: jsonb("questions").$type<ClarificationQuestion[]>().notNull(),
    requestContent: text("request_content").notNull(),
    answerMessageId: uuid("answer_message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
    uniqueIndex("chat_questions_message_idx").on(table.messageId),
    uniqueIndex("chat_questions_answer_idx").on(table.answerMessageId),
    index("chat_questions_pending_idx").on(table.sessionId, table.createdAt).where(sql`${table.answerMessageId} IS NULL`),
    check("chat_questions_questions_check", sql`jsonb_typeof(${table.questions}) = 'array' AND jsonb_array_length(${table.questions}) BETWEEN 1 AND 3`),
    check("chat_questions_request_check", sql`length(${table.requestContent}) BETWEEN 1 AND 32000`),
]);
export type ChatQuestion = typeof chatQuestions.$inferSelect;
export type ChatMessageSource = typeof chatMessageSources.$inferSelect;
export type NewChatMessageSource = typeof chatMessageSources.$inferInsert;
export type ChatSessionConnection = typeof chatSessionConnections.$inferSelect;
export type NewChatSessionConnection = typeof chatSessionConnections.$inferInsert;
