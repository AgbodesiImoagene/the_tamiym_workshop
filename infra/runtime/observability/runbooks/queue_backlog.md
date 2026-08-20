# Runbook: queue_backlog

**Alert:** `queue_backlog` · **Severity:** ticket · **Owner role:** `OWNER_PLACEHOLDER_PLATFORM`

## Symptoms

BullMQ depth or failed-job rate above threshold; delayed mail/media/payout jobs.

## Immediate actions

1. Identify queue name and failure reason (redacted logs / metrics).
2. Confirm `worker` healthy and Valkey reachable.
3. Retry safe failed jobs; dead-letter poison messages per app runbooks.
4. Pause producers only if Valkey/DB at risk.
5. Correlate with recent deploy revision.

## Escalation

Financial job failures (payouts/settlement) → critical path owners / TTW-015 style reconciliation.

## Related

- TTW-051 queue metrics; TTW-063 worker role.
