# TTW-012 — Serialize payment initiation

**Epic:** 1 — Financial and inventory integrity  
**Status:** Complete  
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

## References

- `apps/api/src/orders/payments.service.ts`
- `apps/api/src/orders/paystack-transaction.client.ts`
- `apps/api/prisma/migrations/20260819140000_ttw012_serialize_payment_initiation/`

## Acceptance criteria

- [x] Database enforcement prevents two active attempts.
- [x] Concurrent identical requests yield one provider initialization.
- [x] Retry/expiry/reconciliation behaviour is documented and tested.
- [x] API contract and Playwright payment-retry coverage are updated.
- [x] Critical design and two independent implementation reviews pass.

## Out of scope

- Charge settlement effects → TTW-010.

## Design review

**Reviewer:** implementing agent (TTW-012)  
**Date:** 2026-08-19  
**Verdict:** Proceed

### Timing

| Constant           | Value              | Role                                                            |
| ------------------ | ------------------ | --------------------------------------------------------------- |
| Initialize timeout | 20s                | Abort hung Paystack calls as transient                          |
| Reconcile after    | 25s                | Same-ref initialize only after winner cannot still be in flight |
| Stale PENDING      | 45s                | Fail PENDING so a new attempt may start                         |
| Attempt TTL        | 30m (configurable) | Expire INITIATED sessions                                       |

### Algorithm

1. Validate order ownership and `PENDING_PAYMENT`.
2. Active `INITIATED` with URL → **reused**.
3. Expired / null-TTL-via-`createdAt` / stale `PENDING` (>45s) → mark `FAILED` (**PENDING-only** for stale), continue.
4. Fresh `PENDING` → poll for `INITIATED` (no provider call); else **409**.
5. Insert `PENDING` with stable `providerRef`. `P2002` → re-enter.
6. **Only the insert winner** (or same-ref reconcile after 25s) calls Paystack.
7. Success → `INITIATED`. Hard 4xx → fail **PENDING** only. 5xx/timeout/duplicate-ref → **409**, keep PENDING.

## Migration forward / rollback

**Forward:** `20260819140000_ttw012_serialize_payment_initiation`  
`pnpm --filter api exec prisma migrate deploy`

**Rollback (manual):**

```sql
DROP INDEX IF EXISTS "payments_one_active_attempt_per_order";
DROP INDEX IF EXISTS "payments_expiresAt_idx";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "authorizationUrl";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "accessCode";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "expiresAt";
```

## Implementation reviews

| Iteration | Reviewer           | Verdict | Notes                                                                |
| --------- | ------------------ | ------- | -------------------------------------------------------------------- |
| 1–2       | independent agents | FAIL    | Concurrent re-init could wipe INITIATED                              |
| 3–5       | independent agents | FAIL    | Reconcile window / hard-fail scope / OpenAPI                         |
| 6–7       | independent agents | PASS    | 25s reconcile, PENDING-only fail, single-flight, e2e 1 provider call |

## Verification evidence

- Unit + E2E ×2 (50 concurrent → 1 payment, 1 provider call)
- Playwright simulator + route-mocked API retry contract
- `pnpm coverage:diff` ≥80%; ratchet raised

## Completion summary

Serialized Paystack payment initiation with one active attempt and single-flight provider initialize. Next: TTW-013.
