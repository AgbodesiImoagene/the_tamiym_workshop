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
  - payment initiation outcomes
  - refund outcomes
  - payout and payout-run outcomes
  - webhook events
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

- dashboards and alert rules for API, webhook, payout, and queue health
- environment-specific OTLP backends and retention policy
- e2e validation of trace propagation across separately deployed workers if/when workers move out of the API process
- broader domain metrics where business reporting needs exceed the current baseline

## Export

Use the OpenTelemetry Collector in Docker for routing. With `docker compose --profile observability up -d`, traces land in **Jaeger** (`http://localhost:16686`), metrics are scraped by **Prometheus** from the collector’s `:8889/metrics`, and **Grafana** (`http://localhost:3333`) is pre-provisioned with Prometheus and Jaeger datasources.
