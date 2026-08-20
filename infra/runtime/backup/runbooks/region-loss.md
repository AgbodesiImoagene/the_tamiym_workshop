# Runbook: Primary-region loss (lon1)

**Ticket:** TTW-067 · **Fallback region:** `fra1`

## Detection

- London region or Lon1 networking broadly unavailable (Droplet + Managed PG +
  edge unreachable beyond a single host fault).
- Confirm via DigitalOcean status + secondary network path before declaring
  region loss.

## Authorization

1. Owner declares **region-loss** failure class (24h RPO/RTO for PG + config).
2. Dual confirmation for DNS cutover (Namecheap) and production identity reuse.
3. Document that Spaces / OpenTofu state regional RPO may **exceed 24h** until
   replication is funded (TTW-060 ADR honesty).

## Rebuild in fra1

1. OpenTofu: provision recovery-tagged resources (Droplet, VPC/firewall as
   designed, Managed PG in fra1 if available for rebuild, or restore DB from
   off-provider export into the approved recovery target).
2. Restore PostgreSQL from **off-provider** encrypted export (PITR may be
   unavailable if the primary region control plane is down).
3. Inject secrets from owner vault (not from the lost Droplet disk).
4. Deploy immutable images; empty Valkey → [valkey-loss.md](./valkey-loss.md).
5. Spaces: restore whatever object replicas / inventory exist; accept media gaps
   if no cross-region copy.
6. Run post-restore queries; application smoke in isolation.
7. Namecheap DNS cutover rehearsal / live cutover only after invariant PASS and
   owner approval.
8. Record achieved RPO/RTO; open follow-ups for unmet objectives.

## Communication

- Status page / customer comms owned by product owner.
- Do not publish internal IPs, secret paths, or backup locations.

## Failback

When lon1 returns: see [failback.md](./failback.md). Prefer planned failback
over hasty DNS flip-flop.
