-- TTW-024: inventory conflicting pricing rows before / after migration.
-- Run against the target database (psql "$DATABASE_URL" -f ...).

-- Overlapping bulk quantity tiers (same product/variant/currency)
SELECT a.id AS tier_a,
       b.id AS tier_b,
       a."productId",
       a."variantId",
       a.currency,
       a."minQuantity" AS a_min,
       a."maxQuantity" AS a_max,
       b."minQuantity" AS b_min,
       b."maxQuantity" AS b_max
FROM bulk_pricing a
JOIN bulk_pricing b
  ON a.id < b.id
 AND a."productId" = b."productId"
 AND COALESCE(a."variantId", '') = COALESCE(b."variantId", '')
 AND a.currency = b.currency
 AND int4range(a."minQuantity", COALESCE(a."maxQuantity", 2147483647), '[]')
     && int4range(b."minQuantity", COALESCE(b."maxQuantity", 2147483647), '[]');

-- Multiple ACTIVE campaign discounts per campaign (quote fail-closed path)
SELECT dc."campaignId", COUNT(*) AS active_discount_links, array_agg(d.id) AS discount_ids
FROM discount_campaigns dc
JOIN discounts d ON d.id = dc."discountId"
WHERE d.status = 'ACTIVE'
  AND d.scope = 'CAMPAIGN'
GROUP BY dc."campaignId"
HAVING COUNT(*) > 1;

-- ACTIVE discounts missing exclusivity locks after migration (remediate via admin deactivate/reactivate)
SELECT d.id, d.scope, d.type, d.status
FROM discounts d
WHERE d.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM discount_active_locks l WHERE l."discountId" = d.id
  );

-- PCT + FIXED locks on the same subject (should be empty after advisory-locked trigger)
SELECT a."subjectKind", a."subjectId", a."currencyKey" AS a_key, b."currencyKey" AS b_key,
       a."discountId" AS a_discount, b."discountId" AS b_discount
FROM discount_active_locks a
JOIN discount_active_locks b
  ON a."subjectKind" = b."subjectKind"
 AND a."subjectId" = b."subjectId"
 AND a.id < b.id
 AND (
   (a."currencyKey" = '*' AND b."currencyKey" <> '*')
   OR (b."currencyKey" = '*' AND a."currencyKey" <> '*')
 );
