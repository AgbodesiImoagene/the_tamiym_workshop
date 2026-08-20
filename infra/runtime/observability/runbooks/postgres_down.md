# Runbook: postgres_down

**Alert:** `postgres_down` · **Severity:** page · **Owner role:** `OWNER_PLACEHOLDER_PLATFORM`

## Symptoms

Managed PostgreSQL unavailable; `/v1/health/ready` 503; API/worker errors connecting to DB.

## Immediate actions

1. Confirm DO Managed Database status and maintenance windows (lon1).
2. Verify Droplet can reach private host:25060 (VPC / DB firewall tags — TTW-064).
3. Check app `DATABASE_URL` still points at private URI (no public exposure).
4. If provider incident → wait/communicate; do not open `0.0.0.0/0` on DB firewall.
5. If credentials revoked → owner vault rotation ceremony (TTW-065); never paste secrets into tickets.

## Escalation

Failover / restore decisions → TTW-067; owner approval required for PITR or cluster recreate.

## Related

- `docs/infrastructure/ttw-064-data-services.md`
