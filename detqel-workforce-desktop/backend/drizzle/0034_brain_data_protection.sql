-- Fields of a dataset that hold personal data and are stored only as pseudonyms outside the sealed Bronze copy.
ALTER TABLE "brain_datasets" ADD COLUMN "protected_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
-- Finds Bronze rows written before raw records were sealed, so they can be sealed in the background.
CREATE INDEX "idx_brain_bronze_unsealed" ON "brain_bronze_records" ("extracted_at") WHERE NOT ("payload" ? '$sealed');
