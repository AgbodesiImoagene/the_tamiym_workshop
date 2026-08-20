# Runbook: webhook_failures

**Alert:** `webhook_failures` · **Severity:** ticket · **Owner role:** `OWNER_PLACEHOLDER_PLATFORM`

## Symptoms

Paystack webhook verify/settle failures or processing lag; settlement metrics show rejects.

## Immediate actions

1. Confirm API reachable publicly for webhook path; check recent deploy.
2. Inspect failure class: signature, duplicate, stale, unmatched (TTW-051 counters).
3. Do not log raw payment payloads; use opaque references only.
4. Reconcile unsettled charges via approved jobs/runbooks (financial tickets).
5. If secret rotated → owner updates Paystack + host secrets together.

## Escalation

Money movement ambiguity → critical financial owners; freeze related payouts if required.

## Related

- TTW-010–015 settlement; TTW-051 metrics.
