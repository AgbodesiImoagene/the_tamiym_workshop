-- TTW-011: exactly-once payout transfer events + ledger uniqueness for reserve/success/release.

-- CreateTable
CREATE TABLE "payout_provider_event_claims" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'PAYSTACK',
    "businessKey" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "fromStatus" "PayoutStatus",
    "toStatus" "PayoutStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_provider_event_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payout_provider_event_claims_payoutId_idx" ON "payout_provider_event_claims"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "payout_provider_event_claims_provider_businessKey_key" ON "payout_provider_event_claims"("provider", "businessKey");

-- AddForeignKey
ALTER TABLE "payout_provider_event_claims" ADD CONSTRAINT "payout_provider_event_claims_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fail loudly if duplicate reserve/success/release ledger rows already exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "campaign_balance_ledger_entries"
    WHERE "entryType" = 'PAYOUT_RESERVED' AND "payoutId" IS NOT NULL
    GROUP BY "payoutId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'TTW-011: duplicate PAYOUT_RESERVED rows for the same payoutId; resolve before unique index';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "campaign_balance_ledger_entries"
    WHERE "entryType" = 'PAYOUT_SUCCEEDED' AND "payoutId" IS NOT NULL
    GROUP BY "payoutId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'TTW-011: duplicate PAYOUT_SUCCEEDED rows for the same payoutId; resolve before unique index';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "campaign_balance_ledger_entries"
    WHERE "entryType" = 'PAYOUT_FAILED' AND "payoutId" IS NOT NULL
    GROUP BY "payoutId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'TTW-011: duplicate PAYOUT_FAILED (release) rows for the same payoutId; resolve before unique index';
  END IF;
END $$;

CREATE UNIQUE INDEX "campaign_ledger_one_payout_reserved_per_payout"
ON "campaign_balance_ledger_entries" ("payoutId")
WHERE "entryType" = 'PAYOUT_RESERVED' AND "payoutId" IS NOT NULL;

CREATE UNIQUE INDEX "campaign_ledger_one_payout_succeeded_per_payout"
ON "campaign_balance_ledger_entries" ("payoutId")
WHERE "entryType" = 'PAYOUT_SUCCEEDED' AND "payoutId" IS NOT NULL;

CREATE UNIQUE INDEX "campaign_ledger_one_payout_failed_release_per_payout"
ON "campaign_balance_ledger_entries" ("payoutId")
WHERE "entryType" = 'PAYOUT_FAILED' AND "payoutId" IS NOT NULL;
