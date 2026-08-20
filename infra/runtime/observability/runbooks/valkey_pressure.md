# Runbook: valkey_pressure

**Alert:** `valkey_pressure` · **Severity:** page · **Owner role:** `OWNER_PLACEHOLDER_PLATFORM`

## Symptoms

Valkey near `maxmemory` (256 mb), `OOM` / `noeviction` write errors, connection refusals, queue stalls.

## Immediate actions

1. Confirm Valkey container health and `INFO memory` (via docker exec as root/operator).
2. Check BullMQ failed/active counts; pause non-critical producers if needed.
3. Prefer draining failed jobs and fixing producers over raising memory blindly.
4. Restart Valkey only if process wedged — expect cache/queue loss; reconcile from PostgreSQL (app invariant).
5. Do not switch to `allkeys-lru` without design review (correctness risk).

## Escalation

Persistent pressure after drain → owner capacity review (budget vs correctness).

## Related

- TTW-064 Valkey contract; TTW-063 Compose `valkey` service.
