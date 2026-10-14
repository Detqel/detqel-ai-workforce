import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { workspaces } from "./auth.js";

export interface AIProviderModel {
  id: string;
  name: string;
  description: string;
  isDefault?: boolean;
}

export const aiProviders = pgTable("ai_providers", {
  id: varchar("id", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  iconKey: varchar("icon_key", { length: 50 }).notNull(),
  description: text("description"),
  badge: varchar("badge", { length: 50 }),
  models: jsonb("models").$type<AIProviderModel[]>().notNull().default([]),
  apiKey: text("api_key"),
  status: varchar("status", { length: 50 }).notNull().default("disconnected"),
  isConnected: boolean("is_connected").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export interface VyraInstructions {
  core: string;
  behaviour: string;
  knowledge: string;
  boundaries: string;
  responseStyle: string;
}

export interface VyraTemplate {
  id: string;
  name: string;
  description?: string;
  instructions: VyraInstructions;
}

export interface SamplePrompt {
  id: string;
  title: string;
  prompt: string;
}

export interface AgentTrait {
  title: string;
  description: string;
  icon: string;
}

export const vyraSettings = pgTable("vyra_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  agentName: varchar("agent_name", { length: 100 }).notNull().default("VYRA"),
  slogan: varchar("slogan", { length: 255 }).notNull().default("CONFIGURE • ALIGN • EMPOWER"),
  quote: text("quote").notNull().default("Your intelligent AI agent for deeper insights, smarter decisions, and seamless execution."),
  selectedProviderId: varchar("selected_provider_id", { length: 50 }).notNull().default(""),
  selectedModelId: varchar("selected_model_id", { length: 100 }).notNull().default(""),
  apiKey: text("api_key").default(""),
  keyStatus: varchar("key_status", { length: 100 }).notNull().default(""),
  isValidKey: boolean("is_valid_key").notNull().default(false),
  instructions: jsonb("instructions").$type<VyraInstructions>().notNull().default({
    core: "",
    behaviour: "",
    knowledge: "",
    boundaries: "",
    responseStyle: "",
  }),
  templates: jsonb("templates").$type<VyraTemplate[]>().notNull().default([]),
  samplePrompts: jsonb("sample_prompts").$type<SamplePrompt[]>().notNull().default([]),
  traits: jsonb("traits").$type<AgentTrait[]>().notNull().default([]),
  previewMode: varchar("preview_mode", { length: 50 }).notNull().default("chat"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AIProvider = typeof aiProviders.$inferSelect;
export type NewAIProvider = typeof aiProviders.$inferInsert;
export type VyraSettings = typeof vyraSettings.$inferSelect;
export type NewVyraSettings = typeof vyraSettings.$inferInsert;
