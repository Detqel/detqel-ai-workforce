-- Documents a user attached to a message, kept as {name, size} so the chips survive a reload.
ALTER TABLE "chat_messages" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;
