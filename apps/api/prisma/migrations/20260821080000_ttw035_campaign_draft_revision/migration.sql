-- TTW-035: monotonic Campaign.draftRevision for organiser authoring concurrency.
-- Policy: organiser-campaign-authoring/v1-interim-2026-08-21
-- Rollback (manual, after writers stop requiring the column):
--   ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "draftRevision";

ALTER TABLE "campaigns"
ADD COLUMN IF NOT EXISTS "draftRevision" INTEGER NOT NULL DEFAULT 1;

-- Explicit backfill for any rows that somehow lack the default (idempotent).
UPDATE "campaigns"
SET "draftRevision" = 1
WHERE "draftRevision" IS NULL OR "draftRevision" < 1;
