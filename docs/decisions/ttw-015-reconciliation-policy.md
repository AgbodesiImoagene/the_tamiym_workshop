# ADR: Money and inventory reconciliation (TTW-015)

**Status:** Accepted (agent + backlog owner default)  
**Date:** 2026-08-20  
**Ticket:** TTW-015

## Decisions

1. **Zero tolerance** for currency and unit discrepancies once outside the provider grace window.
2. **Schedules (Africa/Lagos):**
   - Internal: nightly `15 01 * * *`
   - Provider: daily `30 03 * * *` (after Paystack reporting lag)
3. **Grace window:** 24 hours for provider `PENDING_GRACE` on recent transfers/charges still settling.
4. **Severity:** currency/unit mismatch or missing settlement effect = `CRITICAL`; lag inside grace = `LOW` (`PENDING_GRACE`); incomplete provider pages = run `INCOMPLETE` (not reconciled).
5. **Ownership:** finance/ops on-call via existing admin notification channel; P0 = any open CRITICAL finding older than 4 hours without acknowledgement.
6. **Repair authority:** money or stock repairs require two distinct admins (requester ≠ approver). Acknowledgements need one admin.
7. **External authority:** Paystack transaction/refund/transfer APIs for provider runs. Bank statements are out of scope.
8. **Retention:** runs/findings retained 400 days; evidence stores hashes + ids only (no raw secrets/PII).

## Domains checked

Payment, refund, payout, campaign display vs ledger, inventory movement vs counters.

## Non-goals

Automatic repairs from cron. Exactly-once source effects remain TTW-010–014.
