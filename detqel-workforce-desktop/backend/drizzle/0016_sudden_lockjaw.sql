ALTER TABLE "chat_sessions" DROP CONSTRAINT "chat_sessions_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "turn_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "speaker_agent_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "speaker_name" varchar(255);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "speaker_role" varchar(255);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "is_lead" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "input_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "output_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "cached_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "cost_usd" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "summarized_message_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "pending_turn" jsonb;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "input_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "output_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "cached_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "cost_usd" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
-- agent_id previously referenced the internal agents table; sessions now name the recruited agent instead.
UPDATE "chat_sessions" SET "agent_id" = NULL WHERE "agent_id" IS NOT NULL AND "agent_id" NOT IN (SELECT "id" FROM "organization_agents");--> statement-breakpoint
-- Team sessions created before team_id existed are linked to the team whose name they were titled with.
UPDATE "chat_sessions" AS s SET "team_id" = t."id" FROM "agent_teams" AS t WHERE s."scope" = 'teams' AND s."team_id" IS NULL AND t."workspace_id" = s."workspace_id" AND t."name" = s."title";--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_speaker_agent_id_organization_agents_id_fk" FOREIGN KEY ("speaker_agent_id") REFERENCES "public"."organization_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_agent_id_organization_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."organization_agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_team_id_agent_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."agent_teams"("id") ON DELETE set null ON UPDATE no action;