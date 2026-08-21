-- TTW-042 slice 1: payout profile lifecycle, one-default constraint, payout policy snapshots.

CREATE TYPE "PayoutProfileStatus" AS ENUM (
  'PENDING_VERIFICATION',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
  'SUPERSEDED'
);

ALTER TABLE "user_payout_profiles"
  ADD COLUMN "status" "PayoutProfileStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  ADD COLUMN "bankResolutionStatus" TEXT,
  ADD COLUMN "destinationVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedAt" TIMESTAMP(3);

-- Grandfather existing destinations so current organisers are not suddenly blocked.
-- Documented as LEGACY_GRANDFATHER in interim policy; re-verification can be forced later.
UPDATE "user_payout_profiles"
SET
  "status" = 'VERIFIED',
  "bankResolutionStatus" = 'LEGACY_GRANDFATHER',
  "verifiedAt" = COALESCE("verifiedAt", "updatedAt", "createdAt", CURRENT_TIMESTAMP)
WHERE "status" = 'PENDING_VERIFICATION'
  AND "bankResolutionStatus" IS NULL;

CREATE INDEX "user_payout_profiles_userId_status_idx"
ON "user_payout_profiles"("userId", "status");

-- Conflict report + remediation: keep the most recently updated default per user.
DO $$
DECLARE
  conflict_count integer;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM (
    SELECT "userId"
    FROM "user_payout_profiles"
    WHERE "isDefault" = true
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  ) multi;

  RAISE NOTICE 'TTW-042 default-profile conflict users: %', conflict_count;

  IF conflict_count > 0 THEN
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY "userId"
          ORDER BY "updatedAt" DESC, "createdAt" DESC, id DESC
        ) AS rn
      FROM "user_payout_profiles"
      WHERE "isDefault" = true
    )
    UPDATE "user_payout_profiles" p
    SET "isDefault" = false
    FROM ranked r
    WHERE p.id = r.id
      AND r.rn > 1;

    RAISE NOTICE 'TTW-042 remediated multi-default profiles (kept newest per user)';
  END IF;
END $$;

CREATE UNIQUE INDEX "user_payout_profiles_one_default_per_user"
ON "user_payout_profiles" ("userId")
WHERE "isDefault" = true;

ALTER TABLE "payout_runs"
  ADD COLUMN "policyVersion" TEXT;

ALTER TABLE "payouts"
  ADD COLUMN "snapshotProfileId" TEXT,
  ADD COLUMN "snapshotDestinationVersion" INTEGER,
  ADD COLUMN "policyVersion" TEXT,
  ADD COLUMN "eligibilitySnapshot" JSONB;
