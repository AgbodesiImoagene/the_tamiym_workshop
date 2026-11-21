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

| Included                                                                    | Never included                                                                                                          |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Order status, payment status, money totals, timestamps                      | Mutable `Address` relation                                                                                              |
| `ship*` destination snapshot                                                | Provider `rawEvent`, `authorizationUrl`, `accessCode`, payment/refund idempotency keys                                  |
| Line display snapshots + money                                              | Organizer economics (`organizerCostBasis`, discount internals)                                                          |
| Safe payment/refund summaries + `refundedAmountConfirmed` (SUCCEEDED sum)   | Internal audit notes, user PII beyond the shipping snapshot and the customer's own order note (`customerNote`, TTW-197) |
| Campaign attribution `{ id, title, slug }` when present                     | Catalogue live product/variant names (use snapshots)                                                                    |
| `paymentRetryEligible`, `shipment` / `shipmentPlaceholder`, `policyVersion` | Invented shipment progress                                                                                              |

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

## Quoting with a design (TTW-239)

`POST /orders/quote` applies the same design rule as order creation (one shared function, `assertDesignsOrderableBy`). For each line with a `designId`, in this order: the design exists (else `400`), belongs to the caller (else `403`), the variant exists (else `400`), the design is for the variant's product (else `400`), and is not `REJECTED` (else `400`, code `DESIGN_REJECTED`). A quote never reads the views of a design the caller does not own, so it cannot be used to learn another customer's surcharge. `PENDING`, `FLAGGED` and `APPROVED` designs are quoted (client answer Q28). Campaign quotes keep their own rule (the design must be one of the campaign's products).

## Ordering a saved design (TTW-058)

A line may carry a `designId` (see `POST /orders`). The server checks, in this order, that the design exists, belongs to the caller, matches the variant's product, and is not `REJECTED`. A rejected design is refused with `400` and code `DESIGN_REJECTED`, and nothing is created. An order does not wait for moderation: `PENDING`, `FLAGGED` and `APPROVED` designs can be ordered (client answer Q28). A design rejected after the order was placed is handled by the admin refund flow (`POST /admin/orders/:id/refund` with `reasonCode` and `reason`).

## Deferred

- Full Playwright matrix (standard/campaign × payment/refund/shipment states)
- Real shipment timeline and customer-safe exceptions → see `docs/orders/ttw-040-interim-policy.md`
- Cancellation/return self-service (TTW-041)
- Formal product/legal/T&S sign-off beyond engineering interim
