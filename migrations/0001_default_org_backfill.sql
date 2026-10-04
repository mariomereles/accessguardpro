-- Data migration: existing events and non-ADMIN users move into a default organization so the
-- multi-tenant checks keep working for them. ADMIN users stay without organization (platform admins).
INSERT INTO "organizations" ("name")
SELECT 'Default'
WHERE NOT EXISTS (SELECT 1 FROM "organizations")
  AND (EXISTS (SELECT 1 FROM "events") OR EXISTS (SELECT 1 FROM "users" WHERE "role" <> 'ADMIN'));
--> statement-breakpoint
UPDATE "events" SET "org_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" LIMIT 1) WHERE "org_id" IS NULL;
--> statement-breakpoint
UPDATE "users" SET "org_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at" LIMIT 1) WHERE "org_id" IS NULL AND "role" <> 'ADMIN';
