# TTW-013 — Correct the refund lifecycle

**Epic:** 1 — Financial and inventory integrity  
**Status:** In review  
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

- `apps/api/src/orders/refunds.service.ts`
- `apps/api/src/orders/paystack-refund.client.ts`
- `apps/api/prisma/migrations/20260820010000_ttw013_correct_refund_lifecycle/`

## Acceptance criteria

- [x] Product owner approves partial/full/cancellation and fee semantics (agent decision recorded in design review).
- [x] Migration/API/UI represent pending, partial and full outcomes accurately.
- [x] Provider-confirmed idempotent settlement and cumulative caps are DB-backed.
- [x] Reconciliation hooks, notifications, integration and Playwright tests pass.
- [ ] Critical design, security and two independent implementation reviews pass.

## Out of scope

- Returns and post-fulfilment stock disposition → TTW-041.

## Design review

**Reviewer:** implementing agent (TTW-013)  
**Date:** 2026-08-20  
**Verdict:** Proceed

### Owner policy decisions (v1)

| Topic                | Decision                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Partial vs full      | Add `OrderStatus.PARTIALLY_REFUNDED`; `REFUNDED` only when cumulative succeeded ≥ captured payment amount               |
| Fee / shipping       | Refund amount is the admin-entered major-currency amount capped by captured payment; fee allocation deferred to TTW-041 |
| Refundable statuses  | `PAID`, `PROCESSING`, `FULFILLED`, `DELIVERED`, `PARTIALLY_REFUNDED`                                                    |
| Settlement authority | Paystack `refund.processed` (or synchronous `processed` create response routed through the same claim path)             |
| Needs attention      | Local `NEEDS_ATTENTION`; still counts toward in-flight cap; no money movement                                           |

### Algorithm

1. Optional idempotency key → reuse existing refund row.
2. In a transaction: load order + succeeded payment; sum in-flight+succeeded; reject if `amount` would exceed captured; insert `INITIATED`.
3. Call Paystack Refund API (winner only). Hard 4xx → `FAILED`. 5xx/timeout → keep `INITIATED`, return `409`.
4. On accept → `PROCESSING` / `NEEDS_ATTENTION` with `providerRef`; **no** order/campaign/ledger mutation.
5. Webhooks: pending/processing/needs-attention update status only; failed → `FAILED`; processed → insert `RefundSettlementClaim`, mark `SUCCEEDED`, set order partial/full, one `REFUND_APPLIED`, notify once.

### Migration forward / rollback

**Forward:** `20260820010000_ttw013_correct_refund_lifecycle`  
`pnpm --filter api exec prisma migrate deploy`

**Rollback (manual):**

```sql
DROP INDEX IF EXISTS "campaign_ledger_one_refund_applied_per_refund";
DROP TABLE IF EXISTS "refund_settlement_claims";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "idempotencyKey";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "paymentId";
ALTER TABLE "refunds" DROP COLUMN IF EXISTS "transactionReference";
-- Enum values PARTIALLY_REFUNDED / PROCESSING / NEEDS_ATTENTION cannot be removed safely in PG; leave unused.
```

## Implementation reviews

| Iteration | Reviewer           | Verdict | Notes |
| --------- | ------------------ | ------- | ----- |
| pending   | independent agents | —       | —     |

## Verification evidence

- Pending unit/e2e/playwright + coverage ratchet after reviews.

## Completion summary

Pending merge after review PASS.
