DELETE FROM "agent_connections";
--> statement-breakpoint
DELETE FROM "chat_session_connections";
--> statement-breakpoint
DELETE FROM "connections";
--> statement-breakpoint
DELETE FROM "connector_catalog";
--> statement-breakpoint
ALTER TABLE "connections" DROP COLUMN "connection_type";
--> statement-breakpoint
DROP INDEX "connector_catalog_type_category_enabled_idx";
--> statement-breakpoint
ALTER TABLE "connector_catalog" DROP COLUMN "connector_type", DROP COLUMN "category";
--> statement-breakpoint
DROP TABLE "connector_types";
--> statement-breakpoint
ALTER TABLE "connector_catalog" RENAME TO "connection_definitions";
--> statement-breakpoint
ALTER TABLE "connection_definitions" ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "connections" RENAME COLUMN "catalog_id" TO "definition_id";
--> statement-breakpoint
ALTER TABLE "connections" ALTER COLUMN "definition_id" SET NOT NULL;
--> statement-breakpoint
ALTER INDEX "connector_catalog_workspace_idx" RENAME TO "connection_definitions_workspace_idx";
--> statement-breakpoint
ALTER TABLE "connection_definitions" RENAME CONSTRAINT "connector_catalog_pkey" TO "connection_definitions_pkey";
--> statement-breakpoint
ALTER TABLE "connection_definitions" RENAME CONSTRAINT "connector_catalog_code_unique" TO "connection_definitions_code_unique";
--> statement-breakpoint
ALTER TABLE "connection_definitions" RENAME CONSTRAINT "connector_catalog_workspace_id_fkey" TO "connection_definitions_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "connections" RENAME CONSTRAINT "connections_catalog_id_connector_catalog_id_fk" TO "connections_definition_id_connection_definitions_id_fk";
