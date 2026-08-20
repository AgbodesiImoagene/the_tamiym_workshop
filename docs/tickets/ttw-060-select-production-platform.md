# TTW-060 — Finalize the DigitalOcean launch architecture and cost evidence

**Epic:** 6 — Production infrastructure as code\
**Status:** In progress\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-061–TTW-068

## Background

The owner selected DigitalOcean on 2026-08-20 after the proposed AWS managed stack could not credibly satisfy the sub-USD-50 normal-month ceiling. The approved direction is OpenTofu/HCL, one 4 GiB application Droplet, single-node Managed PostgreSQL, Spaces, host-local Valkey, temporary validation resources and backup-led regional recovery. Frankfurt is provisional pending a Nigeria latency probe; London is the fallback/recovery location.

## Proposal

Complete ADR-001 with reproducible regional pricing, latency evidence, resource budgets, backup retention and focused compatibility spikes. Confirm that the full mandatory baseline—not merely headline compute—fits below USD 50/month before persistent resources are created. Explicitly document the availability, security and scaling compromises of the single-Droplet launch and the thresholds that trigger a load balancer, multiple Droplets, managed Valkey or provider reconsideration.

## Owner decision

- DigitalOcean replaces AWS for the initial production environment.
- Use OpenTofu/HCL and portable container/PostgreSQL/Redis/S3/OpenTelemetry contracts.
- Target one 4 GiB / 2 vCPU Basic Droplet, smallest single-node Managed PostgreSQL and Spaces.
- Run Valkey on the Droplet initially; PostgreSQL remains authoritative.
- Keep Namecheap as registrar and initial DNS provider.
- Defer permanent staging, load balancing, multiple Droplets, managed Valkey and warm standby.
- Use temporary production-shaped validation resources with enforced teardown.
- The owner is the initial GitHub production approver and escalation contact; personal contact details stay in protected configuration.
- Target below USD 50/month under normal low traffic, excluding tax, provider fees, domain renewal and exceptional scale events.
- Initial maximum recovery objectives are 15-minute RPO/four-hour RTO for recoverable failures and 24-hour RPO/RTO for regional loss; they may be relaxed through an explicit cost/risk decision.

## Invariants

- Cost evidence includes compute, database, objects, backups, monitoring, traffic, temporary validation and taxes/fees as separately disclosed assumptions.
- The design never claims horizontal autoscaling, multi-node availability or workload identity that the launch topology does not provide.
- API, worker and singleton scheduler roles remain independently deployable containers even on one host.
- Production data, objects, configuration and OpenTofu state have tested export/recovery paths independent of the Droplet.
- No persistent resources are created until the cost and compatibility evidence passes design review.

## Implementation plan

1. Measure representative latency from Nigeria to Frankfurt and London; approve primary and recovery regions.
2. Reproduce dated DigitalOcean prices for minimal, expected 12-month and stress scenarios, including exceptional scale-event spend.
3. Define per-container CPU/memory/disk budgets and prove the full runtime fits a 4 GiB Droplet without swap-dependent correctness.
4. Spike Managed PostgreSQL TLS/private connectivity, host Valkey/BullMQ no-eviction behavior, Spaces access, provider webhooks, OpenTelemetry export and singleton scheduling.
5. Select and prove an OpenTofu-compatible remote-state backend with locking, version recovery and no secrets.
6. Approve backup retention, off-provider export, region rebuild, patch/reboot, token/SSH and on-call procedures.
7. Update ADR-001 with evidence, exact cost envelope, compromises, exit path and quantitative upgrade triggers.

## Test and observability plan

- Unit/component: Validate cost-model arithmetic, configuration schema and resource-budget calculations.
- Integration/e2e: Use disposable resources for decision-blocking spikes and prove their destruction.
- Failure, retry, and concurrency: Host loss, database unavailability, Valkey loss, duplicate scheduler, failed deployment, expired token and restore/rebuild.
- Logs, metrics, traces, and alerts: Define retention, redaction, service-health, backup-age and cost-alert requirements within the ceiling.

## References

- `docs/18-production-infrastructure-options.md` — updated provider and cost comparison.
- `docs/19-digitalocean-production-architecture-decision.md` — accepted architecture and compromises.
- `docs/10-deployment-and-environments.md` — production operating requirements.
- `apps/api/src/app.module.ts` — current HTTP, queue and schedule composition.
- `apps/api/src/storage/s3.service.ts` — S3-compatible storage contract.

## Acceptance criteria

- [ ] Frankfurt/London latency evidence is recorded and the primary/recovery choice approved.
- [ ] A reproducible dated cost model prices minimal, expected and stress scenarios and demonstrates the normal baseline below USD 50 or returns for owner decision.
- [ ] Disposable spikes prove the 4 GiB resource envelope, managed PostgreSQL, Valkey/BullMQ, Spaces, webhook and telemetry contracts.
- [ ] OpenTofu remote-state locking and recovery are proven before TTW-061.
- [ ] Backup retention, recovery objectives, provider/SSH access and operational ownership are approved.
- [ ] ADR-001 records explicit availability/security compromises, upgrade triggers, portability boundaries and exit costs.

## Out of scope

- Creating persistent provider resources → TTW-061–TTW-068.
- Executing a production deployment → TTW-054.

## Design review

Record reviewer, date, price sources, latency method, resource budget, spikes, trust boundaries, recovery assumptions, upgrade triggers and verdict.

## Implementation reviews

Independently review model arithmetic, source dates, spike cleanup, security/recovery consequences and ADR conclusion; repeat until PASS.

## Verification evidence

Record owner approvals, price source links/dates, model checks, latency results, spike commands/results/cost, cleanup evidence and approved ADR revision.

## Completion summary

Summarize the chosen region, validated baseline cost, resource envelope, recovery/operating model, compromises, scale triggers and residual risks.
