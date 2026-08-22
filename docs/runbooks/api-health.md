# Runbook — API health

| Field     | Value                                                           |
| --------- | --------------------------------------------------------------- |
| Owner     | platform-backend                                                |
| Severity  | critical (5xx), warning (latency)                               |
| Alerts    | `TamiymApiHigh5xxRate`, `TamiymApiHighLatencyP95`               |
| Dashboard | Grafana `Platform / API Health` (`ttw-051-platform-api-health`) |

## User / business impact

Elevated 5xx or latency degrades checkout, organiser workflows, admin operations, and webhook handling. Customers may see errors; money paths may stall if API workers are unhealthy.

## Triage — Prometheus

```promql
# 5xx ratio (recording rule)
tamiym:http_5xx_rate:ratio5m

# p95 latency (recording rule)
tamiym:http_request_duration_ms:p95_5m

# Per-route volume (bounded route templates only)
sum by (route, status_code) (rate(tamiym_http_server_requests_total[5m]))
```

## Triage — logs & traces

- Filter structured logs by `level=error` and correlate `requestId` / `traceId`.
- Jaeger: search traces with `status=error` or high duration on HTTP spans.
- Audit rows: join on `requestId` / `traceId` for the same incident window.

## Containment

1. Confirm whether a single route or dependency (DB, Redis, external provider) dominates errors.
2. If deploy-related, roll back or scale API replicas (production) after capturing trace samples.
3. Temporarily disable non-critical cron/queue consumers only if they are the confirmed root cause.
4. Do **not** restart Postgres or Redis without platform-ops approval.

## Recovery

1. Fix root cause (code, config, dependency quota, migration).
2. Verify error rate and latency recording rules return below alert thresholds.
3. Replay failed queue jobs only through normal idempotent job paths.

## Verification

- `tamiym:http_5xx_rate:ratio5m < 0.01` for 15 minutes.
- `tamiym:http_request_duration_ms:p95_5m` within SLO (see interim policy).
- Spot-check critical journeys: login, checkout callback, webhook intake.
- Confirm alerts `TamiymApiHigh5xxRate` and `TamiymApiHighLatencyP95` are resolved in Prometheus.
