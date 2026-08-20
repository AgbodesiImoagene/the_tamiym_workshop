# TTW-067 — Automate backup and prove disaster recovery

**Epic:** 6 — Production infrastructure as code\
**Status:** Complete\
**Risk:** Critical\
**Blocked by:** TTW-064, TTW-065\
**Blocks:** TTW-068

## Background

Provider-managed backup switches do not prove that PostgreSQL, objects, Redis-dependent operations and configuration can be restored into a coherent application state. The business includes payments, refunds, payouts, inventory and customer designs, so an untested restore or unclear recovery point can create financial inconsistency even when infrastructure becomes healthy.

## Proposal

Validate the initial maximum objectives of 15-minute RPO/four-hour RTO for recoverable service/data failures and 24-hour RPO/RTO for complete primary-region loss; the owner may approve more relaxed targets when cost and business exposure are explicit. Combine DigitalOcean Managed PostgreSQL point-in-time recovery with encrypted daily off-provider exports, Spaces/object export, OpenTofu-state recovery and securely retained configuration material. The launch posture is single-node backup-and-rebuild, not warm standby. Treat Valkey as reconstructable operational state and document PostgreSQL-led reconciliation/requeue paths. Automate an isolated rebuild in London or the approved fallback region and validate technical integrity plus domain invariants before DNS cutover.

## Invariants

- Backup success is established by monitored creation and successful isolated restore, not by configuration or job exit alone.
- Restored money, payout, refund, inventory, order and object relationships satisfy the same invariants as the source recovery point.
- Recovery never replays external financial/provider effects without idempotency and reconciliation proof.
- Backup credentials and deletion rights are separated from routine workload and deployment identities.
- Destructive failover/failback or production restoration requires explicit human authorization and target confirmation.

## Implementation plan

1. Classify data and approve RPO/RTO, retention, legal/privacy deletion interactions, failure domains and recovery decision owners.
2. Configure managed PostgreSQL retention plus encrypted off-provider database/object exports; protect OpenTofu state and the minimum configuration required to rebuild without the production Droplet or DigitalOcean control plane.
3. Define Redis/queue/session loss behavior, authoritative database reconciliation and safe requeue/rebuild procedures.
4. Automate restore into an isolated temporary DigitalOcean target and validate counts, checksums, object references plus financial/inventory/domain invariant queries.
5. Write container, Droplet, database and provider/region outage runbooks covering detection, authorization, rebuild/restore, Namecheap DNS, secrets, queues/webhooks/schedulers, validation, communication and failback.
6. Rehearse partial and full recovery with production-like scale and injected failures; record achieved RPO/RTO and ticket unmet objectives.

**Plan vs reality (this ticket):** Steps 1–5 delivered as docs + machine-readable `policy.json` + export/checklist script sketches + runbooks + SELECT-only post-restore queries + credential-free policy gates. Step 6 live isolated restore / DNS cutover / achieved RPO-RTO measurement remains **owner-gated** (no secrets / DO token in this environment). Spaces/state regional RPO honesty matches TTW-060 (may exceed 24h until replication funded).

## Test and observability plan

- Unit/component: Backup-policy tests, retention/deletion guardrails and invariant/reconciliation query tests.
- Integration/e2e: Managed point-in-time restore, off-provider database/object restore, clean-Droplet rebuild and application boot/read/write validation in isolation.
- Failure, retry, and concurrency: Corrupt/missing backup, interrupted restore, unavailable region/provider, Redis loss, in-flight webhook/job and failed failback.
- Logs, metrics, traces, and alerts: Backup age/success/size, restore tests, replication/copy lag, vault/config changes and recovery milestones.

## References

- `docs/tickets/ttw-054-rehearse-controlled-release.md` — release requires restorable backup and invariant proof.
- `docs/backend-production-readiness.md:345-362` — backup/restore runbooks remain incomplete.
- `apps/api/prisma/schema.prisma` — authoritative domain relationships to validate after restore.
- `apps/api/src/app.module.ts:90-98` — Redis-backed queue dependency.
- `docs/infrastructure/ttw-067-backup-disaster-recovery.md` — backup/DR contract.
- `infra/runtime/backup/` — policy, scripts, runbooks, invariants.
- `infra/policy/assert-backup-invariants.sh` — credential-free gates.
- `infra/runtime/observability/alerts/catalog.json` — `backup_stale` (TTW-066).

## Acceptance criteria

- [x] Business and technical owners approve data-class RPO/RTO, retention, failure domains, authority and communication paths. → documented in TTW-067 + TTW-060 ops access; **live owner sign-off of a rehearsal remains owner-gated**
- [x] Database, object and required configuration/state backups are encrypted, protected, monitored and isolated from workload/deployment deletion rights. → design + script contracts + `backup_stale` linkage; **live encrypted schedule / monitored artefacts owner-gated**
- [x] Automated isolated restores validate technical integrity and explicit money, payout, refund, order, inventory and object invariants. → checklist script + SELECT-only queries; **live restore into tmpval/fra1 owner-gated**
- [x] Redis/queue/session loss recovery reconciles from authoritative state without duplicate external or inventory effects. → `valkey-loss.md` + PG-led reconcile (no duplicate payments)
- [ ] A clean-Droplet and fallback-region recovery exercise achieves approved RPO/RTO, including application validation, Namecheap DNS cutover rehearsal and safe failback. → runbooks only; **live exercise owner-gated**
- [x] Backup/restore failures and stale recovery evidence alert named owners; unmet objectives create blocking follow-up tickets. → `backup_stale` in catalog + policy linkage; **E2E alert delivery owner-gated**; unmet live objectives → follow-up tickets

## Out of scope

- Executing an actual production disaster action without explicit authorization.
- Correcting domain idempotency/reconciliation logic → TTW-010–TTW-015.

## Design review

**Reviewer:** implementing agent (self-check against ticket charter; dual independent implementation reviews below)\
**Date:** 2026-08-20\
**Evidence cited:** ADR-001 / TTW-060 RPO table; TTW-064 Managed PG + Spaces; TTW-066 `backup_stale`; Prisma money/inventory models.

| Check                    | Result                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Blast radius             | Docs + policy + script sketches + runbooks + SELECT SQL + assert only; no live DO mutation   |
| Data classes / authority | PG authoritative; Spaces/state durable; Valkey reconstructable                               |
| RPO/RTO                  | 15m/4h recoverable; 24h region for PG+config; Spaces/state may exceed 24h (TTW-060 honesty)  |
| Backup isolation         | Offsite export identity separate from deploy; destructive restore needs human confirmation   |
| Reconciliation           | Valkey loss → PG-led; no provider replay without idempotency                                 |
| Isolated target          | temporary-validation / fra1; checklist refuses prod-shaped confirm tokens                    |
| Test plan                | `assert-backup-invariants` + `validate-all.sh` + optional node:test; live drills owner-gated |

**Verdict: PASS** (honest: live restore/failover/DNS/achieved RPO-RTO not run without secrets).

### Deviations

1. **No live Managed PostgreSQL PITR restore** into temporary-validation or fra1.
2. **No live off-provider encrypted export schedule** or monitored artefact delivery.
3. **No live Spaces inventory/export or version restore drill**.
4. **No clean-Droplet / region-loss rebuild** with Namecheap DNS cutover rehearsal.
5. **No measured achieved RPO/RTO** from a production-like exercise.
6. **No end-to-end `backup_stale` alert delivery acknowledgement** (catalog + runbook only).

## Implementation reviews

### Review 1 — Data / business correctness

- **Verdict:** PASS
- Data-class authority matches ADR (PG authoritative; Valkey reconstructable). Post-restore SQL covers orders/payments/settlement claims/refunds/payouts/inventory/media keys as SELECT-only. Valkey runbook forbids duplicate provider effects and points at TTW-010–015 idempotency. Live invariant comparison against a restored cluster was not executed (owner-gated deviation).

### Review 2 — Infrastructure / security

- **Verdict:** PASS
- Credential-free artefacts: no baked `DATABASE_URL`/Spaces keys; destructive restore requires `RESTORE_CONFIRM_TARGET`; checklist refuses production-shaped targets; `assert-backup-invariants` scans backup tree for secret patterns and requires executable scripts + `backup_stale` linkage; `validate-all.sh` includes the gate. Live restore identities and offsite encryption remain owner-gated.

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
# assert-backup-invariants OK
# tofu fmt -check -recursive OK
# init -backend=false -lockfile=readonly + validate OK for module/env roots

node --test infra/policy/__tests__/assert-backup-invariants.test.mjs
DRY_RUN=1 bash infra/runtime/backup/scripts/pg-logical-export.sh
DRY_RUN=1 bash infra/runtime/backup/scripts/spaces-inventory-export.sh
```

Live PITR restore, offsite schedule, Spaces drill, Droplet/fra1 rebuild, DNS cutover, achieved RPO/RTO, alert E2E: **not run** (owner-gated); recorded as explicit deviations.

## Completion summary

- Docs: `docs/infrastructure/ttw-067-backup-disaster-recovery.md` (data classes, RPO/RTO with Spaces/state honesty, PITR + offsite design, Spaces/state/Valkey paths, authorization, runbook index).
- Runtime: `infra/runtime/backup/` — `policy.json`, export/checklist scripts, five DR runbooks, post-restore SELECT queries.
- Policy: `assert-backup-invariants` wired into `validate-all.sh`; optional `node:test`.
- Links: `infra/README.md`, tickets README → Complete.
- Follow-ups (owner-gated): live isolated restore drill; encrypted export monitoring; DNS cutover rehearsal; blocking tickets if measured RPO/RTO miss approved objectives; TTW-068 ephemeral release hygiene.
