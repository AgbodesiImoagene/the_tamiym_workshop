# TTW-033 — Customer order detail (interim v1)

**Policy version:** `customer-order-detail/v1-interim-2026-08-21`
**Status:** Engineering interim — approved for slice 1 implementation; full Playwright matrix and TTW-040 shipment timeline deferred.

This matrix is the working source of truth for customer-owned order detail, line display snapshots, payment retry eligibility, and honest empty/list states.

## Ownership and authorization

| Rule             | Value                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| Reader           | Authenticated customer; order must match `userId`.                      |
| Unauthorized ids | Same `404 Order not found` as missing ids (no `403` leak).              |
| Admin/organizer  | Out of scope for this DTO — continue using admin/organizer projections. |

## Response contract (`CustomerOrderDetailDto`)

| Included                                                                    | Never included                                                                         |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Order status, payment status, money totals, timestamps                      | Mutable `Address` relation                                                             |
| `ship*` destination snapshot                                                | Provider `rawEvent`, `authorizationUrl`, `accessCode`, payment/refund idempotency keys |
| Line display snapshots + money                                              | Organizer economics (`organizerCostBasis`, discount internals)                         |
| Safe payment/refund summaries + `refundedAmountConfirmed` (SUCCEEDED sum)   | Internal audit notes, user PII beyond shipping snapshot                                |
| Campaign attribution `{ id, title, slug }` when present                     | Catalogue live product/variant names (use snapshots)                                   |
| `paymentRetryEligible`, `shipment` / `shipmentPlaceholder`, `policyVersion` | Invented shipment progress                                                             |

## Line display snapshots

| Field             | Rule                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Written on create | `productNameSnapshot`, `variantDisplaySnapshot`, `optionPresentationSnapshot` from quote |
| `snapshotSource`  | `PURCHASE` for new lines                                                                 |
| `snapshotVersion` | `1` (`ORDER_ITEM_DISPLAY_SNAPSHOT_VERSION`)                                              |
| Legacy migration  | Backfill from current catalogue with `BACKFILLED_CURRENT_CATALOG` + UI disclosure flag   |
| Immutability      | Customer presentation must not change after catalogue/address edits                      |

## Payment retry eligibility

Eligible only when **all** are true:

1. Order `status === PENDING_PAYMENT`
2. Order `expiresAt` is null or in the future
3. No active payment attempt (`PENDING` or `INITIATED` with unexpired `expiresAt`)

UI must hide retry when `paymentRetryEligible` is false; client must not invent eligibility.

## Shipment

| Rule    | Value                                                                           |
| ------- | ------------------------------------------------------------------------------- |
| Absent  | `shipment: null` + `shipmentPlaceholder` honest absent copy                     |
| Present | Customer-safe `shipment` summary/timeline (TTW-040); `shipmentPlaceholder` null |
| Policy  | `docs/orders/ttw-040-interim-policy.md`                                         |

## Customer app surfaces

| Surface                 | Behaviour                                                            |
| ----------------------- | -------------------------------------------------------------------- |
| `/dashboard/orders`     | Real cards only; honest empty state + CTA; each card links to detail |
| `/dashboard/orders/:id` | Renders DTO; retry only when server-eligible                         |
| `/orders/:id/confirm`   | Shared status banner; links to account detail                        |

## Deferred

- Full Playwright matrix (standard/campaign × payment/refund/shipment states)
- Real shipment timeline and customer-safe exceptions → see `docs/orders/ttw-040-interim-policy.md`
- Cancellation/return self-service (TTW-041)
- Formal product/legal/T&S sign-off beyond engineering interim
