CREATE TABLE "litellm_virtual_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"process_id" varchar(50) NOT NULL,
	"gateway_key_id" varchar(255) NOT NULL,
	"model_alias" varchar(255) NOT NULL,
	"encrypted_key" varchar(1024) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "litellm_virtual_keys" ADD CONSTRAINT "litellm_virtual_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_litellm_virtual_keys_workspace_process" ON "litellm_virtual_keys" USING btree ("workspace_id","process_id");