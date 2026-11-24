CREATE TABLE "chat_questions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
    "message_id" uuid NOT NULL REFERENCES "chat_messages"("id") ON DELETE CASCADE,
    "questions" jsonb NOT NULL,
    "request_content" text NOT NULL,
    "answer_message_id" uuid REFERENCES "chat_messages"("id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "chat_questions_questions_check" CHECK (jsonb_typeof("questions") = 'array' AND jsonb_array_length("questions") BETWEEN 1 AND 3),
    CONSTRAINT "chat_questions_request_check" CHECK (length("request_content") BETWEEN 1 AND 32000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_questions_message_idx" ON "chat_questions" ("message_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_questions_answer_idx" ON "chat_questions" ("answer_message_id");
--> statement-breakpoint
CREATE INDEX "chat_questions_pending_idx" ON "chat_questions" ("session_id", "created_at") WHERE "answer_message_id" IS NULL;
--> statement-breakpoint
INSERT INTO "user_activities" ("workspace_id", "activity_type", "title", "entity_type", "entity_id", "metadata", "created_at")
SELECT s.workspace_id, kind.activity_type, 'Agent completed a reply', 'discussion', s.id,
    jsonb_build_object('event', 'reply-completed', 'messageId', m.id, 'turnId', m.turn_id, 'speakerName', m.speaker_name), m.created_at
FROM chat_messages m
JOIN chat_sessions s ON s.id = m.session_id
CROSS JOIN LATERAL (
    SELECT 'discussions'::text AS activity_type
    UNION ALL SELECT 'investigations' WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(m.activity) step WHERE step->>'status' = 'done' AND step->>'kind' IN ('readingConnector', 'readingKnowledge', 'searchingKnowledge', 'searchingWeb'))
    UNION ALL SELECT 'documents' WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(m.activity) step WHERE step->>'status' = 'done' AND step->>'kind' = 'savingDocument')
) kind
WHERE m.role = 'assistant' AND btrim(m.content) <> ''
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(m.activity) step WHERE step->'detail'->>'interruption' IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM user_activities a WHERE a.entity_type = 'discussion' AND a.metadata->>'messageId' = m.id::text AND lower(a.activity_type) = kind.activity_type);
