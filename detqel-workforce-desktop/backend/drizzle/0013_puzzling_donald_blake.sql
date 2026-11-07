ALTER TABLE "agents" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "purpose" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "instructions" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "prompt_ref" varchar(150);