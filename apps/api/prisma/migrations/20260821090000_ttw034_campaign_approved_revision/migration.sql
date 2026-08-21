-- TTW-034: approvedRevision stamps the draftRevision reviewed at activation.
-- Policy: campaign-readiness/v1-interim-2026-08-21
-- Rollback (manual, after writers stop requiring the column):
--   ALTER TABLE "campaigns" DROP COLUMN IF EXISTS "approvedRevision";

ALTER TABLE "campaigns"
ADD COLUMN IF NOT EXISTS "approvedRevision" INTEGER;
