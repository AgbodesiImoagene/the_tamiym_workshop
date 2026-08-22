# Observability — Structured Logging + OpenTelemetry

## Current baseline

Implemented in `apps/api`:

- `nestjs-pino` request logging with generated or forwarded `x-request-id`
- sensitive-field redaction for auth headers, cookies, passwords, and token-like payload fields
- request-context propagation for `requestId`, actor metadata, IP address, and user agent
- OpenTelemetry SDK bootstrap before Nest starts
- OTLP trace and metric export to the collector configured by `OTEL_EXPORTER_OTLP_ENDPOINT`
- baseline counters and histograms for:
  - HTTP request volume and latency
  - auth login outcomes
  - payment initiation outcomes (`payment_initiation_total`: created / reused / reconciled / blocked / failure)
  - refund outcomes
  - refund settlement outcomes (`refund_settlement_total`: initiated / settled / duplicate / failed / stale / unmatched / …)
  - payout and payout-run outcomes
  - webhook events
  - charge settlement outcomes (`charge_settlement_total`: settled / duplicate / rejected)
  - inventory lifecycle outcomes (`inventory_movement_total`: kind=reserve|release|consume, outcome=applied|duplicate|rejected)
  - payout transfer webhook outcomes (`payout_transfer_event_total`: applied / duplicate / stale)
  - queue-job outcomes and duration

## Logging requirements

- keep structured JSON logging enabled outside development
- include `requestId`, `traceId`, and actor metadata on log lines where available
- redact secrets, passwords, raw tokens, cookies, and sensitive payment/bank fields

## Trace coverage

Current custom spans cover:

- payment initiation
- refund initiation
- Paystack webhook handling
- payout creation and transfer initiation
- payout-run execution
- cron-driven payout scheduling
- order-expiry and auth-token-cleanup cron jobs

Worker and provider instrumentation covers:

- payout execution worker
- mail processor
- media processor
- Paystack bank/account/transfer provider calls

## Audit correlation

Audit rows now carry:

- `requestId`
- `traceId`
- `actorUserId`
- `actorRole`
- `ipAddress`
- `userAgent`
- `source`

This is intended to let an operator move across log lines, traces, and audit records for the same request or job.

## Remaining production work

- environment-specific OTLP backends and retention policy
- e2e validation of trace propagation across separately deployed workers if/when workers move out of the API process
- broader domain metrics where business reporting needs exceed the current baseline
- production alert routing / paging drills (slice 2 of TTW-051)

## Dashboards, alerts, and runbooks (TTW-051 slice 1)

Versioned artefacts ship in-repo and validate in CI via `pnpm observability:validate`:

| Artefact                           | Path                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| SLI catalogue (interim)            | `docs/observability/ttw-051-interim-policy.md`                                                                                |
| Prometheus alert + recording rules | `docker/observability/prometheus/alerts.yml`                                                                                  |
| Prometheus scrape config           | `docker/observability/prometheus.yml`                                                                                         |
| Grafana dashboards (provisioned)   | `docker/observability/grafana/provisioning/dashboards/json/`                                                                  |
| Runbooks                           | `docs/runbooks/` (`api-health`, `telemetry-absent`, `webhooks-money`, `queues-notifications`, `media-security`, `auth-abuse`) |
| Canonical metric manifest          | `apps/api/src/observability/metrics.manifest.json`                                                                            |

Start the stack with `docker compose --profile observability up -d`. Grafana (`http://localhost:3333`) loads dashboards from the **Observability** folder. Prometheus (`http://localhost:9090`) evaluates rules from `alerts.yml`.

Alert receiver credentials are environment-managed; committed files document the receiver contract only (see interim policy).

## Export

Use the OpenTelemetry Collector in Docker for routing. With `docker compose --profile observability up -d`, traces land in **Jaeger** (`http://localhost:16686`), metrics are scraped by **Prometheus** from the collector’s `:8889/metrics`, and **Grafana** (`http://localhost:3333`) is pre-provisioned with Prometheus and Jaeger datasources.
