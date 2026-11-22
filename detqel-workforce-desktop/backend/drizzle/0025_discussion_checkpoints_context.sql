ALTER TABLE "chat_sessions" ADD COLUMN "memory_revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "context_state" jsonb;
