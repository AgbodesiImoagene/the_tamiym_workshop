# TTW-060 — Finalize the DigitalOcean launch architecture and cost evidence

**Epic:** 6 — Production infrastructure as code\
**Status:** Complete\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-061–TTW-068

## Background

The owner selected DigitalOcean on 2026-08-20 after the proposed AWS managed stack could not credibly satisfy the sub-USD-50 normal-month ceiling. The approved direction is OpenTofu/HCL, one 4 GiB application Droplet, single-node Managed PostgreSQL, Spaces, host-local Valkey, temporary validation resources and backup-led regional recovery. Frankfurt was provisional pending a Nigeria latency probe; **London is now the approved primary** with Frankfurt as recovery.

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
- Initial maximum recovery objectives are 15-minute RPO/four-hour RTO for recoverable PostgreSQL failures and 24-hour RPO/RTO for regional loss of PostgreSQL/config; **Spaces media and OpenTofu state regional RPO may exceed 24h** until replication is funded.
- **Primary region = London (`lon1`); recovery = Frankfurt (`fra1`)** per 2026-08-20 Lagos latency evidence.

## Invariants

- Cost evidence includes compute, database, objects, backups, monitoring, traffic, temporary validation and taxes/fees as separately disclosed assumptions.
- The design never claims horizontal autoscaling, multi-node availability or workload identity that the launch topology does not provide.
- API, worker and singleton scheduler roles remain independently deployable containers even on one host.
- Production PostgreSQL dumps, configuration recovery material, and OpenTofu state **have defined export/recovery paths independent of the Droplet**; live restore/rebuild rehearsal is TTW-067. Spaces media regional replication is deferred (owner-accepted risk).
- No persistent DigitalOcean resources are created in this ticket.

## Implementation plan

1. Measure representative latency from Nigeria to Frankfurt and London; approve primary and recovery regions.
2. Reproduce dated DigitalOcean prices for minimal, expected 12-month and stress scenarios, including exceptional scale-event spend.
3. Define per-container CPU/memory/disk budgets and prove the envelope fits a 4 GiB Droplet without swap-dependent correctness.
4. Spike S3-compatible storage and remote-state locking locally; record deferred live DO Managed PostgreSQL disposable spike as TTW-061/064 gate.
5. Select S3-compatible remote-state backend with native lockfile; prove on MinIO; require Spaces proof in TTW-061.
6. Approve backup retention, off-provider export, region rebuild, patch/reboot, token/SSH and on-call procedures by data class.
7. Update ADR-001 with evidence, exact cost envelope, compromises, exit path and quantitative upgrade triggers.

## Test and observability plan

- Unit/component: Validate cost-model arithmetic and resource-budget calculations (`pnpm infra:cost-model:test`, `pnpm infra:budget-check`).
- Integration: Local MinIO Terraform state apply/destroy with versioning and lock objects.
- Failure/recovery: Documented by data class; live restore rehearsal → TTW-067.
- Alerts: Budget alert at USD 45; monitoring included at $0.

## References

- `docs/18-production-infrastructure-options.md`
- `docs/19-digitalocean-production-architecture-decision.md`
- `docs/infrastructure/ttw-060-*.md`
- `scripts/infrastructure/cost-model.mjs`

## Acceptance criteria

- [x] Frankfurt/London latency evidence is recorded and the primary/recovery choice approved.
- [x] A reproducible dated cost model prices minimal, expected and stress scenarios and demonstrates the normal baseline below USD 50.
- [x] Compatibility evidence recorded with **explicit deviations**: MinIO S3 + app contracts proven; live Managed PostgreSQL disposable spike and constrained Droplet boot deferred to TTW-061/063/064 as hard gates.
- [x] S3-compatible remote-state locking proven on MinIO; Spaces-native proof required in TTW-061 before persistent applies.
- [x] Backup retention, recovery objectives (by data class), provider/SSH access and operational ownership are approved.
- [x] ADR-001 records explicit availability/security compromises, upgrade triggers, portability boundaries and exit costs.

## Out of scope

- Creating persistent provider resources → TTW-061–TTW-068.
- Executing a production deployment → TTW-054.
- Constrained production-image boot on 4 GiB → TTW-063.
- Live Managed PostgreSQL disposable cluster → TTW-061/064.

## Design review

- **Reviewer:** Implementing agent (design gate)
- **Date:** 2026-08-20
- **Blast radius:** Docs, cost/budget scripts, bootstrap proof HCL; no production cloud mutation
- **Price sources:** DO public pricing 2026-08-20
- **Latency method:** WonderNetwork Lagos series; Dublin Spaces HTTPS informational only
- **Resource budget:** 3584 MiB hard + 512 MiB headroom
- **Spikes / deviations:** As compatibility-spikes doc
- **Verdict:** **PASS** — architecture/cost gate may close with recorded deviations; live DO fixtures remain downstream hard gates

## Implementation reviews

### Review 1 — Infrastructure / cost (iteration 1)

- **Verdict:** CHANGES_REQUIRED
- **Findings:** Spike ACs overstated; review PASS pre-recorded; stress ADR soft-rounded; docs/18 gate stale
- **Fixes:** Rewrote ACs/deviations; honest review log; stress **89.65**; docs/18 status section

### Review 2 — Security / recovery (iteration 1)

- **Verdict:** CHANGES_REQUIRED
- **Findings:** Spike/state ACs overstated; regional RPO overstated for Spaces/state; MinIO≠Spaces; fabricated PASS; “tested restore” overclaim; example credentials; “narrowly scoped” token
- **Fixes:** Data-class RPO; MinIO vs Spaces wording; ADR soften; `CHANGE_ME` placeholders; token scoping deferred to TTW-065

### Review 1 — Infrastructure / cost (iteration 2)

- **Reviewer:** Independent generalPurpose agent
- **Verdict:** **PASS**
- **Evidence:** Cost 45.65/47.65/89.65; London primary; ACs match deviations; docs/18 updated; no fabricated PASS

### Review 2 — Security / recovery (iteration 2)

- **Reviewer:** Independent generalPurpose agent
- **Verdict:** CHANGES_REQUIRED
- **Findings:** ADR regional RPO still too broad; ticket invariant “have tested”
- **Fixes:** ADR data-class RPO; invariant → defined paths, rehearsal TTW-067

### Review 2 — Security / recovery (iteration 3)

- **Reviewer:** Independent generalPurpose agent
- **Verdict:** **PASS**
- **Evidence:** ADR data-class RPO; ticket invariant uses defined paths + TTW-067 rehearsal

## Verification evidence

```bash
pnpm infra:cost-model          # minimal 45.65, expected 47.65, stress 89.65
pnpm infra:cost-model:test     # 6 passing
pnpm infra:budget-check        # hardSum 3584, ok true
```

- Latency: `docs/infrastructure/ttw-060-latency-evidence.md`
- Spikes/deviations: `docs/infrastructure/ttw-060-compatibility-spikes.md`
- State proof: `docs/infrastructure/ttw-060-opentofu-state-backend.md`
- Ops/RPO: `docs/infrastructure/ttw-060-operations-access.md`

## Completion summary

London primary after Lagos latency evidence; mandatory baseline **USD 45.65**/mo; 4 GiB envelope and MinIO state+lockfile proven; operations ownership and data-class RPO recorded; ADR-001 updated. Live DO Managed PostgreSQL disposable spike and Spaces-native state proof are explicit TTW-061/064 gates, not silently claimed here.
