ALTER TABLE "users" ADD COLUMN "portal_user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" varchar(60);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" varchar(60);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_name" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "country" varchar(2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "state" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "license_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "license_type" varchar(30);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "license_billing" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "license_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "license_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_portal_user_id_unique" UNIQUE("portal_user_id");