-- TTW-005: the "bulk_pricing" statements below were written by hand, with the
-- user's approval. Prisma generated `ALTER COLUMN "quantityRange" SET DEFAULT ...`,
-- which Postgres rejects on a generated column: a generation expression can only
-- change by recreating the column, which also needs the constraint recreated.
--
-- The previous expression mapped an empty "maxQuantity" to 2147483647. With the
-- inclusive '[]' bounds, Postgres normalises that to an upper bound of 2147483648,
-- which overflows int4, so every tier without a maximum failed with "integer out
-- of range". A NULL upper bound is natively unbounded. Tiers with a maximum keep
-- exactly the same range, and no tier without a maximum can exist yet.
ALTER TABLE "bulk_pricing" DROP CONSTRAINT bulk_pricing_quantity_no_overlap;

ALTER TABLE "bulk_pricing" DROP COLUMN "quantityRange";

ALTER TABLE "bulk_pricing"
  ADD COLUMN "quantityRange" int4range
  GENERATED ALWAYS AS (int4range("minQuantity", "maxQuantity", '[]')) STORED;

ALTER TABLE "bulk_pricing"
  ADD CONSTRAINT bulk_pricing_quantity_no_overlap
  EXCLUDE USING gist (
    "productId" WITH =,
    "variantKey" WITH =,
    currency WITH =,
    "quantityRange" WITH &&
  );

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'PENDING';
