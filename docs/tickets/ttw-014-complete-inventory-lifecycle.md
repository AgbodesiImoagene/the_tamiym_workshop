# TTW-014 — Complete the inventory lifecycle

**Epic:** 1 — Financial and inventory integrity  
**Status:** Not started  
**Risk:** Critical  
**Blocked by:** TTW-003  
**Blocks:** TTW-040, TTW-041

## Background

Order creation atomically increases `reserved`, and unpaid cancellation releases it. No paid/admin transition decrements `reserved` and `stockOnHand`, so sold units remain reserved indefinitely and reported availability eventually becomes unusable.

## Proposal

Approve the business consumption point, then encode a database-safe inventory transition keyed to each order line. The likely default is to convert reservation to consumed stock once payment is settled, with compensating behaviour for confirmed cancellation/refund according to policy. Record immutable inventory movements or an equivalent auditable effect key.

## Invariants

- Each line follows exactly one path: reserve→release or reserve→consume.
- `reserved` and `stockOnHand` never become negative.
- Duplicate/concurrent order transitions cannot repeat inventory effects.
- Availability, low-stock notifications and admin displays use the same truth.

## Test and observability plan

- PostgreSQL concurrency tests for reserve, payment, expiry/cancel and duplicate transitions.
- Reconciliation test sums open reservations/movements against counters.
- Playwright checks out-of-stock and admin/customer consistency.

## References

- `apps/api/src/orders/orders.service.ts:440-466` — conditional reservation.
- `apps/api/src/orders/orders.service.ts:618-690` — admin transitions/release only.
- `apps/api/src/orders/order-expiry.service.ts:44-105` — expiry release.

## Acceptance criteria

- [ ] Product/operations owner approves reservation-consumption and return policy.
- [ ] Auditable, idempotent movement model and migration are implemented.
- [ ] Concurrent transitions preserve all invariants.
- [ ] Admin/customer availability and low-stock notifications agree.
- [ ] Critical design and two independent implementation reviews pass.

## Out of scope

- Physical return disposition → TTW-041.
