-- TTW-010: exactly-once charge settlement claims + notification dedupe + ledger guard.

-- AlterTable
ALTER TABLE "notification_outbox" ADD COLUMN "dedupeKey" TEXT;

-- CreateTable
CREATE TABLE "charge_settlement_claims" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'PAYSTACK',
    "businessKey" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_settlement_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "charge_settlement_claims_paymentId_key" ON "charge_settlement_claims"("paymentId");

-- CreateIndex
CREATE INDEX "charge_settlement_claims_orderId_idx" ON "charge_settlement_claims"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "charge_settlement_claims_provider_businessKey_key" ON "charge_settlement_claims"("provider", "businessKey");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_dedupeKey_key" ON "notification_outbox"("dedupeKey");

-- AddForeignKey
ALTER TABLE "charge_settlement_claims" ADD CONSTRAINT "charge_settlement_claims_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fail loudly if duplicate SUCCEEDED provider refs would break the claim unique key.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payments"
    WHERE "status" = 'SUCCEEDED'
      AND "providerRef" IS NOT NULL
    GROUP BY "provider", "providerRef"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'TTW-010: duplicate SUCCEEDED payments share a providerRef; resolve before applying settlement claims';
  END IF;
END $$;

-- Fail loudly if prior double-settlement already created multiple PAYMENT_SETTLED rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "campaign_balance_ledger_entries"
    WHERE "entryType" = 'PAYMENT_SETTLED'
      AND "orderId" IS NOT NULL
    GROUP BY "orderId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'TTW-010: duplicate PAYMENT_SETTLED ledger rows for the same orderId; resolve before creating unique index';
  END IF;
END $$;

-- Defense in depth: at most one PAYMENT_SETTLED ledger credit per order.
CREATE UNIQUE INDEX "campaign_ledger_one_payment_settled_per_order"
ON "campaign_balance_ledger_entries" ("orderId")
WHERE "entryType" = 'PAYMENT_SETTLED' AND "orderId" IS NOT NULL;

-- Backfill claims for already-settled payments so replays remain no-ops.
INSERT INTO "charge_settlement_claims" ("id", "provider", "businessKey", "paymentId", "orderId", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text || p."id"),
  p."provider",
  'charge.success:' || p."providerRef",
  p."id",
  p."orderId",
  COALESCE(p."updatedAt", CURRENT_TIMESTAMP)
FROM "payments" p
WHERE p."status" = 'SUCCEEDED'
  AND p."providerRef" IS NOT NULL
ON CONFLICT DO NOTHING;
