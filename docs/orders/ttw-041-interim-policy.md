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

| Code                              | Meaning                                                | Eligible order statuses (slice 1)              | Customized lines (`designId` set)                     |
| --------------------------------- | ------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------- |
| `CHANGE_OF_MIND`                  | Customer / goodwill change of mind                     | `PAID`, `PROCESSING` only                      | Denied once production/fulfilment started (`PAID` ok) |
| `DEFECT_OR_NOT_AS_DESCRIBED`      | Quality / description remedy                           | `PAID`…`DELIVERED`, `PARTIALLY_REFUNDED`       | Allowed                                               |
| `PRODUCTION_FAILURE`              | Platform production fault                              | `PAID`…`DELIVERED`, `PARTIALLY_REFUNDED`       | Allowed                                               |
| `CARRIER_LOSS_OR_DAMAGE`          | Carrier lost/damaged (ops-confirmed)                   | `FULFILLED`, `DELIVERED`, `PARTIALLY_REFUNDED` | Allowed                                               |
| `ADDRESS_FAILURE_PLATFORM`        | Address/delivery failure attributed to us              | `FULFILLED`, `DELIVERED`, `PARTIALLY_REFUNDED` | Allowed                                               |
| `DUPLICATE_OR_PRICING_ERROR`      | Duplicate charge / pricing error                       | `PAID`…`DELIVERED`, `PARTIALLY_REFUNDED`       | Allowed                                               |
| `ADMIN_GOODWILL`                  | Explicit admin goodwill (audited free text)            | `PAID`…`DELIVERED`, `PARTIALLY_REFUNDED`       | Allowed                                               |
| `LATE_PAYMENT_AFTER_CANCELLATION` | Money captured after the order was cancelled (TTW-088) | `CANCELLED` with a captured payment only       | Not applicable (full refund of the captured amount)   |

### Late payment on a cancelled order (TTW-088)

Interim rule, pending the client's answer to Q16: the 30 minute payment window is unchanged. Bank transfers and USSD can settle after it.

- When `charge.success` arrives for an order that is already `CANCELLED` (or expired and cancelled on the spot) and Paystack's amount and currency match the order total, the capture is **recorded**: one `ChargeSettlementClaim` and `Payment.status = SUCCEEDED`, in one transaction. The order stays `CANCELLED`.
- Nothing else is applied: no stock consumption, no campaign `currentAmount`, no ledger entry. A redelivery is a duplicate.
- A capture whose amount or currency does not match, or that lacks them, is **not** recorded and stays a manual case (admin is notified).
- An admin may then refund it with reason `LATE_PAYMENT_AFTER_CANCELLATION`, for the **full captured amount only**, once. This is not a general opening of refunds on cancelled orders: any other reason on a `CANCELLED` order stays `REFUND_NOT_ALLOWED_TERMINAL`, and a `CANCELLED` order without a captured payment stays non-refundable.
- Settlement of this refund skips the campaign decrement and `REFUND_APPLIED` ledger entry, because the matching credit never existed. The order ends `REFUNDED`.
- There is no automatic refund and no re-confirmation of the order.
- Limit: if several captured payments exist on the same order, the late-payment refund is refused (manual handling), so no captured payment is left behind by refunding another.

### Refund status gates

| Condition                                            | Code                                       |
| ---------------------------------------------------- | ------------------------------------------ |
| `PENDING_PAYMENT` / unpaid                           | `REFUND_NOT_ALLOWED_UNPAID`                |
| `CANCELLED` / `REFUNDED`                             | `REFUND_NOT_ALLOWED_TERMINAL`              |
| `CANCELLED` + captured payment + late-payment reason | `REFUND_ALLOWED_LATE_PAYMENT` (allowed)    |
| Reason not in vocabulary                             | `REFUND_NOT_ALLOWED_UNKNOWN_REASON`        |
| Reason × status illegal                              | `REFUND_NOT_ALLOWED_REASON_FOR_STATUS`     |
| Customized + `CHANGE_OF_MIND` after `PROCESSING`+    | `REFUND_NOT_ALLOWED_CUSTOM_CHANGE_OF_MIND` |
| Amount / cumulative cap                              | Existing TTW-013 validation (unchanged)    |
| Allowed                                              | `REFUND_ALLOWED`                           |

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

## Order creation idempotency (TTW-037)

| Rule                 | Value                                                                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guarantee            | One `(userId, idempotencyKey)` creates at most one order and one inventory reservation, enforced by `@@unique([userId, idempotencyKey])`                                                                                                                                      |
| Sequential replay    | A known key returns the existing order (201), whatever its status, only if the request content matches the stored fingerprint (lines, saved delivery address content, campaign)                                                                                               |
| Content mismatch     | A known key with a different fingerprint, or whose order has no fingerprint, → 409 `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`; nothing is created. Clients start a new key and re-quote                                                                                               |
| Fingerprint required | `orders_idempotency_fingerprint_required` CHECK (validated on every row): a keyed order must store `idempotencyFingerprint`. The migration marks keyed orders created before TTW-037 with the sentinel `legacy:unreplayable`: they stay updatable and their keys never replay |
| Concurrent replay    | A request that fails after the winner committed (lost unique constraint, or an earlier check such as stock) rolls back its own work and returns the winner's order; no 5xx                                                                                                    |
| Kind mismatch        | A key already used for a standard order, another campaign, or a campaign order on the standard endpoint → 409 `IDEMPOTENCY_KEY_REUSED`; nothing is created                                                                                                                    |
| Client key lifecycle | `apps/app` keeps one key per cart revision; it changes when lines change, when the quoted address differs from the saved one, or when the server reports the order closed or `PAYMENT_WINDOW_EXPIRED` (never from the device clock)                                           |
| Cart clearing        | `apps/app` clears the cart only after the backend reports the pending order paid (confirmation page or a replay returning a paid order), or on explicit removal                                                                                                               |

## Stable code catalogue

All machine codes are prefixed for support/runbook use:

- Cancel: `CANCEL_*`
- Refund: `REFUND_*`
- Return: `RETURN_*`
- Shipment coupling: `SHIPMENT_EXCEPTION_IS_NOT_REMEDY`
- Order creation (TTW-037): `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`; payment initiation: `ORDER_NOT_PENDING_PAYMENT`, `PAYMENT_WINDOW_EXPIRED`

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
