# TTW-041 — Cancellation, refund & return policy (interim v1)

**Policy version:** `cancellation-refund-return/v1-interim-2026-08-21`
**Status:** Engineering interim — approved for slice 1 implementation; formal owner/legal/finance/operations sign-off still required before production go-live claims.

This matrix is the working source of truth for cancel, refund and return **eligibility** in slice 1. Server evaluation is authoritative; clients must not invent eligibility. Monetary settlement remains TTW-013; inventory disposition remains TTW-014; shipment exceptions remain TTW-040.

## Authority

| Rule                 | Value                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Eligibility          | Pure server evaluator (`resolution-policy`) with stable denial/allow codes                   |
| Money movement       | TTW-013 only after provider-confirmed refund; approval/eligibility never moves money         |
| Stock restore        | Never from cancel, refund success, or shipment exception; disposition is later TTW-041 / 014 |
| Delivery exceptions  | TTW-040 `EXCEPTION` never silently implies cancel, refund, return, or stock restore          |
| Customer paid cancel | Request/case model deferred; customers cannot execute paid cancel in slice 1                 |
| Partial-order status | Partial refunds do not mark whole order `REFUNDED` (TTW-013); fee allocation deferred        |

## Actors (slice 1)

| Actor    | Cancel execute                                                    | Refund execute              | Return execute        |
| -------- | ----------------------------------------------------------------- | --------------------------- | --------------------- |
| Customer | Unpaid only (future self-serve); read eligibility on order detail | No — admin initiates        | No — eligibility only |
| Admin    | Unpaid `PENDING_PAYMENT` only                                     | Via existing refund API     | Eligibility only      |
| System   | Order expiry unpaid cancel (unchanged)                            | Provider webhook settlement | —                     |

## Cancellation matrix

| Order status           | Active outbound shipment | Admin cancel | Customer cancel (execute) | Stock effect                                     | Denial / allow code                       |
| ---------------------- | ------------------------ | ------------ | ------------------------- | ------------------------------------------------ | ----------------------------------------- |
| `PENDING_PAYMENT`      | n/a                      | Allowed      | Allowed (when API exists) | Release reserved inventory (TTW-014 unpaid path) | `CANCEL_ALLOWED_UNPAID`                   |
| `PAID`                 | any                      | Denied       | Denied                    | None                                             | `CANCEL_NOT_ALLOWED_USE_REFUND`           |
| `PROCESSING`           | any                      | Denied       | Denied                    | None                                             | `CANCEL_NOT_ALLOWED_USE_REFUND`           |
| `FULFILLED`            | any                      | Denied       | Denied                    | None                                             | `CANCEL_NOT_ALLOWED_SHIPPED_OR_FULFILLED` |
| `DELIVERED`            | any                      | Denied       | Denied                    | None                                             | `CANCEL_NOT_ALLOWED_DELIVERED`            |
| `PARTIALLY_REFUNDED`   | any                      | Denied       | Denied                    | None                                             | `CANCEL_NOT_ALLOWED_USE_REFUND`           |
| `REFUNDED`/`CANCELLED` | any                      | Denied       | Denied                    | None                                             | `CANCEL_NOT_ALLOWED_TERMINAL`             |

**Slice 1 change:** admin `PROCESSING → CANCELLED` is **removed**. Paid commercial unwind must go through the refund path so money and stock stay consistent with TTW-013/014.

## Refund reason codes (admin initiate)

| Code                         | Meaning                                     | Eligible order statuses (slice 1)              | Customized lines (`designId` set)                     |
| ---------------------------- | ------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `CHANGE_OF_MIND`             | Customer / goodwill change of mind          | `PAID`, `PROCESSING` only                      | Denied once production/fulfilment started (`PAID` ok) |
| `DEFECT_OR_NOT_AS_DESCRIBED` | Quality / description remedy                | `PAID`…`DELIVERED`, `PARTIALLY_REFUNDED`       | Allowed                                               |
| `PRODUCTION_FAILURE`         | Platform production fault                   | `PAID`…`DELIVERED`, `PARTIALLY_REFUNDED`       | Allowed                                               |
| `CARRIER_LOSS_OR_DAMAGE`     | Carrier lost/damaged (ops-confirmed)        | `FULFILLED`, `DELIVERED`, `PARTIALLY_REFUNDED` | Allowed                                               |
| `ADDRESS_FAILURE_PLATFORM`   | Address/delivery failure attributed to us   | `FULFILLED`, `DELIVERED`, `PARTIALLY_REFUNDED` | Allowed                                               |
| `DUPLICATE_OR_PRICING_ERROR` | Duplicate charge / pricing error            | `PAID`…`DELIVERED`, `PARTIALLY_REFUNDED`       | Allowed                                               |
| `ADMIN_GOODWILL`             | Explicit admin goodwill (audited free text) | `PAID`…`DELIVERED`, `PARTIALLY_REFUNDED`       | Allowed                                               |

### Refund status gates

| Condition                                         | Code                                       |
| ------------------------------------------------- | ------------------------------------------ |
| `PENDING_PAYMENT` / unpaid                        | `REFUND_NOT_ALLOWED_UNPAID`                |
| `CANCELLED` / `REFUNDED`                          | `REFUND_NOT_ALLOWED_TERMINAL`              |
| Reason not in vocabulary                          | `REFUND_NOT_ALLOWED_UNKNOWN_REASON`        |
| Reason × status illegal                           | `REFUND_NOT_ALLOWED_REASON_FOR_STATUS`     |
| Customized + `CHANGE_OF_MIND` after `PROCESSING`+ | `REFUND_NOT_ALLOWED_CUSTOM_CHANGE_OF_MIND` |
| Amount / cumulative cap                           | Existing TTW-013 validation (unchanged)    |
| Allowed                                           | `REFUND_ALLOWED`                           |

Shipping / Paystack fee allocation, organiser proceeds clawback and partial component math are **deferred** (still capped by captured value only).

## Return eligibility (evaluate only in slice 1)

No return-case API in slice 1. Evaluator answers whether a return **request** would be in-policy.

| Rule                         | Value                                                                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window                       | 7 calendar days from shipment `deliveredAt` (Africa/Lagos calendar)                                                                                                                    |
| Requires                     | Order `DELIVERED` and outbound shipment `DELIVERED` with `deliveredAt`                                                                                                                 |
| `CHANGE_OF_MIND`             | Standard catalogue lines only; customized (`designId`) denied                                                                                                                          |
| `DEFECT_OR_NOT_AS_DESCRIBED` | Allowed inside or (ops) noted outside window — slice 1: inside window only for auto-eligibility; outside → `RETURN_NOT_ALLOWED_WINDOW_EXPIRED` (admin goodwill refund may still apply) |
| Not delivered                | `RETURN_NOT_ALLOWED_NOT_DELIVERED`                                                                                                                                                     |
| Stock                        | Return eligibility never restores stock                                                                                                                                                |

## TTW-040 delivery exceptions

| Exception present                        | Effect on TTW-041                                       |
| ---------------------------------------- | ------------------------------------------------------- |
| Shipment `EXCEPTION` (any taxonomy code) | Does **not** auto-allow cancel, refund, return, restock |
| Ops wants money remedy                   | Must call admin refund with an explicit reason code     |
| Customer copy                            | Exception message only; no implied refund promise       |

Denial/info code when a client assumes exception ⇒ refund: `SHIPMENT_EXCEPTION_IS_NOT_REMEDY`.

## Physical disposition (deferred)

`RESTOCK` / `REWORK` / `SCRAP` / `RETURN_TO_CUSTOMER` require an authorized receipt/disposition event in a later slice. Refund success alone never restores inventory (TTW-014 invariant).

## Campaign / payout impact (deferred detail)

Confirmed refunds continue to adjust campaign totals only via TTW-013 settlement. Negative organiser balance / recovery policy is out of slice 1.

## Stable code catalogue

All machine codes are prefixed for support/runbook use:

- Cancel: `CANCEL_*`
- Refund: `REFUND_*`
- Return: `RETURN_*`
- Shipment coupling: `SHIPMENT_EXCEPTION_IS_NOT_REMEDY`

Policy version string is returned on eligibility projections and denial payloads.

## Deferred (later TTW-041 slices)

- Owner/legal/finance formal sign-off and customer-facing terms copy
- `OrderResolution` case / item / evidence / disposition models and migrations
- Customer request / withdraw APIs and admin approve/reject queues
- Approval thresholds and segregation of duties
- Fee/shipping/VAT/discount allocation and rounding order
- Return logistics labels (TTW-047) and chargebacks (TTW-046)
- Playwright matrix

## Worked examples (slice 1)

1. **Unpaid cancel:** `PENDING_PAYMENT` → admin cancel → `CANCEL_ALLOWED_UNPAID` → reserved stock released.
2. **Paid change of mind before production:** `PAID`, no customized constraint breach → admin refund `CHANGE_OF_MIND` → `REFUND_ALLOWED`; order not cancelled by this ticket.
3. **Customized after production:** `PROCESSING`+ with `designId`, reason `CHANGE_OF_MIND` → `REFUND_NOT_ALLOWED_CUSTOM_CHANGE_OF_MIND`.
4. **Shipment EXCEPTION:** status `EXCEPTION` / `LOST` → still `SHIPMENT_EXCEPTION_IS_NOT_REMEDY` for auto-refund; admin may later refund with `CARRIER_LOSS_OR_DAMAGE` after ops confirmation.
5. **Delivered return window:** day 3, standard item, change of mind → `RETURN_ALLOWED_WITHIN_WINDOW`; day 10 → `RETURN_NOT_ALLOWED_WINDOW_EXPIRED`.
