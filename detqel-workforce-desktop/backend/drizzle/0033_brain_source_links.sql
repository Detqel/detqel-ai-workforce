CREATE TABLE "brain_source_links" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "connection_id" uuid NOT NULL REFERENCES "connections"("id") ON DELETE CASCADE,
    "linked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brain_source_links_connection" ON "brain_source_links" ("workspace_id", "connection_id");
--> statement-breakpoint
-- Connections that already feed datasets were in business use before links existed; keep them linked.
INSERT INTO "brain_source_links" ("workspace_id", "connection_id", "linked_by", "created_at")
SELECT DISTINCT ON (d."workspace_id", d."connection_id") d."workspace_id", d."connection_id", d."created_by", d."created_at"
FROM "brain_datasets" d
WHERE d."connection_id" IS NOT NULL
ORDER BY d."workspace_id", d."connection_id", d."created_at"
ON CONFLICT DO NOTHING;
