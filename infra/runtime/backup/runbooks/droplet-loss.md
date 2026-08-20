# Runbook: Droplet / host loss

**Ticket:** TTW-067 · **Alert cues:** `droplet_down`, `container_unhealthy`, `host_disk`

## Detection

- DigitalOcean Droplet unreachable or agent heartbeat lost.
- Edge TLS/upstream failures from Caddy; health checks failing across roles.

## Authorization

1. Confirm failure class (host only vs broader regional).
2. Named owner authorizes rebuild into **same region** (preferred) or isolated
   temporary-validation if forensics required.
3. Destructive replace of the production Droplet requires `RESTORE_CONFIRM_TARGET`
   matching the intended Droplet name.

## Rebuild (same region)

1. Preserve reserved IP / DNS where possible (TTW-062).
2. Provision replacement Droplet via OpenTofu (`envs/production`) or restore
   from reviewed plan — **exact-plan apply** (TTW-065).
3. Inject host secrets from owner vault (`/etc/tamiym/secrets.env`).
4. Pull immutable images; `docker compose` up per TTW-063 (api/worker/scheduler
   roles, Valkey, proxy).
5. Confirm Managed PostgreSQL still healthy (private VPC) — **do not** restore
   PG unless DB failure is also indicated.
6. Valkey starts empty → follow [valkey-loss.md](./valkey-loss.md).
7. Smoke: `/v1/health`, login, read order, queue depth.

## Communication

- Page platform owner; note blast radius (single Droplet = all app roles).
- Customer-facing status only via approved channels (no secrets in status text).

## Validation

- Record RTO clock start/end; target ≤ 4 hours for recoverable host failure.
- Capture container revisions and health evidence (no secrets).

## Failback

N/A if rebuilt in place. If traffic moved to a temporary host, see [failback.md](./failback.md).
