-- TTW-013: provider-confirmed refund lifecycle with exactly-once settlement.

-- Order may be partially refunded without falsely marking the whole order REFUNDED.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED' BEFORE 'REFUNDED';

-- In-flight / attention states between INITIATED and terminal SUCCEEDED/FAILED.
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "RefundStatus" ADD VALUE IF NOT EXISTS 'NEEDS_ATTENTION';

ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "paymentId" TEXT;
ALTER TABLE "refunds" ADD COLUMN IF NOT EXISTS "transactionReference" TEXT;

CREATE TABLE IF NOT EXISTS "refund_settlement_claims" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'PAYSTACK',
    "businessKey" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_settlement_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "refund_settlement_claims_refundId_key"
  ON "refund_settlement_claims"("refundId");

CREATE INDEX IF NOT EXISTS "refund_settlement_claims_orderId_idx"
  ON "refund_settlement_claims"("orderId");

CREATE UNIQUE INDEX IF NOT EXISTS "refund_settlement_claims_provider_businessKey_key"
  ON "refund_settlement_claims"("provider", "businessKey");

CREATE INDEX IF NOT EXISTS "campaign_balance_ledger_entries_refundId_idx"
  ON "campaign_balance_ledger_entries"("refundId");

CREATE UNIQUE INDEX IF NOT EXISTS "refunds_idempotencyKey_key"
  ON "refunds"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "refunds_paymentId_idx" ON "refunds"("paymentId");

CREATE INDEX IF NOT EXISTS "refunds_transactionReference_idx"
  ON "refunds"("transactionReference");

CREATE INDEX IF NOT EXISTS "refunds_status_idx" ON "refunds"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refunds_paymentId_fkey'
  ) THEN
    ALTER TABLE "refunds"
      ADD CONSTRAINT "refunds_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "payments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refund_settlement_claims_refundId_fkey'
  ) THEN
    ALTER TABLE "refund_settlement_claims"
      ADD CONSTRAINT "refund_settlement_claims_refundId_fkey"
      FOREIGN KEY ("refundId") REFERENCES "refunds"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Fail loudly if duplicate REFUND_APPLIED rows already exist for one refund.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "campaign_balance_ledger_entries"
    WHERE "entryType" = 'REFUND_APPLIED'
      AND "refundId" IS NOT NULL
    GROUP BY "refundId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'TTW-013: duplicate REFUND_APPLIED ledger rows for the same refundId; resolve before unique index';
  END IF;
END $$;

-- Defense in depth: at most one REFUND_APPLIED ledger debit per refund.
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_ledger_one_refund_applied_per_refund"
ON "campaign_balance_ledger_entries" ("refundId")
WHERE "entryType" = 'REFUND_APPLIED' AND "refundId" IS NOT NULL;

-- Backfill settlement claims for historically SUCCEEDED refunds so replays remain no-ops.
INSERT INTO "refund_settlement_claims" ("id", "provider", "businessKey", "refundId", "orderId", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || r."id"),
  r."provider",
  'refund.processed:' || COALESCE(r."providerRef", r."id"),
  r."id",
  r."orderId",
  COALESCE(r."updatedAt", CURRENT_TIMESTAMP)
FROM "refunds" r
WHERE r."status" = 'SUCCEEDED'
ON CONFLICT DO NOTHING;
