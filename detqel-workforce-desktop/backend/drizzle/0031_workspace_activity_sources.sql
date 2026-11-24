CREATE INDEX "idx_user_activities_entity_event" ON "user_activities" ("entity_type", "entity_id", (metadata->>'event'));
--> statement-breakpoint
WITH recorded_actions AS (
    SELECT p.workspace_id, NULL::uuid AS user_id, 'predictions'::text AS activity_type, 'Prediction saved'::text AS title,
        'prediction'::text AS entity_type, p.id AS entity_id, jsonb_build_object('event', 'prediction-created') AS metadata, p.created_at
    FROM predictions p
    UNION ALL
    SELECT s.workspace_id, s.created_by, 'simulations', 'Simulation created', 'simulation', s.id, jsonb_build_object('event', 'simulation-created'), s.created_at
    FROM simulations s
    UNION ALL
    SELECT a.workspace_id, a.created_by, 'automations', 'Automation created', 'automation', a.id, jsonb_build_object('event', 'automation-created'), a.created_at
    FROM automations a
    UNION ALL
    SELECT a.workspace_id, NULL::uuid, 'automations', 'Automation run recorded', 'automation-run', r.id,
        jsonb_build_object('event', 'automation-run-recorded', 'automationId', r.automation_id, 'status', r.status), r.started_at
    FROM automation_runs r JOIN automations a ON a.id = r.automation_id
    UNION ALL
    SELECT m.workspace_id, NULL::uuid, 'investigations', 'Investigation activity recorded', 'mission-event', e.id,
        jsonb_build_object('event', 'mission-research', 'missionId', e.mission_id), e.created_at
    FROM mission_events e JOIN missions m ON m.id = e.mission_id WHERE e.event_type IN ('research', 'analysis', 'finding')
)
INSERT INTO user_activities (workspace_id, user_id, activity_type, title, entity_type, entity_id, metadata, created_at)
SELECT r.workspace_id, r.user_id, r.activity_type, r.title, r.entity_type, r.entity_id, r.metadata, r.created_at
FROM recorded_actions r
WHERE NOT EXISTS (SELECT 1 FROM user_activities a WHERE a.entity_type = r.entity_type AND a.entity_id = r.entity_id AND a.metadata->>'event' = r.metadata->>'event');
