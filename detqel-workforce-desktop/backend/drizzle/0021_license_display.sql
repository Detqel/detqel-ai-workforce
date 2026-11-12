ALTER TABLE "users" ADD COLUMN "license_name" varchar(80);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "license_ends_at" timestamp with time zone;