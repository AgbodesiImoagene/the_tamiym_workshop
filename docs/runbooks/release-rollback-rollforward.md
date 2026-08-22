# Runbook — Release rollback and roll-forward

**Owner:** `platform-ops`  
**Ticket:** TTW-054  
**When:** Candidate deploy fails stop/go gates or production health degrades post-release

## Principles

- **Rollback** redeploys the previous known-good application image digests; it does **not** replay webhooks or queue jobs.
- **Schema rollback** is avoided; use **roll-forward** fixes when migration is not safely reversible.
- Financial, inventory, notification and media effects remain idempotent; never "undo" money by re-emitting provider events.

## Application rollback (digest-based)

1. Halt new traffic to unhealthy revision (load balancer / compose scale).
2. Redeploy **previous** manifest image digests (not rebuild from branch).
3. Confirm `/v1/health`, smoke tests, and reconciliation dashboards.
4. Record incident timeline and manifest SHAs.

## Queue, scheduler and webhook handling

| Component              | Rollback action                                                |
| ---------------------- | -------------------------------------------------------------- |
| BullMQ workers         | Drain or pause workers; let in-flight idempotent jobs complete |
| Cron schedulers        | Pause payout/reconciliation crons until health confirmed       |
| Paystack webhooks      | Keep endpoint up; idempotent handlers absorb retries           |
| Outbound notifications | Dead-letter queue per TTW-043; do not bulk replay              |

## Roll-forward recovery (preferred for schema)

1. Ship a forward migration fixing the defect.
2. Deploy new candidate through full rehearsal gates.
3. Reconcile money/inventory before resuming schedulers.

## Abort criteria for attempted rollback

- Previous digests unavailable or unverified
- Database schema incompatible with previous application
- Rollback would orphan in-flight payouts/refunds

## Related

- `docs/release/ttw-054-interim-policy.md`
- `infra/release/teardown-policy.json`
