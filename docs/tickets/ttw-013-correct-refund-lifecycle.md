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

| Iteration | Reviewer                | Verdict | Notes                                                                        |
| --------- | ----------------------- | ------- | ---------------------------------------------------------------------------- |
| 1         | independent agents (×2) | FAIL    | Cap race, out-of-order throw, amount validation, stuck INITIATED retry, lint |
| 2         | independent agent       | FAIL    | Stale sweep releases the cap on ambiguous provider outcomes (see below)      |
| 3         | pending                 | —       | Cap-safe NEEDS_ATTENTION escalate; driving clear only; FAILED webhook match  |

### Iteration 2 findings (blocking)

1. **Ambiguous provider outcomes release the captured-value cap.** After a transient
   failure (or a crash mid-drive) the row is `INITIATED` with `providerRef` null or
   `driving:{id}` — a state where Paystack may already have accepted the refund.
   `failStaleInitiatedRefunds` flips it to `FAILED` after `STALE_INITIATED_MS`
   (45 s) and is now invoked both at `initiateRefund` start and by the 5-minute
   cron, so the reservation is released while the provider outcome is unknown.
   Reproduced end to end: provider pays the customer, the order stays `PAID`, no
   `REFUND_APPLIED` row is written, and a second full-amount refund is then
   accepted for the same capture (two provider calls, one captured value).
   Suggested direction: sweep ambiguous rows to `NEEDS_ATTENTION` (cap retained,
   operator resolves), or confirm with the provider (`GET /refund?transaction=`)
   before releasing the reservation.
2. **Late provider confirmation cannot be matched.** `settleRefundProcessed`
   deliberately accepts `FAILED → SUCCEEDED`, but `findRefundForWebhook`'s
   transaction-reference fallback filters `status in IN_FLIGHT` and the sweep nulls
   `providerRef`, so a `refund.processed` that arrives after the sweep is recorded
   as `unmatched` and dropped. Include `FAILED` in the fallback match so the
   reconciliation path is reachable.
3. **`initiateRefund` retry with the stable admin key is a permanent no-op.** The
   sweep runs before the idempotency lookup, so a human retry (> 45 s) finds a
   `FAILED` row and returns it with HTTP 200 without calling the provider. Because
   the admin client key is `admin-refund:{orderId}:{amount}:{reason}`, that
   (amount, reason) pair can never be refunded again from the UI, contradicting the
   documented "retry the same request" recovery for 409s.
4. **Stale sweep `updateMany` has no compare-and-swap guard.** The update matches on
   `id` only, so a refund that settles between the sweep's `SELECT` and `UPDATE` is
   rewritten to `FAILED` with `providerRef` null while its order/campaign/ledger
   effects remain applied — releasing the cap below the settled total. Repeat the
   select predicate (`status`, `providerRef`, `updatedAt`) in the update.

### Iteration 2 findings (non-blocking)

- `driveProviderForReservedRefund` posts the caller's `amount` rather than the
  reserved row's amount; the idempotency re-check inside `reserveRefundRow` does not
  re-validate `orderId`/`amount`, so a concurrent same-key/different-amount request
  can drive the provider for an amount the row does not record.
- `settleRefundProcessed` derives the next order status from an `order.status` read
  before the `FOR UPDATE` lock; re-read inside the transaction.
- The `driving:{refundId}` claim token is returned to the admin API/UI through
  `providerRef` (skip path plus `findOneForAdmin` selection).
- Two legitimately distinct partial refunds with the same amount and reason collapse
  onto one stable admin key and the second silently returns the first row.
- New `PARTIALLY_REFUNDED → CANCELLED` admin transition skips `cancelledAt` and
  inventory release and leaves the remaining balance unrefundable.
- Playwright specs assert the simulator fixture and a route-mocked response; no admin
  or customer UI state is exercised, and `refunds` are exposed only on
  `findOneForAdmin`.
- Migration backfill uses `refund.processed:{providerRef}` while runtime uses
  `refund.processed:{refundId}:{providerRef}`.
- `pnpm lint` fails (`refunds.service.spec.ts` template literal on `unknown`) and
  `pnpm format:check` fails on four files; both gates are clean on `main`.

## Verification evidence

- Unit: initiate/reuse/re-drive/transient/hard-fail/mismatch/out-of-order/CAS
- E2E: concurrent webhook settlement; concurrent initiation cap (8→1); partial status
- `pnpm coverage:diff` ≥80%; ratchet raised
- `pnpm lint` clean for TTW-013 files

## Completion summary

Pending merge after review PASS.
