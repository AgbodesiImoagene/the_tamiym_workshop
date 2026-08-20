# Runbook: container_unhealthy

**Alert:** `container_unhealthy` · **Severity:** page · **Owner role:** `OWNER_PLACEHOLDER_PLATFORM`

## Symptoms

Compose healthcheck failing; restart loops; role missing from `docker compose ps`.

## Immediate actions

1. Identify which service fails (`api`, `worker`, `scheduler`, frontends, `valkey`, `proxy`).
2. Read recent logs without dumping secrets; check `API_ROLE` and env_file mount.
3. For `api`/`worker`/`scheduler`: distinguish live vs ready (DB/Valkey dependency).
4. Restore dependency first; then recreate the unhealthy service with known-good digest.
5. Confirm singleton `scheduler` is not duplicated.

## Escalation

Image/registry pull failures → owner GHCR credentials / digest pin check (TTW-063).

## Related

- TTW-063 health semantics; runtime Compose.
