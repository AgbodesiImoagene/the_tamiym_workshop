-- TTW-043 slice 1: notification taxonomy, preferences/consent, delivery attempts, dead-letter metadata.

CREATE TYPE "NotificationCategory" AS ENUM (
  'SECURITY',
  'TRANSACTIONAL',
  'ORGANISER_OPERATIONAL',
  'MARKETING'
);

CREATE TYPE "NotificationPreferenceChannel" AS ENUM ('EMAIL', 'SMS');

CREATE TYPE "NotificationSuppressionReason" AS ENUM (
  'PREFERENCE_OPT_OUT',
  'MISSING_CONSENT',
  'TAXONOMY_UNMAPPED',
  'RECIPIENT_MISSING'
);

CREATE TYPE "NotificationConsentSource" AS ENUM (
  'REGISTRATION',
  'PREFERENCE_SETTINGS',
  'UNSUBSCRIBE_LINK',
  'ADMIN_OVERRIDE'
);

CREATE TYPE "NotificationAttemptOutcome" AS ENUM (
  'SUCCESS',
  'FAILURE',
  'RETRY_SCHEDULED'
);

CREATE TYPE "DeadLetterAckStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED');

ALTER TABLE "notification_outbox"
  ADD COLUMN "category" "NotificationCategory",
  ADD COLUMN "policyVersion" TEXT,
  ADD COLUMN "effectKey" TEXT,
  ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "suppressed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "suppressionReason" "NotificationSuppressionReason",
  ADD COLUMN "suppressionReasonCode" TEXT,
  ADD COLUMN "replayedFromId" TEXT,
  ADD COLUMN "deadLetterAckStatus" "DeadLetterAckStatus",
  ADD COLUMN "deadLetterAckAt" TIMESTAMP(3),
  ADD COLUMN "deadLetterAckByUserId" TEXT,
  ADD COLUMN "deadLetterAckNote" TEXT;

ALTER TABLE "notification_outbox"
  ADD CONSTRAINT "notification_outbox_replayedFromId_fkey"
  FOREIGN KEY ("replayedFromId") REFERENCES "notification_outbox"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification_outbox"
  ADD CONSTRAINT "notification_outbox_deadLetterAckByUserId_fkey"
  FOREIGN KEY ("deadLetterAckByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "notification_outbox_effectKey_channel_generation_key"
ON "notification_outbox"("effectKey", "channel", "generation");

CREATE INDEX "notification_outbox_status_deadLetterAckStatus_updatedAt_idx"
ON "notification_outbox"("status", "deadLetterAckStatus", "updatedAt");

CREATE INDEX "notification_outbox_effectKey_channel_idx"
ON "notification_outbox"("effectKey", "channel");

CREATE TABLE "notification_preferences" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channel" "NotificationPreferenceChannel" NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "policyVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_consents" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channel" "NotificationPreferenceChannel" NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "granted" BOOLEAN NOT NULL,
  "source" "NotificationConsentSource" NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_delivery_attempts" (
  "id" TEXT NOT NULL,
  "outboxId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "outcome" "NotificationAttemptOutcome" NOT NULL,
  "providerCode" TEXT,
  "providerMessageId" TEXT,
  "errorClass" TEXT,
  "errorMessage" TEXT,
  "durationMs" INTEGER,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_consents"
  ADD CONSTRAINT "notification_consents_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_delivery_attempts"
  ADD CONSTRAINT "notification_delivery_attempts_outboxId_fkey"
  FOREIGN KEY ("outboxId") REFERENCES "notification_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "notification_preferences_userId_channel_category_key"
ON "notification_preferences"("userId", "channel", "category");

CREATE INDEX "notification_preferences_userId_idx"
ON "notification_preferences"("userId");

CREATE INDEX "notification_consents_userId_category_channel_createdAt_idx"
ON "notification_consents"("userId", "category", "channel", "createdAt");

CREATE UNIQUE INDEX "notification_delivery_attempts_outboxId_attemptNumber_key"
ON "notification_delivery_attempts"("outboxId", "attemptNumber");

CREATE INDEX "notification_delivery_attempts_outboxId_startedAt_idx"
ON "notification_delivery_attempts"("outboxId", "startedAt");

-- Backfill taxonomy metadata for existing rows without changing delivery state.
UPDATE "notification_outbox"
SET
  "category" = 'TRANSACTIONAL',
  "policyVersion" = 'notification-delivery/v1-interim-2026-08-21',
  "effectKey" = COALESCE(
    "dedupeKey",
    "eventName" || ':' || COALESCE("recipientUserId", "recipient") || ':' || "channel"::text
  ),
  "generation" = 1,
  "suppressed" = false
WHERE "effectKey" IS NULL;

-- Dead letters default to OPEN acknowledgement state.
UPDATE "notification_outbox"
SET "deadLetterAckStatus" = 'OPEN'
WHERE "status" = 'FAILED' AND "deadLetterAckStatus" IS NULL;
