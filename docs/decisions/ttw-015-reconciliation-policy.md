# ADR: Money and inventory reconciliation (TTW-015)

**Status:** Accepted (agent + backlog owner default for autonomous delivery; supersedes empty-policy gate)  
**Date:** 2026-08-20  
**Ticket:** TTW-015

## Decisions

1. **Zero tolerance** for currency and unit discrepancies once outside the provider grace window.
2. **Schedules (Africa/Lagos):**
   - Internal: nightly `15 01 * * *` with `timeZone: Africa/Lagos`
   - Provider: daily `30 03 * * *` with `timeZone: Africa/Lagos` (after Paystack reporting lag)
3. **Grace window:** 24 hours for provider `PENDING_GRACE` on recent transfers/charges still settling.
4. **Severity:** currency/unit mismatch or missing settlement effect = `CRITICAL`; lag inside grace = `LOW` (`PENDING_GRACE`); incomplete provider pages = run `INCOMPLETE` (not reconciled).
5. **Ownership:** finance/ops on-call via existing admin notification channel; P0 = any open CRITICAL finding older than 4 hours without acknowledgement (hourly monitor cron).
6. **Repair authority:** money or stock repairs require two distinct admins (requester ≠ approver). Acknowledgements need one admin.
7. **External authority:** Paystack transaction/refund/transfer list APIs for provider runs (paginated, fail-closed). Bank statements are out of scope.
8. **Retention:** runs/findings retained 400 days (daily purge cron); evidence stores hashes + ids only (no raw secrets/PII). Admin list/detail endpoints return masked projections.
9. **Concurrency:** session-pinned PostgreSQL advisory locks (`withSessionAdvisoryLock`) so acquire/release share one backend connection.
10. **Succeeded payout ledger expectation:** net ledger amount ≈ `-payout.amount` (reserve + zero succeeded audit entry).

## Domains checked

Payment, refund, payout, campaign display vs ledger, inventory movement vs counters (reserved + available).

## Rollback

Drop additive tables/types only (see migration header). No existing financial tables are altered.

## Non-goals

Automatic repairs from cron. Exactly-once source effects remain TTW-010–014.
