-- TTW-027: immutable moderation decisions + owner appeals (slice 1).

CREATE TYPE "ModerationSubjectType" AS ENUM ('DESIGN', 'MEDIA', 'CAMPAIGN');
CREATE TYPE "ModerationActorKind" AS ENUM ('AI', 'ADMIN', 'SYSTEM', 'APPEAL_RESOLUTION');
CREATE TYPE "ModerationAppealStatus" AS ENUM ('PENDING', 'WITHDRAWN', 'UPHELD', 'OVERTURNED', 'ESCALATED');

CREATE TABLE "moderation_decisions" (
    "id" TEXT NOT NULL,
    "subjectType" "ModerationSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "revisionHash" TEXT,
    "outcome" "ModerationStatus" NOT NULL,
    "actorKind" "ModerationActorKind" NOT NULL,
    "actorUserId" TEXT,
    "policyVersion" TEXT NOT NULL,
    "modelVersion" TEXT,
    "reasonCodes" TEXT[] NOT NULL,
    "customerExplanation" TEXT,
    "internalEvidence" JSONB,
    "supersedesDecisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "moderation_decisions_subjectType_subjectId_createdAt_idx"
ON "moderation_decisions"("subjectType", "subjectId", "createdAt");

CREATE TABLE "moderation_appeals" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "status" "ModerationAppealStatus" NOT NULL DEFAULT 'PENDING',
    "statement" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "resolutionDecisionId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moderation_appeals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "moderation_appeals_ownerUserId_status_idx"
ON "moderation_appeals"("ownerUserId", "status");
CREATE INDEX "moderation_appeals_decisionId_idx" ON "moderation_appeals"("decisionId");
CREATE INDEX "moderation_appeals_status_createdAt_idx" ON "moderation_appeals"("status", "createdAt");

CREATE UNIQUE INDEX "moderation_appeals_one_pending_per_decision"
ON "moderation_appeals" ("decisionId")
WHERE "status" = 'PENDING';

ALTER TABLE "moderation_appeals"
ADD CONSTRAINT "moderation_appeals_decisionId_fkey"
FOREIGN KEY ("decisionId") REFERENCES "moderation_decisions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Legacy backfill: one SYSTEM / LEGACY_BACKFILL decision per existing subject.
INSERT INTO "moderation_decisions" (
    "id",
    "subjectType",
    "subjectId",
    "revisionHash",
    "outcome",
    "actorKind",
    "actorUserId",
    "policyVersion",
    "modelVersion",
    "reasonCodes",
    "customerExplanation",
    "internalEvidence",
    "supersedesDecisionId",
    "createdAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text || d."id"),
    'DESIGN'::"ModerationSubjectType",
    d."id",
    NULL,
    d."moderationStatus",
    'SYSTEM'::"ModerationActorKind",
    NULL,
    'content-moderation-policy/v1-interim-2026-08-20',
    NULL,
    ARRAY['LEGACY_BACKFILL']::TEXT[],
    'This content was moderated under a prior system version. Contact support if you need help.',
    '{"source":"legacy_backfill"}'::JSONB,
    NULL,
    COALESCE(d."updatedAt", d."createdAt", CURRENT_TIMESTAMP)
FROM "designs" d;

INSERT INTO "moderation_decisions" (
    "id",
    "subjectType",
    "subjectId",
    "revisionHash",
    "outcome",
    "actorKind",
    "actorUserId",
    "policyVersion",
    "modelVersion",
    "reasonCodes",
    "customerExplanation",
    "internalEvidence",
    "supersedesDecisionId",
    "createdAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text || m."id"),
    'MEDIA'::"ModerationSubjectType",
    m."id",
    NULL,
    m."moderationStatus",
    'SYSTEM'::"ModerationActorKind",
    NULL,
    'content-moderation-policy/v1-interim-2026-08-20',
    NULL,
    ARRAY['LEGACY_BACKFILL']::TEXT[],
    'This content was moderated under a prior system version. Contact support if you need help.',
    '{"source":"legacy_backfill"}'::JSONB,
    NULL,
    COALESCE(m."updatedAt", m."createdAt", CURRENT_TIMESTAMP)
FROM "media_assets" m;

INSERT INTO "moderation_decisions" (
    "id",
    "subjectType",
    "subjectId",
    "revisionHash",
    "outcome",
    "actorKind",
    "actorUserId",
    "policyVersion",
    "modelVersion",
    "reasonCodes",
    "customerExplanation",
    "internalEvidence",
    "supersedesDecisionId",
    "createdAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text || c."id"),
    'CAMPAIGN'::"ModerationSubjectType",
    c."id",
    NULL,
    c."moderationStatus",
    'SYSTEM'::"ModerationActorKind",
    NULL,
    'content-moderation-policy/v1-interim-2026-08-20',
    NULL,
    ARRAY['LEGACY_BACKFILL']::TEXT[],
    'This content was moderated under a prior system version. Contact support if you need help.',
    '{"source":"legacy_backfill"}'::JSONB,
    NULL,
    COALESCE(c."updatedAt", c."createdAt", CURRENT_TIMESTAMP)
FROM "campaigns" c;
