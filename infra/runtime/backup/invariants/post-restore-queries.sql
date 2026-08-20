-- TTW-067 post-restore invariant queries (SELECT-only).
-- Run against the restored database and compare to recovery-point evidence.
-- Do NOT run UPDATE/DELETE/INSERT here. Never embed credentials.
--
-- Capture pattern (owner):
--   psql "$DATABASE_URL" -f post-restore-queries.sql -o evidence/post-restore.txt

-- ========== Orders ==========
SELECT 'orders_count' AS metric, COUNT(*)::bigint AS value FROM orders;
SELECT 'orders_by_status' AS metric, status::text AS key, COUNT(*)::bigint AS value
FROM orders
GROUP BY status
ORDER BY status;
SELECT 'orders_amount_checksum' AS metric,
       COUNT(*)::bigint AS order_count,
       COALESCE(SUM(total_amount), 0) AS sum_total_amount,
       COALESCE(SUM(subtotal_amount), 0) AS sum_subtotal_amount
FROM orders;

-- ========== Payments / settlement ==========
SELECT 'payments_count' AS metric, COUNT(*)::bigint AS value FROM payments;
SELECT 'payments_by_status' AS metric, status::text AS key, COUNT(*)::bigint AS value
FROM payments
GROUP BY status
ORDER BY status;
SELECT 'payments_amount_checksum' AS metric,
       COUNT(*)::bigint AS payment_count,
       COALESCE(SUM(amount), 0) AS sum_amount
FROM payments;
SELECT 'charge_settlement_claims_count' AS metric, COUNT(*)::bigint AS value
FROM charge_settlement_claims;
-- Duplicate business keys must be zero (unique constraint should already enforce).
SELECT 'charge_settlement_duplicate_business_keys' AS metric, COUNT(*)::bigint AS value
FROM (
  SELECT provider, business_key, COUNT(*) AS c
  FROM charge_settlement_claims
  GROUP BY provider, business_key
  HAVING COUNT(*) > 1
) d;

-- ========== Refunds ==========
SELECT 'refunds_count' AS metric, COUNT(*)::bigint AS value FROM refunds;
SELECT 'refunds_by_status' AS metric, status::text AS key, COUNT(*)::bigint AS value
FROM refunds
GROUP BY status
ORDER BY status;
SELECT 'refunds_amount_checksum' AS metric,
       COUNT(*)::bigint AS refund_count,
       COALESCE(SUM(amount), 0) AS sum_amount
FROM refunds;

-- ========== Payouts ==========
SELECT 'payouts_count' AS metric, COUNT(*)::bigint AS value FROM payouts;
SELECT 'payouts_by_status' AS metric, status::text AS key, COUNT(*)::bigint AS value
FROM payouts
GROUP BY status
ORDER BY status;
SELECT 'payout_runs_count' AS metric, COUNT(*)::bigint AS value FROM payout_runs;

-- ========== Inventory ==========
SELECT 'inventory_items_count' AS metric, COUNT(*)::bigint AS value FROM inventory_items;
SELECT 'inventory_on_hand_checksum' AS metric,
       COUNT(*)::bigint AS item_count,
       COALESCE(SUM(stock_on_hand), 0) AS sum_stock_on_hand,
       COALESCE(SUM(reserved), 0) AS sum_reserved
FROM inventory_items;
SELECT 'inventory_movements_count' AS metric, COUNT(*)::bigint AS value
FROM inventory_movements;

-- ========== Objects / media keys ==========
SELECT 'media_assets_count' AS metric, COUNT(*)::bigint AS value FROM media_assets;
SELECT 'media_assets_with_original_key' AS metric, COUNT(*)::bigint AS value
FROM media_assets
WHERE original_key IS NOT NULL AND length(original_key) > 0;
SELECT 'media_derivatives_count' AS metric, COUNT(*)::bigint AS value FROM media_derivatives;
SELECT 'media_derivative_key_checksum' AS metric,
       COUNT(*)::bigint AS derivative_count,
       COUNT(DISTINCT key)::bigint AS distinct_keys
FROM media_derivatives;

-- Orphan check sketches (informational): derivatives without parent asset.
SELECT 'media_derivatives_orphan_assets' AS metric, COUNT(*)::bigint AS value
FROM media_derivatives d
LEFT JOIN media_assets a ON d.asset_id = a.id
WHERE a.id IS NULL;
