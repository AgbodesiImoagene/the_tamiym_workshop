# Runbook: PostgreSQL restore

**Ticket:** TTW-067 · **Alert cues:** `postgres_down`, `backup_stale`

## Detection

- Managed PostgreSQL unavailable, connection failures from API ready probe, or
  confirmed corruption / accidental destructive DDL.
- `backup_stale` pages when PITR window or backup age exceeds approved RPO.

## Authorization

1. Owner selects recovery point (PITR timestamp or offsite logical export id).
2. **First restore destination must be isolated** (`temporary-validation` or
   recovery-tagged cluster) unless the owner explicitly authorizes production
   overwrite with dual confirmation.
3. Set `RESTORE_CONFIRM_TARGET` to the **exact** restore cluster name.
4. Backup deletion credentials must not be the workload/deploy identity.

## Restore paths

### A. Managed PITR (preferred for ≤15m RPO)

1. Use DigitalOcean control plane / API to restore to a **new** cluster at
   the chosen timestamp (do not destroy the failed cluster until validated).
2. Point temporary API stack at the restored private host (secrets injected).
3. Run `infra/runtime/backup/invariants/post-restore-queries.sql`.
4. Compare counts/checksums to pre-incident evidence.
5. Only then cut application `DATABASE_URL` / firewall bindings to the restored
   cluster (human confirmation).

### B. Off-provider logical export

1. Fetch encrypted artefact from `OFFSITE_DEST` (identity with restore rights).
2. Decrypt offline; `pg_restore` into isolated cluster.
3. Same invariant queries + evidence compare.
4. Note: logical restore RPO is bounded by last successful export (daily at
   launch) — may be worse than PITR.

## Forbidden

- Replay Paystack webhooks or payout jobs to “catch up” without idempotency
  proof (TTW-010–015).
- Deleting the last known-good backup to free space during an incident.

## Validation

- SELECT-only invariant file; application smoke against isolated stack.
- Record backup id, restore start/end UTC, achieved RPO/RTO.
- If RPO/RTO unmet → open blocking follow-up ticket.

## Related

- Export sketch: `../scripts/pg-logical-export.sh`
- Checklist: `../scripts/restore-isolated-check.sh`
- Alert runbook: `../../observability/runbooks/backup_stale.md`
