-- TTW-030: organiser onboarding applications (slice 1).

CREATE TYPE "OrganizerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

CREATE TABLE "organizer_applications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organisationName" TEXT NOT NULL,
    "intendedUse" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "status" "OrganizerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "customerVisibleReason" TEXT,
    "internalNotes" TEXT,
    "policyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_applications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organizer_applications_userId_status_idx"
ON "organizer_applications"("userId", "status");

CREATE INDEX "organizer_applications_status_createdAt_idx"
ON "organizer_applications"("status", "createdAt");

-- At most one PENDING application per user.
CREATE UNIQUE INDEX "organizer_applications_one_pending_per_user"
ON "organizer_applications" ("userId")
WHERE "status" = 'PENDING';

ALTER TABLE "organizer_applications"
ADD CONSTRAINT "organizer_applications_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organizer_applications"
ADD CONSTRAINT "organizer_applications_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: existing ORGANIZER users without an application get a synthetic APPROVED row.
INSERT INTO "organizer_applications" (
    "id",
    "userId",
    "organisationName",
    "intendedUse",
    "termsVersion",
    "termsAcceptedAt",
    "status",
    "reviewedByUserId",
    "reviewedAt",
    "customerVisibleReason",
    "internalNotes",
    "policyVersion",
    "createdAt",
    "updatedAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text || u."id"),
    u."id",
    COALESCE(NULLIF(TRIM(CONCAT(u."firstName", ' ', u."lastName")), ''), u."email"),
    'Legacy organiser role granted before TTW-030 onboarding applications.',
    'organiser-terms/v1-interim-2026-08-21',
    COALESCE(u."emailVerifiedAt", u."createdAt"),
    'APPROVED'::"OrganizerApplicationStatus",
    NULL,
    COALESCE(u."updatedAt", u."createdAt"),
    NULL,
    'LEGACY_ROLE',
    'organiser-onboarding-policy/v1-interim-2026-08-21',
    COALESCE(u."createdAt", CURRENT_TIMESTAMP),
    COALESCE(u."updatedAt", CURRENT_TIMESTAMP)
FROM "users" u
WHERE u."role" = 'ORGANIZER'
  AND NOT EXISTS (
    SELECT 1 FROM "organizer_applications" oa WHERE oa."userId" = u."id"
  );
