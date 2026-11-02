CREATE TABLE IF NOT EXISTS "agent_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"focus" varchar(150) DEFAULT 'Cross-Functional' NOT NULL,
	"icon" varchar(100) DEFAULT 'Users' NOT NULL,
	"accent_color" varchar(50) DEFAULT 'purple' NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"mission_objective" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"member_role" varchar(100) DEFAULT 'Specialist' NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"assigned_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_teams" ADD CONSTRAINT "agent_teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_teams" ADD CONSTRAINT "agent_teams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_team_members" ADD CONSTRAINT "agent_team_members_team_id_agent_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."agent_teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_team_members" ADD CONSTRAINT "agent_team_members_agent_id_organization_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."organization_agents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_team_members" ADD CONSTRAINT "agent_team_members_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_teams_workspace_idx" ON "agent_teams" USING btree ("workspace_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_team_members_team_idx" ON "agent_team_members" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_team_members_agent_idx" ON "agent_team_members" USING btree ("agent_id");
