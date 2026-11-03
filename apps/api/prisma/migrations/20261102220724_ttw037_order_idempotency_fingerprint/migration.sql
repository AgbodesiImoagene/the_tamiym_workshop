-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "idempotencyFingerprint" TEXT;

-- TTW-037: the statements below were added by hand (Prisma cannot express CHECK
-- constraints), with the user's approval.
--
-- Keyed orders created before this migration get a sentinel fingerprint that no
-- request can ever produce: they stay updatable (payment, expiry, cancellation)
-- and their keys never replay (409 IDEMPOTENCY_KEY_PAYLOAD_MISMATCH).
UPDATE "orders"
SET "idempotencyFingerprint" = 'legacy:unreplayable'
WHERE "idempotencyKey" IS NOT NULL AND "idempotencyFingerprint" IS NULL;

-- A keyed order must carry the fingerprint of the request that created it.
-- Validated for every row, so no existing order is left in violation.
ALTER TABLE "orders" ADD CONSTRAINT "orders_idempotency_fingerprint_required"
  CHECK ("idempotencyKey" IS NULL OR "idempotencyFingerprint" IS NOT NULL);
