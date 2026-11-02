ALTER TABLE "agent_templates" ADD COLUMN IF NOT EXISTS "is_user_created" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "organization_agents" ADD COLUMN IF NOT EXISTS "is_user_created" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_templates_user_created_idx" ON "agent_templates" USING btree ("is_user_created");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_agents_user_created_idx" ON "organization_agents" USING btree ("is_user_created");

