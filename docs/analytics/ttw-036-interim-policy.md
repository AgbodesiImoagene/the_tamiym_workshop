# TTW-036 — Analytics KPI & query contracts (interim v1)

**Policy version:** `analytics-kpi/v1-interim-2026-08-21`\
**Status:** Engineering interim — approved for slice 1 implementation; formal finance/operations business-owner sign-off still required before production go-live claims.

This matrix is the working source of truth for admin analytics aggregates, exports and drill-downs. Server evaluation of filters and metric inclusion is authoritative; clients must not invent definitions or silently coerce unknown filters.

## Authority

| Rule              | Value                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Definition stamp  | Every aggregate/export/drill-down response includes `meta.definitionVersion`                |
| Money source      | Settled `Payment` / `Refund` / ledger / succeeded `Payout` rows — not display caches alone  |
| Gross cache label | `Campaign.currentAmount` is labelled **gross cache**, never substituted for ledger-eligible |
| Timezone          | `Africa/Lagos` (UTC+1, no DST). Calendar `dateFrom`/`dateTo` are Lagos civil dates          |
| Window            | Inclusive start of `dateFrom`, exclusive start of the day after `dateTo`                    |
| Currency          | `NGN` only in v1; other codes rejected                                                      |
| Cutoff            | Queries use a single `dataCutoffAt` (= request clock) for “as of now” ledger / freshness    |
| Read-only         | Analytics endpoints never mutate financial or inventory state                               |
| Access            | Admin role only; organiser self-serve analytics deferred                                    |

## Metric catalogue (slice 1)

| Metric id               | Definition                                                                                     | Includes                                 | Excludes                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| `orderCount`            | Count of orders with `createdAt` in window                                                     | All statuses except `DRAFT`              | `DRAFT`                                             |
| `orderPaidCount`        | Count of orders in window whose commercial lifecycle is post-payment                           | `PAID`…`REFUNDED`                        | `DRAFT`, `PENDING_PAYMENT`, `CANCELLED`             |
| `grossOrderValue`       | Sum of `Order.totalAmount` for orders in `orderCount` set                                      | Same as `orderCount`                     | Pending/failed payments do not remove the order row |
| `settledRevenue`        | Sum of `Payment.amount` where `status=SUCCEEDED` and settlement claim time in window           | Provider-confirmed charges (TTW-010)     | `PENDING`/`INITIATED`/`FAILED`; no claim → excluded |
| `refundedValue`         | Sum of `Refund.amount` where `status=SUCCEEDED` and settlement claim time in window            | Provider-confirmed refunds (TTW-013)     | In-flight / failed refunds                          |
| `netRevenue`            | `settledRevenue − refundedValue`                                                               | —                                        | No implicit FX                                      |
| `campaignGrossRaised`   | Sum of `Campaign.currentAmount` (webhook gross cache)                                          | All campaigns matching filters           | **Not** ledger-eligible; labelled in API/docs       |
| `eligibleLedgerBalance` | Sum of ledger entry `amount` where `availableAt ≤ dataCutoffAt`                                | Holds/refunds/reserves already in ledger | Future-dated hold entries                           |
| `paidOutValue`          | Sum of `Payout.amount` where `status=SUCCEEDED` and `createdAt` in window (when window set)    | Succeeded transfers only                 | Queued/processing/failed/reversed                   |
| `activeCampaignCount`   | Campaigns with `status=ACTIVE` overlapping the window (created ≤ end; endDate null or ≥ start) | —                                        | Draft/review/paused/disabled/ended                  |
| `campaignsCreatedCount` | Campaigns with `createdAt` in window                                                           | All statuses                             | —                                                   |

Legacy overview field `totalRevenue` maps to **`settledRevenue`** (not PAID-order `totalAmount`). Clients that assumed PAID-order gross must migrate.

## Dimensions (approved filters)

| Filter          | Semantics                                                                | Rejection                                     |
| --------------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| `dateFrom`      | Lagos calendar date `YYYY-MM-DD`                                         | Invalid / non-date                            |
| `dateTo`        | Lagos calendar date `YYYY-MM-DD`                                         | Invalid; `dateFrom > dateTo`                  |
| Range span      | Max **366** Lagos days                                                   | Excessive range                               |
| `campaignId`    | Exact campaign id                                                        | Unknown id (404 on snapshot; filter = empty)  |
| `productId`     | Orders that include at least one line with this product                  | —                                             |
| `orderStatus`   | Exact `OrderStatus`                                                      | Unknown enum                                  |
| `paymentStatus` | Exact `PaymentStatus` (order-level denormalised field)                   | Unknown enum                                  |
| `channel`       | `STORE` (`campaignId` null) or `FUNDRAISER` (`campaignId` set)           | Unknown channel                               |
| `currency`      | Must be `NGN` if present                                                 | Other codes                                   |
| `entity`        | Export only: `orders` \| `campaigns`                                     | Any other value (no silent default to orders) |
| Pagination      | Cursor + `take` (default 50, max 100 drill-down; export max 10_000 rows) | `take` out of bounds; export over limit       |

## Freshness SLO (interim)

| Signal                  | Rule                                                            |
| ----------------------- | --------------------------------------------------------------- |
| Target                  | Latest completed internal reconciliation run ≤ **26 hours** old |
| `meta.freshness.status` | `OK` / `STALE` / `UNKNOWN`                                      |
| `STALE`                 | Last completed run older than SLO, or none finished             |
| Display caches          | Always labelled; never reported as reconciled truth             |

## Drill-downs (slice 1)

Paginated, permission-safe projections (ids + amounts + statuses; no unnecessary PII):

| Path                                         | Source set                                       |
| -------------------------------------------- | ------------------------------------------------ |
| `/admin/analytics/drilldowns/orders`         | Same filter set as order metrics                 |
| `/admin/analytics/drilldowns/settlements`    | Succeeded payments + settlement claim timestamps |
| `/admin/analytics/drilldowns/refunds`        | Succeeded refunds + settlement claim timestamps  |
| `/admin/analytics/drilldowns/payouts`        | Payouts (optional status filter via money path)  |
| `/admin/analytics/drilldowns/reconciliation` | OPEN/ACKNOWLEDGED findings (masked; TTW-015)     |

Applying the same cutoff and filters to aggregate, export and drill-down must reproduce totals from the documented source set.

## CSV / export

- Same query contract as overview filters.
- Formula-injection defence on every cell (existing strip/`escapeCsvCell`).
- Hard row cap **10_000**; reject rather than truncate silently.
- Audit privileged exports (`admin.analytics.export`) with entity + filter keys + row count — never emails/names/account numbers.

## PII minimization

| Surface        | Allowed                                    | Forbidden                                                                               |
| -------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Overview/money | Aggregates + meta                          | Customer identity                                                                       |
| Drill-downs    | Order/payment/refund/payout/finding ids    | Email, phone, address, raw provider payloads                                            |
| CSV orders     | Order id, status, amounts, currency, times | Slice 1 keeps legacy email columns for ops CSV — treat as privileged; no new PII fields |

## Change control

Metric-definition changes require a new `definitionVersion`, ticket update, fixture re-sign-off and dual review. Do not silently alter inclusion rules in place.

## Deferred (later slices)

- Formal business-owner sign-off of fixture totals
- Admin UI filter persistence, plain-language metric copy, Playwright journey
- Shared OpenAPI client package generation (TTW-050)
- Organiser-facing analytics
- Cross-currency conversion
- Streaming CSV beyond the hard cap
- Distinct sales-channel column on orders (derived channel only in slice 1)

## Worked fixture sketch (sign-off pending)

| Scenario                       | Expected                                     |
| ------------------------------ | -------------------------------------------- |
| Paid order ₦10_000, no refund  | settled +10_000; net +10_000                 |
| Same + SUCCEEDED refund ₦2_500 | settled +10_000; refunded +2_500; net +7_500 |
| INITIATED payment only         | settled unchanged                            |
| Campaign gross cache vs ledger | both returned; labels distinct               |
| OPEN reconciliation finding    | visible in reconciliation drill-down         |
