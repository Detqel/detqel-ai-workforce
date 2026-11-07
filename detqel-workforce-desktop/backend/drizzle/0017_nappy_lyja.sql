ALTER TABLE "vyra_settings" ADD COLUMN "tavily_api_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vyra_settings" ADD COLUMN "tavily_key_status" varchar(100) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "vyra_settings" ADD COLUMN "is_valid_tavily_key" boolean DEFAULT false NOT NULL;