-- TTW-033: customer-visible OrderItem display snapshots + legacy catalogue backfill.
-- Policy: customer-order-detail/v1-interim-2026-08-21
-- Rollback (manual):
--   DROP INDEX IF EXISTS "order_items_snapshotSource_idx";
--   ALTER TABLE "order_items" DROP COLUMN IF EXISTS "productNameSnapshot";
--   ALTER TABLE "order_items" DROP COLUMN IF EXISTS "variantDisplaySnapshot";
--   ALTER TABLE "order_items" DROP COLUMN IF EXISTS "optionPresentationSnapshot";
--   ALTER TABLE "order_items" DROP COLUMN IF EXISTS "snapshotSource";
--   ALTER TABLE "order_items" DROP COLUMN IF EXISTS "snapshotVersion";
--   DROP TYPE IF EXISTS "OrderItemSnapshotSource";

CREATE TYPE "OrderItemSnapshotSource" AS ENUM ('PURCHASE', 'BACKFILLED_CURRENT_CATALOG');

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "productNameSnapshot" TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "variantDisplaySnapshot" TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "optionPresentationSnapshot" JSONB;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "snapshotSource" "OrderItemSnapshotSource";
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "snapshotVersion" INTEGER NOT NULL DEFAULT 1;

-- Backfill from current catalogue. Marked BACKFILLED_CURRENT_CATALOG — not historical evidence.
UPDATE "order_items" AS oi
SET
  "productNameSnapshot" = COALESCE(p.name, 'Unknown product'),
  "variantDisplaySnapshot" = CASE
    WHEN pv.sku IS NOT NULL AND pv.sku <> '' THEN COALESCE(pv.name, 'Variant') || ' (' || pv.sku || ')'
    ELSE COALESCE(pv.name, 'Variant')
  END,
  "optionPresentationSnapshot" = COALESCE(
    oi."variantSnapshot",
    (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'option', po.name,
            'optionCode', po.code,
            'value', pov."displayName",
            'valueCode', pov."valueCode"
          )
          ORDER BY po."sortOrder", pov."sortOrder"
        ),
        '[]'::jsonb
      )
      FROM variant_option_values vov
      JOIN product_options po ON po.id = vov."optionId"
      JOIN product_option_values pov ON pov.id = vov."optionValueId"
      WHERE vov."variantId" = oi."variantId"
    )
  ),
  "snapshotSource" = 'BACKFILLED_CURRENT_CATALOG'::"OrderItemSnapshotSource",
  "snapshotVersion" = 1
FROM products p
JOIN product_variants pv ON pv.id = oi."variantId"
WHERE p.id = oi."productId"
  AND (
    oi."productNameSnapshot" IS NULL
    OR oi."variantDisplaySnapshot" IS NULL
    OR oi."snapshotSource" IS NULL
  );

-- Safety net for orphaned lines (deleted catalogue rows).
UPDATE "order_items"
SET
  "productNameSnapshot" = COALESCE("productNameSnapshot", 'Unknown product'),
  "variantDisplaySnapshot" = COALESCE("variantDisplaySnapshot", 'Unknown variant'),
  "snapshotSource" = COALESCE("snapshotSource", 'BACKFILLED_CURRENT_CATALOG'::"OrderItemSnapshotSource"),
  "snapshotVersion" = COALESCE("snapshotVersion", 1)
WHERE "productNameSnapshot" IS NULL
   OR "variantDisplaySnapshot" IS NULL
   OR "snapshotSource" IS NULL;

ALTER TABLE "order_items" ALTER COLUMN "productNameSnapshot" SET NOT NULL;
ALTER TABLE "order_items" ALTER COLUMN "variantDisplaySnapshot" SET NOT NULL;
ALTER TABLE "order_items" ALTER COLUMN "snapshotSource" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "order_items_snapshotSource_idx" ON "order_items"("snapshotSource");
