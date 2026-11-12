-- Accounts signed in before 0021 have no license name or end date. Both are in the license token already stored on
-- the row, which was verified against the portal's keys when it was saved, so read them from its payload.
-- Rows whose token cannot be decoded are left alone and fill in at the next sign-in.
CREATE OR REPLACE FUNCTION pg_temp.license_claims(token text) RETURNS jsonb AS $$
DECLARE
    payload text := translate(split_part(token, '.', 2), '-_', '+/');
BEGIN
    payload := payload || repeat('=', (4 - length(payload) % 4) % 4);
    RETURN convert_from(decode(payload, 'base64'), 'UTF8')::jsonb -> 'license';
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint
UPDATE "users" u
SET "license_name" = COALESCE(u."license_name", left(c.claims ->> 'name', 80)),
    "license_ends_at" = COALESCE(u."license_ends_at", (c.claims ->> 'expiresAt')::timestamptz)
FROM (
    SELECT "id", pg_temp.license_claims("license_token") AS claims
    FROM "users"
    WHERE "license_token" IS NOT NULL AND ("license_name" IS NULL OR "license_ends_at" IS NULL)
) c
WHERE u."id" = c."id" AND c.claims IS NOT NULL;
