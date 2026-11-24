ALTER TABLE "chat_questions" RENAME CONSTRAINT "chat_questions_session_id_fkey" TO "chat_questions_session_id_chat_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_questions" RENAME CONSTRAINT "chat_questions_message_id_fkey" TO "chat_questions_message_id_chat_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_questions" RENAME CONSTRAINT "chat_questions_answer_message_id_fkey" TO "chat_questions_answer_message_id_chat_messages_id_fk";
--> statement-breakpoint
DELETE FROM user_activities a USING chat_messages m
WHERE a.entity_type = 'discussion' AND a.metadata->>'event' = 'reply-completed' AND a.metadata->>'messageId' = m.id::text
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(m.activity) step WHERE step->>'status' = 'failed');
