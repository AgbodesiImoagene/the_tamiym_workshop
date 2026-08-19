# TTW-013 — Correct the refund lifecycle

**Epic:** 1 — Financial and inventory integrity  
**Status:** Not started  
**Risk:** Critical  
**Blocked by:** TTW-003, TTW-010  
**Blocks:** TTW-015, TTW-033, TTW-041

## Background

The current service marks a refund SUCCEEDED immediately when Paystack accepts the request, marks the entire order REFUNDED for any amount, and adjusts campaign/ledger totals immediately. It neither handles provider refund events nor permits safe cumulative partial refunds.

## Proposal

Model initiated, processing, succeeded and failed provider states; record an idempotent refund request before/with provider initiation; apply financial effects only on confirmed success. Track cumulative succeeded/in-flight amounts, distinguish partially and fully refunded orders in API/UI, and define failure/retry/reconciliation behaviour.

## Invariants

- Succeeded plus in-flight refunds never exceed captured value.
- Campaign/display/ledger values change once, only after provider-confirmed success.
- Partial refunds do not falsely present the whole order as fully refunded.
- Duplicate/concurrent requests and webhooks cannot duplicate effects.

## Test and observability plan

- Integration matrix: partial, multiple partial, full, duplicate, concurrent, failure, delayed and out-of-order events.
- Playwright: admin initiates and customer sees pending/partial/full states.
- Alert for refund stuck in non-terminal state or provider/local mismatch.

## References

- `apps/api/src/orders/refunds.service.ts:50-204`.
- `apps/api/prisma/schema.prisma:1354-1374`.

## Acceptance criteria

- [ ] Product owner approves partial/full/cancellation and fee semantics.
- [ ] Migration/API/UI represent pending, partial and full outcomes accurately.
- [ ] Provider-confirmed idempotent settlement and cumulative caps are DB-backed.
- [ ] Reconciliation, notifications, integration and Playwright tests pass.
- [ ] Critical design, security and two independent implementation reviews pass.

## Out of scope

- Returns and post-fulfilment stock disposition → TTW-041.
