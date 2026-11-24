ALTER TABLE "connector_catalog" ADD COLUMN "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "connector_catalog_workspace_idx" ON "connector_catalog" ("workspace_id");
