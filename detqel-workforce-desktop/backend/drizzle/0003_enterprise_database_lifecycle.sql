CREATE TABLE IF NOT EXISTS "user_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"type" varchar(50) DEFAULT 'info' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"link" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Earlier startup code created this table outside the migration journal.
CREATE TABLE IF NOT EXISTS "industry_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"description" text,
	"is_custom" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "industry_domains_name_unique" UNIQUE("name")
);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'industry_domains'::regclass AND conname = 'industry_domains_name_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'industry_domains'::regclass AND conname = 'industry_domains_name_unique') THEN
    ALTER TABLE "industry_domains" RENAME CONSTRAINT "industry_domains_name_key" TO "industry_domains_name_unique";
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "seed_history" (
	"name" varchar(150) PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'user_notifications'::regclass AND conname = 'user_notifications_user_id_users_id_fk') THEN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'user_notifications'::regclass AND conname = 'user_notifications_user_id_fkey') THEN
      ALTER TABLE "user_notifications" RENAME CONSTRAINT "user_notifications_user_id_fkey" TO "user_notifications_user_id_users_id_fk";
    ELSE
      ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'user_notifications'::regclass AND conname = 'user_notifications_workspace_id_workspaces_id_fk') THEN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'user_notifications'::regclass AND conname = 'user_notifications_workspace_id_fkey') THEN
      ALTER TABLE "user_notifications" RENAME CONSTRAINT "user_notifications_workspace_id_fkey" TO "user_notifications_workspace_id_workspaces_id_fk";
    ELSE
      ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
    END IF;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_notifications_user_created" ON "user_notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_notifications_user_unread" ON "user_notifications" USING btree ("user_id","is_read");--> statement-breakpoint
-- Preserve complete copies of redundant legacy seed rows before consolidation.
-- This table belongs to migration infrastructure, rather than the application schema.
CREATE TABLE IF NOT EXISTS "drizzle"."__reconciled_rows" (
  migration_tag text NOT NULL,
  table_name text NOT NULL,
  removed_id uuid NOT NULL,
  retained_id uuid NOT NULL,
  record jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (migration_tag, table_name, removed_id)
);
--> statement-breakpoint
LOCK TABLE "workspace_members", "business_profile" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
WITH ranked AS (
  SELECT id, to_jsonb(m) AS record,
    first_value(id) OVER duplicates AS retained_id,
    row_number() OVER duplicates AS occurrence
  FROM workspace_members m
  WINDOW duplicates AS (
    PARTITION BY workspace_id, user_id, (to_jsonb(m) - ARRAY['id','created_at','joined_at'])
    ORDER BY joined_at, created_at, id
  )
)
INSERT INTO "drizzle"."__reconciled_rows" (migration_tag, table_name, removed_id, retained_id, record)
SELECT '0003_enterprise_database_lifecycle', 'workspace_members', id, retained_id, record FROM ranked WHERE occurrence > 1;
--> statement-breakpoint
WITH ranked AS (
  SELECT id, to_jsonb(p) AS record,
    first_value(id) OVER duplicates AS retained_id,
    row_number() OVER duplicates AS occurrence
  FROM business_profile p
  WINDOW duplicates AS (
    PARTITION BY workspace_id, (to_jsonb(p) - ARRAY['id','created_at','updated_at'])
    ORDER BY created_at, id
  )
)
INSERT INTO "drizzle"."__reconciled_rows" (migration_tag, table_name, removed_id, retained_id, record)
SELECT '0003_enterprise_database_lifecycle', 'business_profile', id, retained_id, record FROM ranked WHERE occurrence > 1;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c JOIN "drizzle"."__reconciled_rows" r
      ON c.confrelid = to_regclass('public.' || r.table_name)
    WHERE c.contype = 'f' AND r.migration_tag = '0003_enterprise_database_lifecycle'
  ) THEN
    RAISE EXCEPTION 'Legacy duplicates have referencing tables; reconcile them explicitly before migrating';
  END IF;
END $$;
--> statement-breakpoint
DELETE FROM workspace_members m USING "drizzle"."__reconciled_rows" r
WHERE r.migration_tag = '0003_enterprise_database_lifecycle' AND r.table_name = 'workspace_members'
  AND m.id = r.removed_id AND to_jsonb(m) = r.record;
--> statement-breakpoint
DELETE FROM business_profile p USING "drizzle"."__reconciled_rows" r
WHERE r.migration_tag = '0003_enterprise_database_lifecycle' AND r.table_name = 'business_profile'
  AND p.id = r.removed_id AND to_jsonb(p) = r.record;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_industry_domains_normalized_name" ON "industry_domains" USING btree (lower(trim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workspace_members_workspace_user" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workspaces_name_industry" ON "workspaces" USING btree ("created_by",lower(trim("name")),lower(trim(coalesce("industry", ''))));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_business_profile_workspace" ON "business_profile" USING btree ("workspace_id");
