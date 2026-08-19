# TTW-010 — Make charge settlement exactly-once

**Epic:** 1 — Financial and inventory integrity  
**Status:** Not started  
**Risk:** Critical  
**Blocked by:** TTW-003  
**Blocks:** TTW-013, TTW-015, TTW-032

## Background

`charge.success` reads payment/order state before opening a transaction. Concurrent deliveries can both observe an unsettled payment and then each mark it paid, increment campaign `currentAmount`, and create a ledger credit. The ledger schema has indexes but no uniqueness constraint for this business effect.

## Proposal

Introduce an immutable provider-event/business-effect key and database uniqueness for payment settlement. Perform a conditional payment transition and all order/campaign/ledger/audit mutations in one transaction; a losing duplicate becomes a successful no-op. Keep notification dispatch idempotent through an outbox uniqueness key.

## Invariants

- One provider charge reference settles no more than one payment/order.
- One campaign order produces exactly one gross increment and one `PAYMENT_SETTLED` entry.
- Duplicate/concurrent valid events return success without repeating side effects.
- Amount, currency, expiry and cancelled-order guards remain enforced.

## Test and observability plan

- PostgreSQL integration: serial, duplicate, concurrent and reordered delivery.
- Failure: transaction rollback between each mutation leaves no partial settlement.
- Metrics distinguish first settlement, duplicate no-op and rejected mismatch.

## References

- `apps/api/src/orders/paystack-webhook.service.ts:79-257`.
- `apps/api/prisma/schema.prisma:1330-1351`.
- `apps/api/prisma/schema.prisma:1445-1468`.

## Acceptance criteria

- [ ] Migration enforces the settlement business key.
- [ ] Fifty concurrent identical events produce one settlement effect.
- [ ] Notifications/audit are emitted once and duplicates are observable.
- [ ] Rollback and migration rollback are tested/documented.
- [ ] Critical design, security and two independent implementation reviews pass.

## Out of scope

- Payout event idempotency → TTW-011.
