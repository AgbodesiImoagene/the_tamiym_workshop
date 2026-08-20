# Dashboard inventory (TTW-066)

These dashboards are **planned** for DigitalOcean Monitoring and/or the chosen
managed OTLP vendor UI. This file is an inventory only — it does **not** claim
that panels exist live or that JSON exports are checked into the repo.

| ID                   | Purpose                                              | Primary signals                                    | Env correlation    |
| -------------------- | ---------------------------------------------------- | -------------------------------------------------- | ------------------ |
| `svc-objectives`     | API/edge error rate, latency, availability           | HTTP metrics, Caddy upstream health                | `env`, `revision`  |
| `runtime-host`       | Droplet CPU, memory, disk, load                      | DO Droplet monitoring                              | `env=production`   |
| `runtime-containers` | Compose role health and restarts                     | Healthchecks, container exit                       | `container.role`   |
| `data-postgres`      | Managed PG connections, CPU, storage, failover       | DO Managed Database monitoring                     | `env`              |
| `data-valkey-queues` | Valkey memory, connections; BullMQ depth/failures    | App metrics + Valkey INFO (via app)                | `service`, `queue` |
| `providers-spaces`   | Spaces/S3 error rates and latency                    | App storage metrics                                | `env`              |
| `providers-webhooks` | Paystack webhook accept/settle outcomes              | TTW-051 webhook counters                           | `revision`         |
| `deployments`        | Deploy markers, revision health, rollback candidates | Image digest / revision attributes                 | `revision`         |
| `backups`            | Backup freshness vs RPO                              | DO backup timestamps (TTW-067)                     | `env`, pool tags   |
| `security`           | Findings, firewall drift, privileged actions         | DO security + TTW-065 hooks                        | `env`              |
| `cost`               | Spend by project/tag vs USD 50 envelope              | DO billing + tags (`prod` / `tmpval` / `recovery`) | cost pool          |

## Build notes (owner)

1. Prefer provider-native charts first (Droplet, Managed PG).
2. Build application/queue/webhook panels in the managed OTLP UI after the
   collector exports successfully.
3. Always filter by `deployment.environment` and show `service.version` /
   `revision` on deploy-sensitive views.
4. Do not scrape high-cardinality labels into shared metric series.
