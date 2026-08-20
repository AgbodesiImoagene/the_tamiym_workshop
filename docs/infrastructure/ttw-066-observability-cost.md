# TTW-066 — Infrastructure observability and cost controls

Production telemetry, alerting, and cost attribution for The Tamiym Workshop on
DigitalOcean. Complements TTW-051 (application instrumentation), TTW-063
(runtime), TTW-064 (data), and TTW-065 (secrets). **No live DigitalOcean
monitoring apply, alert-delivery test, or on-call contact injection in this
ticket** — those remain owner-gated when secrets and operator contacts exist.

## Design choice (cost-bounded)

| Layer                         | Production choice                                                              | Explicitly avoided                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Host / Droplet                | DigitalOcean Droplet monitoring + alerts                                       | Permanent Prometheus/Grafana/Jaeger on the 4 GiB prod host                                   |
| Managed PostgreSQL            | DigitalOcean Managed Database monitoring + alerts                              | Self-hosted PG exporters as the sole signal                                                  |
| Application (TTW-051) signals | Cost-bounded managed OTLP destination via OpenTelemetry Collector              | Shipping full local observability profile (`docker compose --profile observability`) to prod |
| Dashboards                    | DO Monitoring + managed OTLP vendor UI (inventory only until owner provisions) | Claiming live dashboards exist in-repo                                                       |

Local Jaeger/Prometheus/Grafana remain **development-only**
(`otel-collector-config.yaml`, `docker/observability/`). Production collector
config lives at `infra/runtime/observability/otel-collector.prod.yaml` and
exports only to an env-configured OTLP endpoint.

## Attribute standard

Every exported resource and log/metric/trace should carry:

| Attribute                        | Source / convention                                                                 | Notes                             |
| -------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------- |
| `deployment.environment` / `env` | `production` \| `temporary-validation` \| `recovery`                                | Distinguishes budget pools        |
| `service.name`                   | `api`, `web`, `app`, `admin`, `worker`, `scheduler`, `proxy`, `valkey`, `collector` | Stable short names                |
| `container.role`                 | Compose/`API_ROLE` (`api` \| `worker` \| `scheduler`)                               | Required for Nest roles           |
| `service.version` / `revision`   | Image digest or git SHA                                                             | Correlate deploys and regressions |
| Correlation ids                  | `trace_id`, `span_id`, `request_id` (`x-request-id`)                                | Aligns with TTW-051 / audit rows  |

Do **not** invent high-cardinality labels (raw URLs, user ids, order ids on
metric series). Keep those on spans/logs only when redaction allows.

## Redaction rules

Telemetry **never** records:

- Secrets, passwords, API tokens (`DIGITALOCEAN_TOKEN`, JWT secrets, Paystack
  secret keys, Spaces keys, DB URLs with embedded passwords)
- Auth headers / cookies / session material
- Payment payloads (card/bank PAN, Paystack authorization codes beyond opaque
  references already allowed by TTW-051 metrics)
- Private media bytes or object keys that identify quarantine/originals content
- Unnecessary customer PII (full address, phone, email) on metrics; prefer
  hashed or omitted fields on logs when debugging requires a handle

Collector processors in `otel-collector.prod.yaml` strip known secret attribute
keys and header names before export. Application redaction (pino / Nest) remains
the first line of defence (TTW-051).

## Cardinality and sampling limits

| Signal  | Limit (production)                                                                  |
| ------- | ----------------------------------------------------------------------------------- |
| Traces  | Tail sampling: keep errors + slow (≥2 s) + ~5–10% of healthy traffic (tune owner)   |
| Metrics | Low-cardinality labels only (env, service, container.role, outcome enums)           |
| Logs    | Structured JSON; drop debug in production; bound body size                          |
| Export  | Batch + memory limiter; on destination outage, drop oldest rather than OOM the host |

Exporter pressure and collector memory must not starve application containers on
the 4 GiB Droplet. Prefer managed destination retention ≤30 days unless the
owner raises budget.

## Alert catalog

Machine-readable source of truth:
`infra/runtime/observability/alerts/catalog.json`.

Every paging or ticket alert names:

- `id`, `severity` (`page` \| `ticket` \| `info`)
- `signal` (what fires)
- `runbook_relpath` (repo-relative markdown)
- `owner_role` (placeholder role — **not** a personal email or phone)

Runbooks live under `infra/runtime/observability/runbooks/`. On-call contact
details are injected only through the owner vault / protected alert channel
configuration — never committed.

### Classes covered

| Class           | Example alert ids                              | Severity (typical) |
| --------------- | ---------------------------------------------- | ------------------ |
| Reverse proxy   | `proxy_tls_or_upstream`                        | page               |
| Containers      | `container_unhealthy`                          | page               |
| Host            | `host_disk`, `host_saturation`, `droplet_down` | page               |
| PostgreSQL      | `postgres_down`                                | page               |
| Valkey / queues | `valkey_pressure`, `queue_backlog`             | page / ticket      |
| Spaces          | `spaces_errors`                                | ticket             |
| Webhooks        | `webhook_failures`                             | ticket             |
| Deployments     | `deploy_unhealthy`                             | page               |
| Backups         | `backup_stale`                                 | page               |
| Security        | `security_finding`                             | page               |
| Cost            | `cost_warning`                                 | ticket → escalate  |

## Cost controls

| Control                         | Policy                                                                 |
| ------------------------------- | ---------------------------------------------------------------------- |
| DO project / tags               | `ttw-prod`, `ttw-tmpval`, recovery resources tagged distinctly         |
| Warning                         | Alert when projected monthly spend approaches **USD 50** (≤50 warning) |
| Hard escalation                 | Named owner escalation **before** projected overrun of the envelope    |
| Production baseline             | Steady-state Droplet + Managed PG + Spaces + bounded OTLP              |
| Temporary validation (`tmpval`) | Time-bounded; destroy after evidence (TTW-068)                         |
| Recovery                        | `fra1` / recovery storage counted separately from prod baseline        |

Cost model scripts (`pnpm infra:cost-model`, TTW-060) remain the offline
estimate; DO billing alerts are owner-configured to match this catalog.

## Owner-gated (explicit deviations)

Credential-free CI validates catalog schema, runbook presence, collector
redaction paths, and the ≤USD 50 warning documentation. The following require
the owner secret store and live DO/OTLP accounts:

1. Provision managed OTLP destination + inject endpoint/headers into
   `/etc/tamiym/secrets.env`.
2. Enable DO Droplet / Managed PG monitors and wire alert channels.
3. End-to-end alert delivery / acknowledgement tests and game days.
4. On-call contact injection (PagerDuty/email/SMS) — never commit contacts.
5. Baseline monthly cost report after first live month.

## Dashboards

Inventory only (not claimed live): see
`infra/runtime/observability/dashboards/README.md`.

## Policy gate

```bash
bash infra/policy/assert-observability-invariants.sh
# also via:
bash infra/scripts/validate-all.sh
```

## Related artefacts

| Path                                                   | Role                             |
| ------------------------------------------------------ | -------------------------------- |
| `infra/runtime/observability/otel-collector.prod.yaml` | Production-shaped collector      |
| `infra/runtime/observability/alerts/catalog.json`      | Alert catalog                    |
| `infra/runtime/observability/runbooks/*.md`            | Runbooks                         |
| `infra/runtime/observability/dashboards/README.md`     | Dashboard inventory              |
| `infra/policy/assert-observability-invariants.*`       | Credential-free gates            |
| `infra/runtime/secrets/.env.example`                   | OTEL PLACEHOLDER vars            |
| `docs/09-observability-otel.md`                        | App-side OTel baseline (TTW-051) |
