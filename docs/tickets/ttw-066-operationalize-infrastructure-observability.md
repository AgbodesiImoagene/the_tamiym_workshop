# TTW-066 — Operationalize infrastructure observability and cost controls

**Epic:** 6 — Production infrastructure as code\
**Status:** Not started\
**Risk:** High\
**Blocked by:** TTW-063\
**Blocks:** TTW-053, TTW-068

## Background

Local observability exports to Jaeger, Prometheus and Grafana, while TTW-051 owns application instrumentation. Production still needs a managed or deliberately operated telemetry destination, infrastructure and deployment signals, retention/access policy, alerts, on-call routing and cost attribution. Unbounded logs/metrics can themselves become a major reliability and cost risk.

## Proposal

Use DigitalOcean monitoring/alerts for Droplet and Managed PostgreSQL infrastructure plus a cost-bounded OpenTelemetry destination for TTW-051 application signals. Prefer an existing/free managed telemetry tier over running a permanent observability stack on the 4 GiB production host. Standardize environment, service, container role, revision and correlation attributes; redact sensitive/high-cardinality data before export. Add alerts for reverse proxy, containers, host saturation/disk, PostgreSQL, Valkey/queues, Spaces, webhooks, deployments, backups and security signals. Define ownership, severity, escalation, retention and runbooks. Implement DigitalOcean project/tags, billing alerts and periodic right-sizing evidence.

## Invariants

- Telemetry never records secrets, auth tokens, payment payloads, private media or unnecessary customer data.
- Every paging alert names an owner and actionable runbook and is tested end-to-end.
- Monitoring failure is observable independently of the monitored application where feasible.
- Cost attribution distinguishes the production baseline, temporary validation, recovery storage and exceptional scaling.

## Implementation plan

1. Select managed/provider-native or self-operated telemetry components from TTW-060 constraints and document availability/cost trade-offs.
2. Provision collectors/destinations, encryption, access, retention, redaction/sampling/cardinality limits and archival/deletion policy.
3. Integrate reverse proxy, host/containers, Managed PostgreSQL, Valkey, Spaces, CI/deployment, backup and security signals with consistent metadata.
4. Add service/dependency/queue/deployment/recovery dashboards and severity-based alerts with runbooks and an owner-controlled on-call route; inject contact details through protected configuration and never commit them.
5. Enforce DigitalOcean tags, a warning below USD 50, a hard escalation before projected overrun, and baseline/capacity cost review cadence.
6. Run alert game days and telemetry outage/cardinality/cost failure tests; tune noise before release gating.

## Test and observability plan

- Unit/component: Configuration lint, redaction/cardinality tests, dashboard/alert schema and required-label policy tests.
- Integration/e2e: Trace one request/job across edge/runtime/dependencies, trigger each critical alert class and verify delivery/acknowledgement.
- Failure, retry, and concurrency: Collector/destination outage, exporter backpressure, alert-route failure, log storm and high-cardinality input.
- Logs, metrics, traces, and alerts: This ticket provisions and validates the production telemetry, alert and cost-control system itself.

## References

- `otel-collector-config.yaml` — local collector exports to development-only destinations/debug output.
- `docker/observability/prometheus.yml` — local Prometheus configuration.
- `docs/10-deployment-and-environments.md:53-79` — export is configurable but production instrumentation is incomplete.
- `docs/tickets/ttw-051-operationalize-observability.md` — application observability contracts and release gates.

## Acceptance criteria

- [ ] Infrastructure and TTW-051 application signals reach access-controlled, encrypted destinations with approved retention and cost limits.
- [ ] Automated tests demonstrate redaction and bounded cardinality for sensitive/high-risk attributes.
- [ ] Dashboards cover service objectives, runtime, data, queues/providers, deployments, backups and security with revision/environment correlation.
- [ ] Every release-blocking/page alert has owner, severity, runbook and successful end-to-end delivery plus recovery evidence.
- [ ] Telemetry-pipeline failure and exporter pressure are detected without destabilizing application workloads.
- [ ] Required cost labels, environment budgets and anomaly alerts work, and a baseline monthly/unit-cost report is recorded.

## Out of scope

- Adding missing domain telemetry inside application modules → TTW-051.
- Disaster-recovery execution → TTW-067.

## Design review

Record reviewer, date, pipeline/data flows, sensitive-data controls, retention, availability, alert ownership, cost/cardinality estimates, failure modes and verdict.

## Implementation reviews

Require independent implementation and security/privacy review of telemetry data, access, alerts and costs; repeat until PASS.

## Verification evidence

Record configuration/policy checks, redaction tests, correlated trace IDs, alert test/acknowledgement timestamps, outage/load results, budget events and cost report.

## Completion summary

Summarize pipeline, access/retention, dashboards, alerts/runbooks, failure behavior, cost controls and known blind spots.
