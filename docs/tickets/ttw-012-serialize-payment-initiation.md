# TTW-012 — Serialize payment initiation

**Epic:** 1 — Financial and inventory integrity  
**Status:** Not started  
**Risk:** Critical  
**Blocked by:** TTW-003  
**Blocks:** TTW-032

## Background

Payment initiation checks for an existing INITIATED row, calls Paystack, and inserts the payment afterward. Concurrent requests can both pass the check and create multiple customer payment sessions for one order.

## Proposal

Reserve an attempt atomically before the provider call using an order-scoped idempotency key and database-enforced active-attempt rule. Make retries return the same valid authorization result or transition an expired/failed attempt through an explicit state machine. Reconcile provider success when the response is lost after initialization.

## Invariants

- At most one active payment attempt exists for an order.
- Repeating the same request cannot create another provider transaction.
- A lost provider response can be reconciled without leaving an immortal lock.

## Test and observability plan

- Concurrent PostgreSQL test with delayed provider simulator.
- Timeout, provider 4xx/5xx, lost response and expired-attempt recovery.
- Metric attempt-created/reused/blocked/reconciled outcomes.

## References

- `apps/api/src/orders/payments.service.ts:37-135`.
- `apps/api/prisma/schema.prisma:1330-1351`.

## Acceptance criteria

- [ ] Database enforcement prevents two active attempts.
- [ ] Concurrent identical requests yield one provider initialization.
- [ ] Retry/expiry/reconciliation behaviour is documented and tested.
- [ ] API contract and Playwright payment-retry coverage are updated.
- [ ] Critical design and two independent implementation reviews pass.

## Out of scope

- Charge settlement effects → TTW-010.
