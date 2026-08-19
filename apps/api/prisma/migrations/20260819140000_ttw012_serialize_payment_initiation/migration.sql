-- TTW-012: serialize payment initiation — persist checkout session + one active attempt per order.

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "authorizationUrl" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "accessCode" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "payments_expiresAt_idx" ON "payments"("expiresAt");

-- Fail loudly if two active attempts already exist for the same order.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payments"
    WHERE "status" IN ('PENDING', 'INITIATED')
    GROUP BY "orderId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'TTW-012: multiple PENDING/INITIATED payments for the same orderId; resolve before unique index';
  END IF;
END $$;

CREATE UNIQUE INDEX "payments_one_active_attempt_per_order"
ON "payments" ("orderId")
WHERE "status" IN ('PENDING', 'INITIATED');
