# TTW-060 — Nigeria latency evidence (Frankfurt vs London)

**Captured:** 2026-08-20  
**Decision:** Primary region = **London (`lon1`)**; recovery/fallback = **Frankfurt (`fra1`)**.

## Method

1. **Representative Nigeria vantage:** WonderNetwork public ICMP ping series from **Lagos → Frankfurt** and **Lagos → London** (30-ping samples, continuous public history).
2. **Agent workspace cross-check (not Nigeria):** HTTPS connect timing to DigitalOcean Spaces endpoints from Dublin (`fra1`/`lon1`/`nyc3`) to confirm endpoint reachability only — **not** used for primary-region selection.
3. Owner-facing product traffic is Nigeria-first; DigitalOcean has no African compute region.

## WonderNetwork results (Lagos)

Source pages (retrieved 2026-08-20):

- https://wondernetwork.com/pings/Lagos/Frankfurt
- https://wondernetwork.com/pings/Lagos/London

| Path              | Latest sample avg (2026-08-20) | Observed recent band      |
| ----------------- | ------------------------------ | ------------------------- |
| Lagos → Frankfurt | ~119 ms                        | typically ~115–125 ms avg |
| Lagos → London    | ~104 ms                        | typically ~103–105 ms avg |

London is consistently **~15 ms lower RTT** than Frankfurt on this Lagos vantage and shows tighter variance in the sampled window.

## Workspace cross-check (Dublin, informational)

```text
fra1.digitaloceanspaces.com  HTTP 200  ~0.10 s
lon1.digitaloceanspaces.com  HTTP 200  ~0.07 s
nyc3.digitaloceanspaces.com  HTTP 200  ~0.28 s
```

## Approval

- **Primary:** `lon1` (London) — lower measured Nigeria latency.
- **Recovery / rebuild target:** `fra1` (Frankfurt) — second European region for regional-loss rebuild without sharing the London failure domain.
- Reserved IP, Managed PostgreSQL, Spaces buckets, and Droplet for production are provisioned in the primary region after TTW-061+.
- Namecheap DNS remains authoritative; cutover to recovery is a deliberate TTW-067/TTW-054 procedure, not automatic failover.

## Residual risk

- ISP-specific routing from MTN/Airtel/Glo can diverge from WonderNetwork Lagos; Cloudflare (or similar) edge in Nigeria remains recommended for static/public surfaces after launch.
- Application RTT will exceed ICMP by TLS/app overhead; budgets assume ~120–180 ms Nigeria→origin for API calls without an edge cache.
