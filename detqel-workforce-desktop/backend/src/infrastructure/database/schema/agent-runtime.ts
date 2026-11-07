import { pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { workspaces } from "./auth.js";

/**
 * One LiteLLM virtual key per (workspace, process). The real provider key lives only on the gateway; this table
 * holds the minted virtual key encrypted at rest plus the gateway references needed to rotate or revoke it.
 * Inference for a process uses its virtual key, never the gateway master key or any provider key.
 */
export const litellmVirtualKeys = pgTable("litellm_virtual_keys", {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    // The process this key serves, for example "orchestration" or "rag" (see AGENT_RUNTIME_PROCESSES).
    processId: varchar("process_id", { length: 50 }).notNull(),
    // Gateway identifier used to revoke or rotate the key.
    gatewayKeyId: varchar("gateway_key_id", { length: 255 }).notNull(),
    // Gateway model alias this key is scoped to.
    modelAlias: varchar("model_alias", { length: 255 }).notNull(),
    // The minted virtual key value, encrypted with SecretCipher and bound to this row's context.
    encryptedKey: varchar("encrypted_key", { length: 1024 }).notNull(),
    // Hash of the provider, model, key and embedding settings this key was provisioned for. Never the key itself.
    configFingerprint: varchar("config_fingerprint", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [uniqueIndex("uq_litellm_virtual_keys_workspace_process").on(table.workspaceId, table.processId)]);

export type LitellmVirtualKey = typeof litellmVirtualKeys.$inferSelect;
export type NewLitellmVirtualKey = typeof litellmVirtualKeys.$inferInsert;
