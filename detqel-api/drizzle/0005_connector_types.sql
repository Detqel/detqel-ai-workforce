CREATE TABLE "connector_types" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "code" varchar(50) NOT NULL UNIQUE,
    "name" varchar(100) NOT NULL,
    "description" text,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "connector_types" ("code", "name", "description", "sort_order") VALUES
    ('data', 'Data', 'Databases, APIs, files, and data sources', 0),
    ('mcp', 'MCP', 'Model Context Protocol servers and tools', 1),
    ('environment', 'Environment', 'Runtime environments and infrastructure', 2),
    ('enterprise', 'Enterprise', 'Business applications and enterprise services', 3);
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "data_stream" varchar(255);
--> statement-breakpoint
UPDATE "connections" SET "connection_type" = CASE
    WHEN "connection_type" IN ('database', 'api', 'file') THEN 'data'
    WHEN "connection_type" = 'saas' THEN 'enterprise'
    WHEN "connection_type" = 'other' THEN 'environment'
    ELSE "connection_type"
END;
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_connection_type_connector_types_code_fk"
    FOREIGN KEY ("connection_type") REFERENCES "connector_types" ("code") ON DELETE RESTRICT ON UPDATE CASCADE;
