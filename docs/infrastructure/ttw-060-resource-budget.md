# TTW-060 — 4 GiB Droplet resource budget

**Host:** DigitalOcean Basic Droplet — 4 GiB RAM / 2 vCPU / 80 GiB SSD  
**Constraint:** Correctness must not depend on swap. Leave ≥512 MiB host headroom for kernel, Docker, sshd, and spikes.

## Container memory budgets (MiB)

| Role                      | Soft limit | Hard limit | Notes                               |
| ------------------------- | ---------: | ---------: | ----------------------------------- |
| Caddy/nginx reverse proxy |         64 |        128 | TLS termination only                |
| `web` (Next.js)           |        384 |        512 | Public site                         |
| `app` (Next.js)           |        384 |        512 | Customer dashboard                  |
| `admin` (Next.js)         |        384 |        512 | Admin dashboard                     |
| `api` (NestJS HTTP)       |        512 |        768 | No BullMQ consumers in this process |
| `worker` (NestJS)         |        384 |        512 | BullMQ processors only              |
| `scheduler` (NestJS)      |        192 |        256 | Singleton cron; one replica         |
| Valkey/Redis              |        256 |        384 | `maxmemory` 256 MiB, `noeviction`   |
| Docker/OS/headroom        |          — |       ≥512 | Unallocated                         |

**Sum of hard limits (app containers + Valkey):** 128+512+512+512+768+512+256+384 = **3584 MiB** → **512 MiB** remaining for host/Docker within 4096 MiB.

## CPU shares (relative)

On 2 vCPU, prefer shares over hard CPU pinning:

- `api` + `worker`: highest share
- three Next.js apps: medium
- proxy + scheduler + Valkey: low

## Disk

| Path                      |  Budget | Notes                             |
| ------------------------- | ------: | --------------------------------- |
| Container images + layers | ≤20 GiB | Prune unused tags in deploy       |
| Valkey AOF/RDB (optional) |  ≤2 GiB | Prefer reconstructable queues     |
| Logs (local buffer)       |  ≤2 GiB | Ship to OTLP; rotate aggressively |
| Scratch / downloads       |  ≤5 GiB | Media processing temp             |
| Free                      | ≥40 GiB | Image pulls + growth              |

Media originals live in Spaces, not on the Droplet.

## Fit proof approach

1. Build production images (TTW-063) with explicit `mem_limit` / cgroup v2 `memory.max`.
2. Boot the full compose on a 4 GiB host or equivalent constrained VM **without swap**.
3. Exercise health endpoints + enqueue a bounded BullMQ job + run one scheduler tick.
4. Fail the proof if OOM killer fires or any role exceeds its hard limit under the smoke load.

Local development Compose is **not** memory-shaped for production; TTW-060 records the budget that TTW-063 must enforce.

## Machine-readable budget

See `docs/infrastructure/ttw-060-resource-budget.json`.
