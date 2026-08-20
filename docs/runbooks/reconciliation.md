# Runbook: Reconciliation (TTW-015)

## Missed schedule

1. Check cron pods / API process uptime around `01:15` (internal) and `03:30` (provider) Africa/Lagos.
2. Trigger manually: `POST /v1/admin/reconciliation/runs/internal` or `/runs/provider`.
3. Confirm a new `ReconciliationRun` row with unique `windowKey`.

## Incomplete provider run

1. Status `INCOMPLETE` means Paystack pagination/fetch failed closed — never treat as reconciled.
2. Inspect `errorSummary`, retry provider run after Paystack recovers.
3. Do not close CRITICAL findings based on an incomplete run.

## Open CRITICAL finding

1. Acknowledge with incident link (`POST .../findings/:id/acknowledge`).
2. Request repair with an approved `commandKey` (first admin).
3. Second distinct admin approves (`POST .../repairs/:id/approve`).
4. Targeted verification run is scheduled automatically after apply.

## Emergency SQL

Only with an incident record. After any direct SQL, run internal reconciliation and attach the run id to the incident.
