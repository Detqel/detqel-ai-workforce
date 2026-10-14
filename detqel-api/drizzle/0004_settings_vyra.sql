CREATE TABLE IF NOT EXISTS "ai_providers" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"icon_key" varchar(50) NOT NULL,
	"description" text,
	"badge" varchar(50),
	"models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"api_key" text,
	"status" varchar(50) DEFAULT 'disconnected' NOT NULL,
	"is_connected" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vyra_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"agent_name" varchar(100) DEFAULT 'VYRA' NOT NULL,
	"slogan" varchar(255) DEFAULT 'CONFIGURE • ALIGN • EMPOWER' NOT NULL,
	"quote" text DEFAULT 'Your intelligent AI agent for deeper insights, smarter decisions, and seamless execution.' NOT NULL,
	"selected_provider_id" varchar(50) DEFAULT 'openai' NOT NULL,
	"selected_model_id" varchar(100) DEFAULT 'gpt-4o' NOT NULL,
	"api_key" text DEFAULT 'sk-••••••••••••••••••••••••••••',
	"key_status" varchar(100) DEFAULT 'Valid key · Connected successfully' NOT NULL,
	"is_valid_key" boolean DEFAULT true NOT NULL,
	"instructions" jsonb DEFAULT '{"core": "You are VYRA, an intelligent AI agent.\nUnderstand the user''s intent, ask clarifying questions when needed,\nuse available context and tools, and provide accurate, actionable and well-structured responses.", "behaviour": "Maintain a professional, proactive, and concise tone. Prioritize user privacy, structured formatting, and step-by-step verification before executing critical actions.", "knowledge": "Possess deep enterprise workflow context, domain schemas, API connectors, and organizational guidelines.", "boundaries": "Do not make irreversible external modifications without user approval. Do not execute unverified SQL deletions or expose sensitive credentials.", "responseStyle": "Crisp executive summaries followed by clear bulleted actionable items, accompanied by syntax-highlighted code blocks where applicable."}'::jsonb NOT NULL,
	"templates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sample_prompts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"traits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preview_mode" varchar(50) DEFAULT 'chat' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'vyra_settings'::regclass AND conname = 'vyra_settings_workspace_id_workspaces_id_fk') THEN
    ALTER TABLE "vyra_settings" ADD CONSTRAINT "vyra_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
