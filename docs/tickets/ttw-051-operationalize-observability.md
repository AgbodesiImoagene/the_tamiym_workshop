# TTW-051 — Operationalize observability and alert response

**Epic:** 5 — Contracts, observability and release proof  
**Status:** In progress (slice 1)
**Risk:** High  
**Blocked by:** TTW-003, TTW-010, TTW-011, TTW-013, TTW-015, TTW-021, TTW-023, TTW-036, TTW-043\
**Blocks:** TTW-053, TTW-054

## Background

The API emits structured logs, traces and baseline counters/histograms for HTTP, authentication, payments, refunds, payouts, webhooks and queues. Local Compose routes those signals to Jaeger and Prometheus, and Grafana provisions only its data sources. No dashboard definitions, recording/alert rules, notification routing, SLOs or executable response runbooks exist. Operators can inspect raw telemetry, but the system cannot reliably detect or guide response to stalled money, queue, media or authentication workflows.

## Proposal

Approve a small set of service-level indicators and operational thresholds, close metric gaps with bounded-cardinality signals, and provision versioned Grafana dashboards plus Prometheus-compatible recording and alert rules. Route temporary-validation alert tests to a non-production receiver and define the production receiver contract without committing credentials. Give every actionable alert an owner, severity, user/business impact, correlation query, immediate containment, diagnosis, recovery and verification runbook. Validate telemetry end to end with controlled failures before relying on it for release.

## Invariants

- Metrics, labels, logs, traces and dashboard variables contain no PII, secrets, bank details, tokens or unbounded IDs.
- Money dashboards use settled/refunded/payout ledger semantics, not an ambiguous request counter as financial truth.
- Every paging alert has an accountable owner and an executable action; non-actionable signals remain dashboards, not pages.
- Missing telemetry and exporter/scrape failure are distinguishable from a healthy zero-event period.
- Alert and dashboard definitions are versioned, reviewable and portable; receiver secrets remain environment-managed.
- Request, job, audit and provider activity remain correlatable by safe request/trace/business-reference fields.

## Implementation plan

1. Approve availability, latency, queue-age, provider, settlement, refund, payout, media and auth indicators; record threshold rationale, evaluation windows, severity and owner.
2. Audit current instruments and label cardinality. Add only missing state gauges/counters needed for stuck-age/backlog, duplicate/rejected provider events, reconciliation deltas, scan failures and authentication abuse visibility.
3. Add tested Prometheus recording and alert rules for API error/latency, absent telemetry, webhook rejection/backlog, payment/refund/payout failure or staleness, ledger reconciliation mismatch, queue backlog/retry exhaustion, media quarantine/scan failure and elevated auth denial/rate limiting.
4. Provision focused Grafana dashboards for platform/API health, money and provider flows, queues/notifications, media processing and authentication/security. Link panels to the applicable runbook and trace/log query.
5. Define alert routing and inhibition/deduplication by severity and environment; provision a safe local/temporary-validation receiver and document the production secret/receiver interface.
6. Write one runbook per alert family with triage queries, containment, retry/reconciliation safety, escalation, customer impact and recovery verification.
7. Run controlled temporary-validation failure drills, including exporter loss, delayed queue work, invalid webhook, failed media scan and failed payout/refund simulation; tune thresholds from evidence and record detection/recovery times.

## Test and observability plan

- Unit/component: Test metric labels, outcome mapping and redaction; lint dashboards and alert expressions against expected metric names.
- Integration/e2e: Export telemetry through the collector, query Prometheus, render every provisioned dashboard, trigger and resolve every alert family, and follow runbooks against seeded non-production data.
- Failure, retry, and concurrency: Simulate exporter/scrape outage, burst traffic, duplicate provider events, retry exhaustion and stale queues; prove alert deduplication and that recovery resolves alerts without unsafe duplicate business effects.
- Logs, metrics, traces, and alerts: This ticket's output is the approved SLI/SLO catalogue, recording/alert rules, dashboards, routing contract and runbooks; capture alert delivery and mean-time-to-detect/recover drill evidence.

## References

- `apps/api/src/observability/observability.service.ts:18-73` — current HTTP, auth, payment, refund, payout, webhook and queue instruments.
- `apps/api/src/observability/otel.ts:24-53` — OTLP trace and metric export.
- `docker/observability/prometheus.yml` — collector scrape exists without rule files.
- `docker/observability/grafana/provisioning/datasources/datasources.yml` — data sources are the only provisioned Grafana resources.
- `otel-collector-config.yaml` — local signal routing baseline.
- `docs/09-observability-otel.md:60-65` — dashboards, alerts, retention and broader business metrics remain open.
- `docs/backend-production-readiness.md:293-297` — payout runbooks and operational alerts remain production work.

## Acceptance criteria

- [ ] Approved SLI/SLO and alert catalogue covers API, provider webhooks, money/reconciliation, queues/notifications, media and auth, with owner and threshold rationale.
- [ ] Versioned dashboards and alert rules provision and validate automatically in local/temporary-validation environments.
- [ ] Every paging alert links to a reviewed runbook and reaches the expected temporary-validation receiver during a controlled drill.
- [ ] Missing telemetry, stuck work and reconciliation mismatch are observable separately from ordinary business failure.
- [ ] Label-cardinality and redaction tests prove telemetry does not expose sensitive or unbounded data.
- [ ] Controlled failure drills demonstrate detection, correlation, safe response and alert recovery for every alert family.
- [ ] High-risk design, security and independent implementation reviews pass with evidence recorded below.

## Out of scope

- Repairing financial state machines → TTW-010, TTW-011 and TTW-013.
- Building reconciliation and repair workflows → TTW-015.
- Notification dead-letter business operations → TTW-043.
- Selecting a production observability vendor or purchasing an on-call service; this ticket defines portable signals and receiver contracts.

## Design review

**Reviewer:** AI implementation agent (slice 1)\
**Date:** 2026-08-22\
**Verdict:** APPROVED for slice 1 implementation

| Area                  | Assessment                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Blast radius          | Read-only observability artefacts + CI validator; no runtime API behaviour change         |
| SLI semantics         | Money SLIs use settlement/refund/payout counters; HTTP SLIs separate from financial truth |
| Thresholds            | Initial thresholds from interim policy; tuning deferred to slice 2 drills                 |
| Cardinality / privacy | Bounded labels only; alert annotations reference runbook paths, no PII                    |
| Owners / escalation   | `platform-backend`, `payments`, `platform-ops`, `security-platform` per alert family      |
| Failure drills        | Slice 2 — controlled exporter/queue/webhook drills not in slice 1 scope                   |
| Costs / retention     | Local Compose stack only; production retention unchanged                                  |
| Migration / rollback  | Additive files; remove rule mount to disable alerts                                       |

## Implementation reviews

Record each independent review iteration, findings, fixes, dashboard/rule validation, security verdict, drill evidence and overall verdict.

## Verification evidence

Record exact telemetry-stack startup, rule validation, dashboard lint/provision, controlled-failure and alert-delivery commands, with redacted screenshots/query results and detection/recovery timings.

## Completion summary

Summarize shipped indicators, dashboards, alerts, routes, runbooks, drill outcomes, production environment requirements and follow-up tuning work.
