# TTW-051 — Observability SLI catalogue (interim v1, slice 1)

**Policy version:** `observability-sli/v1-interim-2026-08-22`\
**Status:** Engineering interim — slice 1 ships versioned dashboards, alert rules, runbooks, and CI validation; production paging drills and receiver credentials remain environment-managed.

Canonical metric names match `apps/api/src/observability/observability.service.ts` and `metrics.manifest.json`. Prometheus scrapes the OTel collector exporter with namespace prefix `tamiym_` (e.g. `tamiym_http_server_requests_total`).

## Authority

| Rule            | Value                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Metric source   | `ObservabilityService` counters/histograms via OTLP → collector → Prometheus                                          |
| Cardinality     | Bounded labels only (`outcome`, route templates, queue names, event names, channels) — no user IDs, emails, bank data |
| Financial truth | Money SLIs use settlement/refund/payout counters — not raw HTTP request counts                                        |
| Paging          | Every alert below has owner, severity, runbook, and dashboard linkage                                                 |
| Receivers       | Production secrets live in env; committed artefacts document contract only                                            |

## SLI catalogue

| SLI                         | Metric(s)                                                  | Threshold (slice 1) | Window | Severity | Owner             | Alert                            | Runbook                                 |
| --------------------------- | ---------------------------------------------------------- | ------------------- | ------ | -------- | ----------------- | -------------------------------- | --------------------------------------- |
| API availability (5xx rate) | `http_server_requests_total` (`status_code`)               | > 5% 5xx            | 5m     | critical | platform-backend  | `TamiymApiHigh5xxRate`           | `docs/runbooks/api-health.md`           |
| API latency (p95)           | `http_server_request_duration_ms`                          | p95 > 2000 ms       | 10m    | warning  | platform-backend  | `TamiymApiHighLatencyP95`        | `docs/runbooks/api-health.md`           |
| Telemetry present           | Prometheus `up{job="otel-collector"}`                      | scrape down         | 2m     | critical | platform-backend  | `TamiymTelemetryAbsent`          | `docs/runbooks/telemetry-absent.md`     |
| Webhook processing failures | `webhook_events_total{outcome="failure"}`                  | > 0.1/s             | 5m     | critical | payments          | `TamiymWebhookFailureSpike`      | `docs/runbooks/webhooks-money.md`       |
| Webhook denials             | `webhook_events_total{outcome="denied"}`                   | > 0.5/s             | 5m     | warning  | payments          | `TamiymWebhookDeniedSpike`       | `docs/runbooks/webhooks-money.md`       |
| Charge settlement rejected  | `charge_settlement_total{outcome="rejected"}`              | any non-zero rate   | 5m     | critical | payments          | `TamiymChargeSettlementRejected` | `docs/runbooks/webhooks-money.md`       |
| Refund settlement failed    | `refund_settlement_total{outcome="failed"}`                | any non-zero rate   | 5m     | critical | payments          | `TamiymRefundSettlementFailed`   | `docs/runbooks/webhooks-money.md`       |
| Payout failures             | `payouts_total`, `payout_runs_total` (`outcome="failure"`) | any non-zero rate   | 5m     | critical | payments          | `TamiymPayoutFailure`            | `docs/runbooks/webhooks-money.md`       |
| Queue job failures          | `queue_jobs_total{outcome="failure"}`                      | > 0.05/s per queue  | 10m    | warning  | platform-ops      | `TamiymQueueJobFailures`         | `docs/runbooks/queues-notifications.md` |
| Notification queue age      | `notification_queue_oldest_pending_age_seconds`            | p99 > 600 s         | 10m    | warning  | platform-ops      | `TamiymNotificationQueueStale`   | `docs/runbooks/queues-notifications.md` |
| Media scan infected/failed  | `media_virus_scan_total` (`infected`, `failed`)            | any non-zero rate   | 2m     | critical | security-platform | `TamiymMediaVirusScanFailure`    | `docs/runbooks/media-security.md`       |
| Auth throttle limited       | `auth_throttle_total{outcome="limited"}`                   | > 5/s               | 5m     | warning  | security-platform | `TamiymAuthThrottleLimited`      | `docs/runbooks/auth-abuse.md`           |
| Auth login denied           | `auth_login_total{outcome="denied"}`                       | > 2/s               | 10m    | warning  | security-platform | `TamiymAuthLoginDeniedSpike`     | `docs/runbooks/auth-abuse.md`           |

## Recording rules (slice 1)

| Recorded metric                          | Source                            | Purpose                 |
| ---------------------------------------- | --------------------------------- | ----------------------- |
| `tamiym:http_5xx_rate:ratio5m`           | `http_server_requests_total`      | Dashboard + alert ratio |
| `tamiym:http_request_duration_ms:p95_5m` | `http_server_request_duration_ms` | Dashboard + alert p95   |
| `tamiym:webhook_failure_rate:5m`         | `webhook_events_total`            | Alert spike detection   |
| `tamiym:webhook_denied_rate:5m`          | `webhook_events_total`            | Alert spike detection   |
| `tamiym:queue_job_failure_rate:5m`       | `queue_jobs_total`                | Per-queue failure alert |

## Dashboards (Grafana provisioning)

| Dashboard              | UID                            | Runbook families             |
| ---------------------- | ------------------------------ | ---------------------------- |
| Platform / API Health  | `ttw-051-platform-api-health`  | api-health, telemetry-absent |
| Money & Webhooks       | `ttw-051-money-webhooks`       | webhooks-money               |
| Queues & Notifications | `ttw-051-queues-notifications` | queues-notifications         |
| Media & Auth           | `ttw-051-media-auth`           | media-security, auth-abuse   |

## Alert receiver contract (no secrets)

| Environment                  | Receiver                                         | Configuration                                                                   |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Local / temporary-validation | Grafana unified alerting or Alertmanager webhook | `ALERTMANAGER_WEBHOOK_URL` (optional), test inbox only                          |
| Production                   | PagerDuty / email / Slack                        | `PAGERDUTY_ROUTING_KEY`, `ALERT_EMAIL_TO`, `SLACK_WEBHOOK_URL` via secret store |

Committed files define alert labels (`severity`, `owner`, `family`) and annotation `runbook_path` only.

## Out of scope (slice 1)

- Controlled failure drills and paging delivery evidence → slice 2
- Production Alertmanager/Grafana notification provisioning → slice 2
- Additional business KPI dashboards → TTW-036
