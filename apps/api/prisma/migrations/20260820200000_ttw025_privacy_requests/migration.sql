-- TTW-025 privacy / DSAR request tables (interim policy).

CREATE TYPE "PrivacyRequestType" AS ENUM ('EXPORT', 'ERASURE');
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'HELD');

CREATE TABLE "privacy_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PrivacyRequestType" NOT NULL,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'PENDING',
    "policyVersion" TEXT NOT NULL,
    "legalHoldUntil" TIMESTAMP(3),
    "exportObjectKey" TEXT,
    "exportExpiresAt" TIMESTAMP(3),
    "exportChecksum" TEXT,
    "lastErrorCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "privacy_request_actions" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "systemCode" TEXT NOT NULL,
    "outcomeCode" TEXT NOT NULL,
    "evidence" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "privacy_request_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "privacy_requests_userId_type_status_idx" ON "privacy_requests"("userId", "type", "status");
CREATE INDEX "privacy_requests_status_createdAt_idx" ON "privacy_requests"("status", "createdAt");
CREATE INDEX "privacy_request_actions_requestId_systemCode_idx" ON "privacy_request_actions"("requestId", "systemCode");

ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "privacy_request_actions" ADD CONSTRAINT "privacy_request_actions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "privacy_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
