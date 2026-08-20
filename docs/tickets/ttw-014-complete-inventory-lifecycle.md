# TTW-014 — Complete the inventory lifecycle

**Epic:** 1 — Financial and inventory integrity  
**Status:** Complete  
**Risk:** Critical  
**Blocked by:** TTW-003  
**Blocks:** TTW-040, TTW-041

## Background

Order creation atomically increases `reserved`, and unpaid cancellation releases it. No paid/admin transition decremented `reserved` and `stockOnHand`, so sold units remained reserved indefinitely and reported availability eventually became unusable.

## Proposal

Approve the business consumption point, then encode a database-safe inventory transition keyed to each order line. The likely default is to convert reservation to consumed stock once payment is settled, with compensating behaviour for confirmed cancellation/refund according to policy. Record immutable inventory movements or an equivalent auditable effect key.

## Decision (accepted)

See `docs/decisions/ttw-014-inventory-consumption-policy.md`:

- Consume on `charge.success` settlement (same transaction as order `PAID`).
- Release on unpaid cancel/expiry only.
- No automatic restock on refund (TTW-041).
- Exactly-once `InventoryMovement.effectKey` per line path.

## Invariants

- Each line follows exactly one path: reserve→release or reserve→consume.
- `reserved` and `stockOnHand` never become negative.
- Duplicate/concurrent order transitions cannot repeat inventory effects.
- Availability, low-stock notifications and admin displays use the same truth.

## Implementation

- Migration `20260820020000_ttw014_inventory_lifecycle` — `InventoryMovement` + `InventoryMovementKind`.
- `InventoryLifecycleService` — reserve / release / consume with guarded SQL + unique effect keys.
- Wired from order create, unpaid admin cancel, order expiry, and Paystack `charge.success`.
- Metrics: `inventory_movement_total{kind,outcome}`.

## Test and observability plan

- PostgreSQL concurrency tests for reserve, payment, expiry/cancel and duplicate transitions.
- Reconciliation test sums open reservations/movements against counters.
- Playwright checks out-of-stock and admin/customer consistency.

## References

- `apps/api/src/inventory/inventory-lifecycle.service.ts`
- `apps/api/src/orders/orders.service.ts` — create reserve + unpaid release.
- `apps/api/src/orders/order-expiry.service.ts` — expiry release.
- `apps/api/src/orders/paystack-webhook.service.ts` — consume on settlement.
- `apps/api/test/inventory-lifecycle.e2e-spec.ts`
- `tests/e2e/journeys/inventory-lifecycle.smoke.spec.ts`

## Acceptance criteria

- [x] Product/operations owner approves reservation-consumption and return policy.
- [x] Auditable, idempotent movement model and migration are implemented.
- [x] Concurrent transitions preserve all invariants.
- [x] Admin/customer availability and low-stock notifications agree.
- [x] Critical design and two independent implementation reviews pass.

## Out of scope

- Physical return disposition → TTW-041.
- Historical PAID backfill → TTW-015 repair.
