# TTW-045 — Support partial and multi-package shipments

**Epic:** 4 — Fulfilment, support and business policy\
**Status:** Deferred — post-v1\
**Risk:** High\
**Blocked by:** TTW-014, TTW-040, TTW-044\
**Blocks:** TTW-047

## Background

TTW-040 reserves a one-to-many shipment schema but limits v1 to one active outbound shipment per order. That policy cannot represent split fulfilment, backordered lines, multiple parcels or independently delivered quantities. Simply removing the limit would leave ambiguous item allocation, completion, notification and return eligibility.

## Proposal

Add immutable shipment-line allocations that assign exact order-item quantities to outbound packages. Introduce a server-derived fulfilment summary per item and order (`UNALLOCATED`, `PARTIALLY_ALLOCATED`, `ALLOCATED`, `PARTIALLY_DISPATCHED`, `PARTIALLY_DELIVERED`, `DELIVERED`) while each package retains the TTW-040 physical lifecycle. Require operations to resolve over/under-allocation before dispatch and derive commercial order summaries only from quantity-complete package evidence.

## Invariants

- Across non-cancelled outbound shipments, allocated quantity for an order item never exceeds its ordered quantity.
- A package cannot dispatch with zero lines, invalid parcel data or quantities not atomically reserved to it.
- Cancelling a non-dispatched package releases only its allocations; dispatched quantities require an explicit return/resolution path.
- Order delivery requires every non-cancelled quantity to be delivered or resolved by an approved TTW-041 disposition.
- Each package has its own tracking/events; one delivered package never marks remaining packages delivered.
- Concurrent allocation/dispatch operations cannot duplicate quantities or milestone notifications.

## Implementation plan

1. Approve split triggers, backorder policy, partial-notification cadence, promised dates, customer cancellation choices and order-completion rules.
2. Add shipment-line allocation and parcel models/constraints plus derived fulfilment projections; migrate existing single shipments to documented whole-order allocations where safe.
3. Implement transactional allocate/move/release/dispatch commands with row locking or equivalent database enforcement against over-allocation.
4. Extend carrier purchase to one provider shipment per package and preserve purchase idempotency per package.
5. Add admin package planning UI with unallocated quantities, parcel/service data, safe movement before dispatch and immutable history after dispatch.
6. Extend customer and organiser-redacted contracts/UI with package summaries, per-line progress and clear partial-delivery copy.
7. Connect partial delivery to TTW-041 eligibility and TTW-047 return quantities without inferring refunds or stock restoration.
8. Update notifications, Swagger, shared contracts, warehouse/support runbooks and historical rollback strategy.

## Test and observability plan

- Unit/component: allocation arithmetic, summary derivation, cancellation/reallocation rules and accessible package timelines.
- Integration/e2e: constraints, two-package dispatch/delivery, package cancellation, carrier references, ownership/redaction and resolution linkage.
- Failure, retry, and concurrency: two admins allocate the last quantity, dispatch races reallocation, duplicate carrier purchase/event and one package exception while another delivers.
- Playwright: admin splits an order into two packages; customer sees independent tracking and partial delivery; final delivery appears only after both resolve.
- Logs, metrics, traces, and alerts: packages/order, unallocated age, split lead time, partial-delivery age, exceptions and rejected allocation transitions without PII.

## References

- `docs/tickets/ttw-040-add-shipment-lifecycle.md` — v1 permits one active outbound shipment while requiring a future-safe one-to-many schema.
- `apps/api/prisma/schema.prisma:1286-1334` — order items store ordered quantity but have no shipment allocation relation.
- `apps/api/prisma/schema.prisma:75-85` — the order status enum cannot express partial dispatch or delivery.

## Acceptance criteria

- [ ] Product/operations approve split, backorder, notification, cancellation and completion policy.
- [ ] Database/service enforcement prevents over-allocation and dispatch of invalid/unallocated packages under concurrency.
- [ ] Existing eligible shipments migrate safely and rollback does not lose package/allocation evidence.
- [ ] Admin can plan and progress multiple packages; customer and organiser see accurate, appropriately redacted partial state.
- [ ] Carrier purchase, notifications, returns and order summaries operate per package/quantity without duplicate effects.
- [ ] Integration and Playwright split/exception/concurrency coverage pass.
- [ ] High-risk design, security and independent implementation reviews pass.

## Out of scope

- Warehouse management, pick waves and bin locations → future warehouse epic.
- Cross-order shipment consolidation → future fulfilment optimization ticket.
- Return labels/disposition → TTW-041 and TTW-047.

## Design review

Pending. Include quantity invariants, schema/database enforcement, state derivation, concurrency diagrams, carrier mapping, migration and customer/support UX.

## Implementation reviews

Pending. Require independent implementation and security/integrity reviews.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
