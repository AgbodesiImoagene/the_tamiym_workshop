# TTW-040 — Shipment & delivery-exception lifecycle (interim v1)

**Policy version:** `shipment-lifecycle/v1-interim-2026-08-21`  
**Status:** Engineering interim — approved for slice 1 implementation; formal fulfilment/ops/product/legal sign-off still required before production go-live claims.

This matrix is the working source of truth for carrier-neutral shipments, append-only events, admin transitions, customer-safe visibility, and delivery-exception stubs in slice 1.

## Authority

| Rule                | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| Commercial summary  | `OrderStatus` remains the customer-facing commercial summary       |
| Physical movement   | `Shipment.status` + append-only `ShipmentEvent` rows               |
| Derivation          | Only server shipment rules may set order `FULFILLED` / `DELIVERED` |
| Carrier integration | None in v1 — admin-operated `MANUAL` (and vocabulary stubs) only   |

## Cardinality (v1)

| Rule              | Value                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| Schema            | One-to-many `Order` → `Shipment` (future split packages)                 |
| Active outbound   | At most one active outbound shipment per order (partial unique index)    |
| Active definition | `direction = OUTBOUND` and `status NOT IN (CANCELLED)`                   |
| Historical orders | No synthetic backfill — orders without shipments stay honestly unshipped |

## Carrier / tracking vocabulary

| Field                           | Allowed values / rules                                                           |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `carrierCode`                   | `MANUAL`, `GIG`, `DHL`, `FEDEX`, `UPS`, `NIPOST`, `OTHER`                        |
| `serviceCode`                   | Free text, max 64; optional                                                      |
| Tracking number                 | Optional until dispatch; required on `DISPATCHED` and later (except `CANCELLED`) |
| Tracking uniqueness             | Unique on (`carrierCode`, normalized tracking) when tracking is present          |
| Tracking URL                    | Optional; must be `https:` and host on the allowlist below                       |
| Customer visibility of tracking | Visible only when shipment status is `DISPATCHED` or later (not while `READY`)   |

### Tracking URL allowlist (hosts)

`tracking.dhl.com`, `www.fedex.com`, `www.ups.com`, `www.giglogistics.com`, `www.nipost.gov.ng`, `track.ship24.com`

Hosts outside the allowlist are rejected. Carrier adapters (TTW-044) may extend the list.

## State machine

```text
READY → DISPATCHED | CANCELLED
DISPATCHED → IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | EXCEPTION | CANCELLED
IN_TRANSIT → OUT_FOR_DELIVERY | DELIVERED | EXCEPTION
OUT_FOR_DELIVERY → DELIVERED | EXCEPTION
EXCEPTION → IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | CANCELLED
DELIVERED → (terminal for v1 transitions; corrections append superseding events only)
CANCELLED → terminal
```

### Order summary derivation

| Shipment transition                       | Order effect                                                 |
| ----------------------------------------- | ------------------------------------------------------------ |
| Create (`READY`) while order `PROCESSING` | Order → `FULFILLED`                                          |
| Create while order already `FULFILLED`    | Order unchanged                                              |
| Event `DELIVERED`                         | Order → `DELIVERED`                                          |
| Exception / cancel                        | Never implies order cancel, refund, return, or stock restore |

### Forbidden admin bypass

Admin `PATCH /admin/orders/:id` must not set `FULFILLED` or `DELIVERED` directly. Those statuses are derived only via shipment APIs.

Create/dispatch requires order status in `{ PROCESSING, FULFILLED }` (paid inventory path already reached; inventory consumption remains TTW-014).

## Events (append-only)

| Rule            | Value                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| Writes          | Insert-only `ShipmentEvent`; never mutate prior rows                              |
| Idempotency     | Unique (`shipmentId`, `idempotencyKey`); duplicate key returns the existing event |
| Corrections     | Append a new event with `supersedesEventId`; retain original                      |
| Actor / source  | `actorUserId` + `AuditSource` (admin API in slice 1)                              |
| Customer fields | `customerMessage` only; private notes stay admin-only                             |

## Exception taxonomy (stubs)

| Code                   | Customer-safe default message                         | Escalation SLO (ops alert target) |
| ---------------------- | ----------------------------------------------------- | --------------------------------- |
| `LATE`                 | Delivery is running later than estimated.             | 1 business day                    |
| `LOST`                 | We are investigating a missing shipment.              | 4 business hours                  |
| `DAMAGED`              | The shipment was reported damaged in transit.         | 1 business day                    |
| `ADDRESS_FAILURE`      | Delivery could not complete with the address on file. | 4 business hours                  |
| `CUSTOMER_UNAVAILABLE` | Delivery attempt could not reach the recipient.       | 1 business day                    |
| `OTHER`                | There is a delivery issue; support will follow up.    | 1 business day                    |

Exceptions never silently cancel the order, issue a refund, or restore stock (TTW-041).

## Evidence (v1)

| Transition | Required evidence                                                       |
| ---------- | ----------------------------------------------------------------------- |
| Create     | Carrier code (default `MANUAL`); optional service / estimate            |
| Dispatch   | Tracking number; optional allowlisted tracking URL                      |
| Delivered  | Admin confirmation; optional private POD notes (never customer-visible) |
| Exception  | Exception code + customer-safe message; optional private notes          |
| Correction | Reason string (audit note) + superseding event                          |

## Visibility / redaction

| Audience          | Allowed                                                                                                                     | Never                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Customer          | Status, carrier display name, tracking after dispatch, estimate, customer event timeline, exception code + customer message | Private notes, actor ids, raw provider payloads, POD PII, live address beyond order shipping snapshot |
| Organiser (later) | Status + timestamps only                                                                                                    | Address, phone, carrier notes, POD, tracking URL                                                      |
| Admin             | Full shipment + events + private notes                                                                                      | —                                                                                                     |

## Notifications (slice 1)

Slice 1 reuses existing order status emails when derivation sets `FULFILLED` / `DELIVERED`. Dedicated shipment milestone/exception templates and overdue monitors are deferred (later TTW-040 slices / TTW-043).

## Promised delivery

| Rule            | Value                                                                               |
| --------------- | ----------------------------------------------------------------------------------- |
| Storage         | Optional `estimatedDeliveryAt` (calendar datetime, Africa/Lagos ops interpretation) |
| Calculation     | Manual admin input in v1 — no auto business-day calculator                          |
| Overdue monitor | Deferred                                                                            |

## Deferred

- Carrier purchase, labels, webhooks (TTW-044)
- Multi-package UX (TTW-045)
- Organiser redacted shipment projection
- Outbox milestone/exception templates + overdue scheduler
- Admin console safe-next-action UI polish / Playwright matrix
- Formal product/ops/legal sign-off of SLAs and vocabulary
