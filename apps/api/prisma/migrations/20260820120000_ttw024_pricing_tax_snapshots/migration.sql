-- TTW-024: order tax/rounding snapshots, bulk quantity EXCLUDE, discount exclusivity locks.
-- Rollback (manual):
--   DROP TRIGGER IF EXISTS discount_active_locks_pct_fixed_compat ON discount_active_locks;
--   DROP FUNCTION IF EXISTS enforce_discount_lock_pct_fixed_compat();
--   DROP TABLE IF EXISTS discount_active_locks;
--   ALTER TABLE bulk_pricing DROP CONSTRAINT IF EXISTS bulk_pricing_quantity_no_overlap;
--   ALTER TABLE bulk_pricing DROP COLUMN IF EXISTS "quantityRange";
--   ALTER TABLE bulk_pricing DROP COLUMN IF EXISTS "variantKey";
--   ALTER TABLE orders DROP COLUMN IF EXISTS "vatAmount";
--   ALTER TABLE orders DROP COLUMN IF EXISTS "roundingAdjustment";
--   ALTER TABLE orders DROP COLUMN IF EXISTS "vatRateSnapshot";
--   ALTER TABLE orders DROP COLUMN IF EXISTS "pricesIncludeVatSnapshot";
--   ALTER TABLE orders DROP COLUMN IF EXISTS "vatAppliesToShippingSnapshot";
--   ALTER TABLE orders DROP COLUMN IF EXISTS "pricingPolicyVersion";

-- Order quote snapshots (nullable = unreproducible legacy rows)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "vatAmount" DECIMAL(10,2);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "roundingAdjustment" DECIMAL(10,2);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "vatRateSnapshot" DECIMAL(5,4);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pricesIncludeVatSnapshot" BOOLEAN;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "vatAppliesToShippingSnapshot" BOOLEAN;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pricingPolicyVersion" TEXT;

-- Bulk tier overlap rejection under concurrent writes
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
DECLARE
  overlap_count integer;
BEGIN
  SELECT COUNT(*) INTO overlap_count
  FROM bulk_pricing a
  JOIN bulk_pricing b
    ON a.id < b.id
   AND a."productId" = b."productId"
   AND COALESCE(a."variantId", '') = COALESCE(b."variantId", '')
   AND a.currency = b.currency
   AND int4range(a."minQuantity", COALESCE(a."maxQuantity", 2147483647), '[]')
       && int4range(b."minQuantity", COALESCE(b."maxQuantity", 2147483647), '[]');
  IF overlap_count > 0 THEN
    RAISE EXCEPTION
      'TTW-024: % overlapping bulk_pricing tier pair(s) exist. Run apps/api/scripts/inventory-pricing-conflicts.sql and remediate before migrating.',
      overlap_count;
  END IF;
END $$;

ALTER TABLE "bulk_pricing" DROP CONSTRAINT IF EXISTS bulk_pricing_quantity_no_overlap;

-- STORED generated columns keep EXCLUDE expressions IMMUTABLE (COALESCE/casts inline are not).
ALTER TABLE "bulk_pricing" DROP COLUMN IF EXISTS "variantKey";
ALTER TABLE "bulk_pricing" DROP COLUMN IF EXISTS "quantityRange";
ALTER TABLE "bulk_pricing"
  ADD COLUMN "variantKey" TEXT
  GENERATED ALWAYS AS (COALESCE("variantId", '')) STORED;
ALTER TABLE "bulk_pricing"
  ADD COLUMN "quantityRange" int4range
  GENERATED ALWAYS AS (
    int4range("minQuantity", COALESCE("maxQuantity", 2147483647), '[]')
  ) STORED;

ALTER TABLE "bulk_pricing"
  ADD CONSTRAINT bulk_pricing_quantity_no_overlap
  EXCLUDE USING gist (
    "productId" WITH =,
    "variantKey" WITH =,
    currency WITH =,
    "quantityRange" WITH &&
  );

-- Active discount exclusivity locks (app maintains; DB enforces uniqueness + PCT/FIXED)
CREATE TABLE IF NOT EXISTS "discount_active_locks" (
    "id" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "currencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "discount_active_locks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "discount_active_locks_subjectKind_subjectId_currencyKey_key"
  ON "discount_active_locks"("subjectKind", "subjectId", "currencyKey");

CREATE INDEX IF NOT EXISTS "discount_active_locks_discountId_idx"
  ON "discount_active_locks"("discountId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'discount_active_locks_discountId_fkey'
  ) THEN
    ALTER TABLE "discount_active_locks"
      ADD CONSTRAINT "discount_active_locks_discountId_fkey"
      FOREIGN KEY ("discountId") REFERENCES "discounts"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_discount_lock_pct_fixed_compat()
RETURNS trigger AS $$
BEGIN
  -- Serialize cross-type checks for the same subject (UNIQUE alone allows * and NGN together).
  PERFORM pg_advisory_xact_lock(
    hashtext(NEW."subjectKind"),
    hashtext(NEW."subjectId")
  );
  IF NEW."currencyKey" = '*' THEN
    IF EXISTS (
      SELECT 1 FROM discount_active_locks
      WHERE "subjectKind" = NEW."subjectKind"
        AND "subjectId" = NEW."subjectId"
        AND "currencyKey" <> '*'
        AND "discountId" <> NEW."discountId"
    ) THEN
      RAISE EXCEPTION 'PERCENTAGE discount conflicts with active FIXED lock for subject %:%',
        NEW."subjectKind", NEW."subjectId"
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM discount_active_locks
      WHERE "subjectKind" = NEW."subjectKind"
        AND "subjectId" = NEW."subjectId"
        AND "currencyKey" = '*'
        AND "discountId" <> NEW."discountId"
    ) THEN
      RAISE EXCEPTION 'FIXED discount conflicts with active PERCENTAGE lock for subject %:%',
        NEW."subjectKind", NEW."subjectId"
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS discount_active_locks_pct_fixed_compat ON discount_active_locks;
CREATE TRIGGER discount_active_locks_pct_fixed_compat
  BEFORE INSERT OR UPDATE ON discount_active_locks
  FOR EACH ROW EXECUTE PROCEDURE enforce_discount_lock_pct_fixed_compat();

-- Backfill locks for currently ACTIVE discounts (skip on conflict; inventory script remediates)
INSERT INTO discount_active_locks (id, "discountId", "subjectKind", "subjectId", "currencyKey")
SELECT
  md5(random()::text || clock_timestamp()::text),
  d.id,
  'SITEWIDE',
  '',
  CASE WHEN d.type = 'PERCENTAGE' THEN '*' ELSE UPPER(d.currency::text) END
FROM discounts d
WHERE d.status = 'ACTIVE'
  AND d.scope = 'ORDER'
  AND NOT EXISTS (SELECT 1 FROM discount_campaigns dc WHERE dc."discountId" = d.id)
  AND NOT EXISTS (SELECT 1 FROM discount_products dp WHERE dp."discountId" = d.id)
  AND NOT EXISTS (SELECT 1 FROM discount_variants dv WHERE dv."discountId" = d.id)
  AND (d.type = 'PERCENTAGE' OR d.currency IS NOT NULL)
ON CONFLICT ("subjectKind", "subjectId", "currencyKey") DO NOTHING;

INSERT INTO discount_active_locks (id, "discountId", "subjectKind", "subjectId", "currencyKey")
SELECT
  md5(random()::text || clock_timestamp()::text),
  d.id,
  'CAMPAIGN',
  dc."campaignId",
  CASE WHEN d.type = 'PERCENTAGE' THEN '*' ELSE UPPER(d.currency::text) END
FROM discounts d
JOIN discount_campaigns dc ON dc."discountId" = d.id
WHERE d.status = 'ACTIVE'
  AND d.scope = 'CAMPAIGN'
  AND (d.type = 'PERCENTAGE' OR d.currency IS NOT NULL)
ON CONFLICT ("subjectKind", "subjectId", "currencyKey") DO NOTHING;

INSERT INTO discount_active_locks (id, "discountId", "subjectKind", "subjectId", "currencyKey")
SELECT
  md5(random()::text || clock_timestamp()::text),
  d.id,
  'PRODUCT',
  dp."productId",
  CASE WHEN d.type = 'PERCENTAGE' THEN '*' ELSE UPPER(d.currency::text) END
FROM discounts d
JOIN discount_products dp ON dp."discountId" = d.id
WHERE d.status = 'ACTIVE'
  AND d.scope = 'PRODUCT'
  AND (d.type = 'PERCENTAGE' OR d.currency IS NOT NULL)
ON CONFLICT ("subjectKind", "subjectId", "currencyKey") DO NOTHING;

INSERT INTO discount_active_locks (id, "discountId", "subjectKind", "subjectId", "currencyKey")
SELECT
  md5(random()::text || clock_timestamp()::text),
  d.id,
  'VARIANT',
  dv."variantId",
  CASE WHEN d.type = 'PERCENTAGE' THEN '*' ELSE UPPER(d.currency::text) END
FROM discounts d
JOIN discount_variants dv ON dv."discountId" = d.id
WHERE d.status = 'ACTIVE'
  AND d.scope = 'VARIANT'
  AND (d.type = 'PERCENTAGE' OR d.currency IS NOT NULL)
ON CONFLICT ("subjectKind", "subjectId", "currencyKey") DO NOTHING;
