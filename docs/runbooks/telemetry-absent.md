# Runbook — Telemetry absent

| Field     | Value                                                         |
| --------- | ------------------------------------------------------------- |
| Owner     | platform-backend                                              |
| Severity  | critical                                                      |
| Alerts    | `TamiymTelemetryAbsent`                                       |
| Dashboard | Grafana `Platform / API Health` — OTel collector scrape panel |

## User / business impact

Without telemetry export, operators cannot distinguish healthy zero-traffic from exporter failure. Incident detection for money, queues, and auth is blind until telemetry is restored.

## Triage — Prometheus

```promql
up{job="otel-collector"}

# Confirm API still serving (may be healthy despite absent metrics)
sum(rate(tamiym_http_server_requests_total[5m]))
```

If `up == 0` but API logs show traffic, the collector or scrape path failed — not necessarily the API.

## Triage — infrastructure

- `docker compose --profile observability ps` — otel-collector and prometheus containers running.
- Collector logs: exporter errors, OTLP receiver failures.
- Prometheus targets UI: `otel-collector` target health.

## Containment

1. Restart `otel-collector` container if crashed; capture logs first.
2. If Prometheus is down, restart `prometheus` after confirming disk not full.
3. Do not change production API `OTEL_EXPORTER_OTLP_ENDPOINT` without change control.

## Recovery

1. Restore collector → Jaeger/Prometheus pipeline.
2. Confirm API `OTEL_EXPORTER_OTLP_ENDPOINT` points to reachable collector endpoint.
3. Wait for scrape interval (15s) and verify `up{job="otel-collector"} == 1`.

## Verification

- `up{job="otel-collector"} == 1` for 5 minutes.
- Fresh `tamiym_http_server_requests_total` samples appear in Prometheus.
- Alert `TamiymTelemetryAbsent` resolves.
- Jaeger receives new traces from a test API request.

## Receiver contract (no secrets)

Production alert routing uses environment-managed receivers (PagerDuty/email/Slack webhook URL + auth token). Local/temporary-validation uses Grafana unified alerting or Alertmanager with a non-production receiver configured via env vars — credentials are never committed.
