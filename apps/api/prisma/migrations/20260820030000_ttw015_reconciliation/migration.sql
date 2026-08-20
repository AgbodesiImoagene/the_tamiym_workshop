-- TTW-015: durable reconciliation runs, findings, and two-person repair requests.

CREATE TYPE "ReconciliationRunKind" AS ENUM ('INTERNAL', 'PROVIDER', 'TARGETED');
CREATE TYPE "ReconciliationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'INCOMPLETE', 'FAILED');
CREATE TYPE "ReconciliationDomain" AS ENUM ('PAYMENT', 'REFUND', 'PAYOUT', 'CAMPAIGN', 'INVENTORY');
CREATE TYPE "ReconciliationOutcome" AS ENUM ('MATCHED', 'MISMATCH', 'MISSING_INTERNAL', 'MISSING_PROVIDER', 'PENDING_GRACE', 'UNVERIFIABLE');
CREATE TYPE "ReconciliationFindingStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'WONT_FIX');
CREATE TYPE "ReconciliationSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "ReconciliationRepairStatus" AS ENUM ('REQUESTED', 'APPROVED', 'APPLIED', 'FAILED', 'CANCELLED');

CREATE TABLE "reconciliation_runs" (
    "id" TEXT NOT NULL,
    "kind" "ReconciliationRunKind" NOT NULL,
    "status" "ReconciliationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "windowKey" TEXT NOT NULL,
    "cutoffAt" TIMESTAMP(3) NOT NULL,
    "fromAt" TIMESTAMP(3),
    "toAt" TIMESTAMP(3),
    "cursor" JSONB,
    "inputSnapshotHash" TEXT,
    "recordsChecked" INTEGER NOT NULL DEFAULT 0,
    "findingsOpen" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reconciliation_runs_kind_windowKey_key" ON "reconciliation_runs"("kind", "windowKey");
CREATE INDEX "reconciliation_runs_status_startedAt_idx" ON "reconciliation_runs"("status", "startedAt");
CREATE INDEX "reconciliation_runs_cutoffAt_idx" ON "reconciliation_runs"("cutoffAt");

CREATE TABLE "reconciliation_findings" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "domain" "ReconciliationDomain" NOT NULL,
    "outcome" "ReconciliationOutcome" NOT NULL,
    "severity" "ReconciliationSeverity" NOT NULL,
    "status" "ReconciliationFindingStatus" NOT NULL DEFAULT 'OPEN',
    "fingerprint" TEXT NOT NULL,
    "leftLabel" TEXT NOT NULL,
    "leftValue" TEXT NOT NULL,
    "rightLabel" TEXT NOT NULL,
    "rightValue" TEXT NOT NULL,
    "currency" TEXT,
    "unit" TEXT,
    "sourceIds" JSONB,
    "evidence" JSONB,
    "incidentRef" TEXT,
    "acknowledgedByUserId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_findings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reconciliation_findings_runId_idx" ON "reconciliation_findings"("runId");
CREATE INDEX "reconciliation_findings_domain_status_severity_idx" ON "reconciliation_findings"("domain", "status", "severity");
CREATE INDEX "reconciliation_findings_fingerprint_status_idx" ON "reconciliation_findings"("fingerprint", "status");
CREATE INDEX "reconciliation_findings_severity_status_createdAt_idx" ON "reconciliation_findings"("severity", "status", "createdAt");

ALTER TABLE "reconciliation_findings"
  ADD CONSTRAINT "reconciliation_findings_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "reconciliation_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "reconciliation_repair_requests" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "domain" "ReconciliationDomain" NOT NULL,
    "status" "ReconciliationRepairStatus" NOT NULL DEFAULT 'REQUESTED',
    "commandKey" TEXT NOT NULL,
    "payload" JSONB,
    "requestedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "beforeEvidence" JSONB,
    "afterEvidence" JSONB,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_repair_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reconciliation_repair_requests_findingId_status_idx" ON "reconciliation_repair_requests"("findingId", "status");
CREATE INDEX "reconciliation_repair_requests_status_createdAt_idx" ON "reconciliation_repair_requests"("status", "createdAt");

ALTER TABLE "reconciliation_repair_requests"
  ADD CONSTRAINT "reconciliation_repair_requests_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "reconciliation_runs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reconciliation_repair_requests"
  ADD CONSTRAINT "reconciliation_repair_requests_findingId_fkey"
  FOREIGN KEY ("findingId") REFERENCES "reconciliation_findings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one OPEN finding per fingerprint.
CREATE UNIQUE INDEX "reconciliation_findings_open_fingerprint_key"
  ON "reconciliation_findings"("fingerprint")
  WHERE "status" = 'OPEN';
