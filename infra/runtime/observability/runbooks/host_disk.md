# Runbook: host_disk

**Alert:** `host_disk` · **Severity:** page · **Owner role:** `OWNER_PLACEHOLDER_PLATFORM`

## Symptoms

Droplet disk ≥85% or inode exhaustion; writes failing; container logs/images filling `/var`.

## Immediate actions

1. Confirm via DO Monitoring / `df -h` and `df -i` over SSH (named key only).
2. Identify growth: Docker images/volumes, app logs, Valkey dump, temp uploads.
3. Free space safely: prune unused images (`docker image prune` only after confirming digests still needed), rotate/truncate oversized logs, clear known temp paths.
4. If disk remains critical, scale storage or migrate bulky artefacts off-host (Spaces); do not disable monitoring.

## Escalation

If root filesystem cannot be recovered within 15 minutes or data risk exists → break-glass + owner.

## Related

- TTW-063 runtime budget; TTW-067 backups before destructive cleanup.
