# Runbook — Release database migration

**Owner:** `platform-backend`  
**Ticket:** TTW-054  
**When:** Deploying a candidate that includes new Prisma migrations

## Preconditions

- Verified restorable backup completed and spot-checked (slice 2 live drill)
- Application **previous** version compatible with forward migration plan documented
- Maintenance window communicated if user-visible downtime expected
- Queues/schedulers reviewed per `release-rollback-rollforward.md`

## Forward migration (temporary validation or production)

```bash
# Against target DATABASE_URL (confirm host/database name triple-checked)
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma migrate status
```

Expect: all migrations applied; no pending migrations; `status` reports database schema up to date.

CI proof (TTW-054 slice 2): the `migration-baseline` job in `.github/workflows/ci.yml` runs
`pnpm release:verify-migrations` on blank and snapshot PostgreSQL databases, then
`prisma migrate diff --exit-code` to fail on drift.

Local:

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tamiym_workshop_blank?schema=public
pnpm release:verify-migrations
```

## Compatibility window

1. Deploy migration while previous app version still running **only** when migration is backward-compatible (expand-only).
2. Deploy new application code after migration when breaking schema changes require it.
3. Never run backward-incompatible app before migration completes.

## Abort criteria

- `migrate deploy` non-zero exit
- Migration lock mismatch or drift detected
- Unexpected row locks or migration duration beyond approved window
- Reconciliation or money-movement alerts fire during migration

## Recovery

- **Do not** manually edit production schema without a reviewed roll-forward script.
- If migration partially applied: stop traffic, assess `prisma migrate status`, execute approved roll-forward recovery ticket.
- Restore from backup only when roll-forward is unsafe and data loss is within approved RPO (human authorization required).

## Related

- `apps/api/prisma/migrations/`
- `pnpm release:check-migrations`
