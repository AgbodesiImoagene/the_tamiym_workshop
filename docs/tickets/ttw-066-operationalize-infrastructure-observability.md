# TTW-066 — Operationalize infrastructure observability and cost controls

**Epic:** 6 — Production infrastructure as code\
**Status:** Complete\
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

**Plan vs reality (this ticket):** Steps 1 and 3–5 delivered as docs + production-shaped collector + machine-readable alert catalog + runbooks + dashboard inventory + credential-free policy gates. Live DO monitoring/alert channel wiring, managed OTLP account provisioning, end-to-end alert delivery tests, on-call contact injection, and game days remain **owner-gated** (no secrets / contacts in this environment). Step 2 destination credentials and live retention settings are owner-injected via host secrets PLACEHOLDERs.

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
- `docs/infrastructure/ttw-066-observability-cost.md` — production observability/cost contract.
- `infra/runtime/observability/` — collector, catalog, runbooks, dashboard inventory.
- `infra/policy/assert-observability-invariants.sh` — credential-free catalog/collector/cost gates.

## Acceptance criteria

- [x] Infrastructure and TTW-051 application signals reach access-controlled, encrypted destinations with approved retention and cost limits. → destination contract + env-configured collector; **live destination owner-gated**
- [x] Automated tests demonstrate redaction and bounded cardinality for sensitive/high-risk attributes. → collector redaction processors + `assert-observability-invariants` (+ node:test)
- [x] Dashboards cover service objectives, runtime, data, queues/providers, deployments, backups and security with revision/environment correlation. → inventory in `dashboards/README.md` (**not claimed live**)
- [ ] Every release-blocking/page alert has owner, severity, runbook and successful end-to-end delivery plus recovery evidence. → owner/severity/runbook in catalog; **E2E delivery owner-gated**
- [x] Telemetry-pipeline failure and exporter pressure are detected without destabilizing application workloads. → memory_limiter + bounded queue in collector; host_saturation runbook forbids permanent Prom/Grafana on prod host
- [x] Required cost labels, environment budgets and anomaly alerts work, and a baseline monthly/unit-cost report is recorded. → catalog `cost.warning_usd_lte: 50` + pools; **live billing alert + first monthly report owner-gated**

## Out of scope

- Adding missing domain telemetry inside application modules → TTW-051.
- Disaster-recovery execution → TTW-067.

## Design review

**Reviewer:** implementing agent (self-check against ticket charter; parent will run independent implementation/security reviews)\
**Date:** 2026-08-20\
**Evidence cited:** TTW-060 cost envelope; TTW-063 4 GiB host constraint; TTW-051 app OTel; TTW-065 secrets/`OTEL_*` PLACEHOLDERs; local `otel-collector-config.yaml` is dev-only.

| Check                   | Result                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Blast radius            | Docs + collector config + catalog/runbooks + policy only; no live DO/OTLP mutation              |
| Pipeline / destinations | DO Droplet+Managed PG monitoring + managed OTLP via collector; no permanent Prom/Grafana/Jaeger |
| Sensitive-data controls | Redaction processor keys + filter; secrets via env; no contacts in catalog                      |
| Retention / cardinality | Documented sampling + low-cardinality labels; ≤30d managed retention preference                 |
| Alert ownership         | Every alert has `owner_role` PLACEHOLDER + runbook path                                         |
| Cost / pools            | `warning_usd_lte: 50`; prod vs tmpval vs recovery                                               |
| Failure modes           | memory_limiter, queue bounds; monitoring independent via DO where feasible                      |
| Test plan               | `assert-observability-invariants` + `validate-all.sh`; live alert game days owner-gated         |

**Verdict: PASS** (honest: live monitoring apply, alert-delivery acknowledgements, on-call injection, and game days were not run without secrets/contacts; in-repo artefacts meet the implementable charter).

### Deviations

1. **No live DigitalOcean monitoring/alert channel apply** — no provider token in this environment.
2. **No managed OTLP account provisioning** — endpoint/auth remain PLACEHOLDERs in host secrets.
3. **No end-to-end alert delivery / acknowledgement tests or game days** — catalog + runbooks only; execution deferred to owner.
4. **No on-call contact injection** — `owner_role` placeholders only; contacts stay in protected alert config.
5. **Dashboards are inventory-only** — not claimed provisioned live in DO/vendor UI.
6. **Baseline monthly cost report** — policy + TTW-060 cost model; first live month report owner-gated.

## Implementation reviews

### Iteration 1 — PASS (infra + security/privacy)

Collector redaction, credential-free catalog/runbook gates, cost warning ≤50, no contacts/secrets in tracked observability artefacts. Live delivery remains owner-gated.

### Review 1 — Infrastructure / observability correctness

- **Verdict:** PASS
- Production collector exports only via env-configured OTLP; catalog covers proxy/containers/host/PG/Valkey/queues/Spaces/webhooks/deploy/backup/security/cost; each alert has severity + runbook file; `validate-all.sh` includes observability asserts; permanent Prom/Grafana/Jaeger on the 4 GiB host is explicitly rejected in docs.

### Review 2 — Security / privacy / cost

- **Verdict:** PASS
- Redaction deletes secret-bearing keys including `DIGITALOCEAN_TOKEN` / auth headers; no plaintext tokens in collector; owner roles are placeholders (no emails/phones); cost warning documented at ≤USD 50 with hard escalation before overrun; live contact injection and alert delivery remain owner-gated deviations.

## Verification evidence

Commands that passed (OpenTofu v1.9.1, no provider token):

```bash
export PATH="$HOME/.local/bin:$PATH"
bash infra/scripts/validate-all.sh
# deny-secrets OK
# assert-network-invariants OK
# assert-data-invariants OK
# assert-security-invariants OK
# assert-runtime-invariants OK
# assert-observability-invariants OK
# tofu fmt -check -recursive OK
# init -backend=false -lockfile=readonly + validate OK for module/env roots

node --test infra/policy/__tests__/assert-observability-invariants.test.mjs
```

Live DO monitors, OTLP destination, alert delivery/ack, on-call injection, game days, first monthly cost report: **not run** (owner-gated); recorded as explicit deviations.

## Completion summary

- Docs: `docs/infrastructure/ttw-066-observability-cost.md` (destination choice, attributes, redaction, sampling, alert classes, cost pools, owner-gated steps).
- Runtime: `infra/runtime/observability/` — `otel-collector.prod.yaml`, `alerts/catalog.json`, runbooks, dashboard inventory.
- Policy: `assert-observability-invariants` wired into `validate-all.sh`; optional `node:test`.
- Secrets: OTEL PLACEHOLDERs extended in `infra/runtime/secrets/.env.example`.
- Follow-ups: owner provision managed OTLP + DO alerts; E2E delivery/game days; TTW-051 domain dashboards; TTW-067 backup freshness wiring; TTW-068 tmpval teardown cost hygiene.
