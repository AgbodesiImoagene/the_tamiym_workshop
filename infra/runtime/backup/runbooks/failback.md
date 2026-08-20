# Runbook: Failback

**Ticket:** TTW-067

## When to fail back

After a temporary-validation drill, fra1 regional recovery, or temporary Droplet
replacement, when the **primary** (lon1 production) path is healthy again and
the owner authorizes return.

## Authorization

1. Owner confirms primary health (PG, Droplet, edge, Spaces reachability).
2. Dual confirmation of DNS cutover target and TTL plan (Namecheap).
3. `RESTORE_CONFIRM_TARGET` must match the production hostname/IP being restored
   as authoritative — treat as destructive to the temporary path.

## Procedure

1. Freeze non-essential writes on the temporary stack if practical (maintenance
   window).
2. Capture final evidence on temporary stack (counts/checksums).
3. Ensure production PostgreSQL has the intended recovery point (replication/
   restore strategy as authorized — do not invent dual-write).
4. Drain workers on temporary; keep Valkey empty-safe on both sides.
5. Point application secrets / Compose at production endpoints.
6. DNS cutover back to reserved IP / lon1 edge; monitor TLS and `/v1/health`.
7. Decommission temporary resources promptly (cost pool hygiene; TTW-068).
8. Confirm `backup_stale` and dependency alerts clear.

## Forbidden

- Failback without invariant comparison between temporary and primary.
- Leaving temporary-validation resources running as a silent second production.

## Validation

- Achieved RTO for failback recorded.
- No duplicate payments/payouts after cutover.
- Cost tags show temporary/recovery resources destroyed or scheduled.
