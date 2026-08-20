# Runbook: Reconciliation (TTW-015)

## Missed schedule

1. Check cron pods / API process uptime around `01:15` (internal) and `03:30` (provider) Africa/Lagos.
2. Hourly monitor emits `MISSED_SCHEDULE` when the expected `windowKey` row is absent after the grace hour.
3. Trigger manually: `POST /v1/admin/reconciliation/runs/internal` or `/runs/provider`.
4. Confirm a new `ReconciliationRun` row with unique `windowKey`. Session advisory locks are connection-pinned; if a prior process died mid-run, wait for the Postgres backend to release the lock or restart that connection.

## Incomplete provider run

1. Status `INCOMPLETE` means Paystack pagination/fetch failed closed — never treat as reconciled.
2. Inspect `errorSummary` and `cursor` page counts; retry provider run after Paystack recovers.
3. Do not close CRITICAL findings based on an incomplete run.

## Open CRITICAL finding

1. Acknowledge with incident link (`POST .../findings/:id/acknowledge`).
2. Request repair with an approved `commandKey` (first admin).
3. Second distinct admin approves (`POST .../repairs/:id/approve`).
4. Targeted verification run runs automatically; mutating repairs close only after verification.
5. P0: unacknowledged CRITICAL older than 4 hours triggers `STALE_CRITICAL` via the hourly monitor.
