-- How each relationship was derived (a source foreign key, or a naming convention) and how sure the derivation is.
ALTER TABLE "brain_relationship_types" ADD COLUMN "method" varchar(20) DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "brain_relationship_types" ADD COLUMN "confidence" double precision DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "brain_relationship_types" ADD COLUMN "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL;
