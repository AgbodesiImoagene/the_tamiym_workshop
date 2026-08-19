# TTW-011 — Make payout events exactly-once

**Epic:** 1 — Financial and inventory integrity  
**Status:** Complete  
**Risk:** Critical  
**Blocked by:** TTW-003, TTW-010  
**Blocks:** TTW-015, TTW-042

## Background

Every matching transfer webhook writes a terminal status and then adds a ledger success or release entry. Duplicate failed/reversed events can repeatedly add positive releases; out-of-order events can also overwrite a terminal payout inconsistently.

## Proposal

Define the allowed payout transition graph and provider-event identity. Apply conditional transitions, event recording, ledger effect and run completion atomically. Enforce one reserve, one terminal effect and at most one release per payout in PostgreSQL. Explicitly define precedence for success, failure and reversal. Admin retry of a failed run payout creates a **new** payout row so uniqueness constraints remain intact; ambiguous local failures reuse the Paystack body `reference`.

## Invariants

- A payout reserve is deducted exactly once **per payout id**.
- A failed/reversed reserve is released at most once per payout id.
- Success never releases funds; reversal semantics follow the approved transition graph.
- Duplicate/out-of-order events are acknowledged without changing reconciled balances.
- Concurrent sibling terminals in a run still reach `COMPLETED` (run-row `FOR UPDATE`).

## Test and observability plan

- PostgreSQL integration matrix for duplicate/concurrent/out-of-order success, failure and reversal (including concurrent success+reverse and multi-payout run completion).
- Crash recovery: settlement mutations share one Prisma `$transaction` (status + ledger + claim + run); failures roll back together. Notify/metrics only after commit.
- Metrics: `payout_transfer_event_total{outcome=applied|duplicate|stale}`.

## References

- `apps/api/src/payouts/payout-transfer-transitions.ts`
- `apps/api/src/payouts/payouts.service.ts` (`applyTransferWebhookEvent`, `initiateTransfer`)
- `apps/api/src/payouts/payout-runs.service.ts` (`retryPayout`)
- `apps/api/src/payouts/paystack-transfer-reference.ts`
- `apps/api/prisma/migrations/20260819130000_ttw011_payout_events_idempotency/`

## Acceptance criteria

- [x] State graph and provider-event precedence are documented.
- [x] Database constraints make duplicate ledger effects impossible.
- [x] Concurrency and crash-recovery integration tests pass.
- [x] Run status and eligible balance reconcile after every tested sequence.
- [x] Critical design, security and two independent implementation reviews pass.

## Out of scope

- Scheduled reconciliation/reporting → TTW-015.

## Design review

**Reviewer:** implementing agent (TTW-011)  
**Date:** 2026-08-19  
**Verdict:** Proceed

### State graph and precedence

| From ↓ / To →          | SUCCEEDED                      | FAILED          | REVERSED                        |
| ---------------------- | ------------------------------ | --------------- | ------------------------------- |
| INITIATED / PROCESSING | apply + `PAYOUT_SUCCEEDED` (0) | apply + release | apply + release                 |
| SUCCEEDED              | duplicate                      | **stale**       | apply + release                 |
| FAILED                 | **stale**                      | duplicate       | status-only (no second release) |
| REVERSED / CANCELLED   | stale                          | stale           | duplicate                       |

Success never credits balance back. Release is at most one `PAYOUT_FAILED` row per payout. Lost optimistic updates re-read and re-apply when the new status remains an allowed source.

## Migration forward / rollback

**Forward:** `20260819130000_ttw011_payout_events_idempotency`  
`pnpm --filter api exec prisma migrate deploy`

**Rollback (manual):**

```sql
DROP INDEX IF EXISTS "campaign_ledger_one_payout_reserved_per_payout";
DROP INDEX IF EXISTS "campaign_ledger_one_payout_succeeded_per_payout";
DROP INDEX IF EXISTS "campaign_ledger_one_payout_failed_release_per_payout";
ALTER TABLE "payout_provider_event_claims" DROP CONSTRAINT IF EXISTS "payout_provider_event_claims_payoutId_fkey";
DROP TABLE IF EXISTS "payout_provider_event_claims";
```

Prefer backup restore over partial reverse after production traffic.

## Implementation reviews

| Iteration | Reviewer           | Verdict | Notes                                                                                          |
| --------- | ------------------ | ------- | ---------------------------------------------------------------------------------------------- |
| 1–2       | independent agents | FAIL    | Unique reserve vs retry; CAS miss; applied-before-commit; multi-payout COMPLETED race          |
| 3–4       | independent agents | FAIL    | Double retry of FAILED; COMPLETED reopen stuck EXECUTING on inline failure                     |
| 5         | independent agents | FAIL    | Ambiguous retry needed Paystack body `reference`, not header-only                              |
| 6–7       | independent agents | PASS    | Successor + CANCELLED lock; CAS; run FOR UPDATE; body reference; markRunCompletedIfAllTerminal |

## Verification evidence

- Unit: transitions, reference mapper, `applyTransferWebhookEvent` matrix (incl. CAS retry), retryPayout, ledger tx helpers
- E2E ×2: 50× concurrent `transfer.failed`; success→failed stale; concurrent success+reverse; multi-payout run COMPLETED
- `pnpm coverage:diff` ≥80% on changed lines; ratchet floors raised to measured

## Completion summary

Exactly-once Paystack transfer webhook application with transition graph, ledger uniqueness, event claims, run completion, metrics, and safe admin retry. Next: TTW-012.
