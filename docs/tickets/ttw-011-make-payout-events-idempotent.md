# TTW-011 — Make payout events exactly-once

**Epic:** 1 — Financial and inventory integrity  
**Status:** Not started  
**Risk:** Critical  
**Blocked by:** TTW-003  
**Blocks:** TTW-015, TTW-042

## Background

Every matching transfer webhook writes a terminal status and then adds a ledger success or release entry. Duplicate failed/reversed events can repeatedly add positive releases; out-of-order events can also overwrite a terminal payout inconsistently.

## Proposal

Define the allowed payout transition graph and provider-event identity. Apply conditional transitions, event recording, ledger effect and run completion atomically. Enforce one reserve, one terminal effect and at most one release per payout in PostgreSQL. Explicitly define precedence for success, failure and reversal.

## Invariants

- A payout reserve is deducted exactly once.
- A failed/reversed reserve is released at most once.
- Success never releases funds; reversal semantics follow the approved transition graph.
- Duplicate/out-of-order events are acknowledged without changing reconciled balances.

## Test and observability plan

- PostgreSQL integration matrix for duplicate/concurrent/out-of-order success, failure and reversal.
- Crash tests around provider call, status mutation, ledger effect and run completion.
- Metrics/alerts for ignored stale transitions and unreconciled reservations.

## References

- `apps/api/src/orders/paystack-webhook.service.ts:296-331`.
- `apps/api/src/payouts/campaign-ledger.service.ts:96-187`.
- `apps/api/prisma/schema.prisma:1547-1590`.

## Acceptance criteria

- [ ] State graph and provider-event precedence are documented.
- [ ] Database constraints make duplicate ledger effects impossible.
- [ ] Concurrency and crash-recovery integration tests pass.
- [ ] Run status and eligible balance reconcile after every tested sequence.
- [ ] Critical design, security and two independent implementation reviews pass.

## Out of scope

- Scheduled reconciliation/reporting → TTW-015.
