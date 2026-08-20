# TTW-067 — Automate backup and prove disaster recovery

**Epic:** 6 — Production infrastructure as code\
**Status:** Not started\
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

## Acceptance criteria

- [ ] Business and technical owners approve data-class RPO/RTO, retention, failure domains, authority and communication paths.
- [ ] Database, object and required configuration/state backups are encrypted, protected, monitored and isolated from workload/deployment deletion rights.
- [ ] Automated isolated restores validate technical integrity and explicit money, payout, refund, order, inventory and object invariants.
- [ ] Redis/queue/session loss recovery reconciles from authoritative state without duplicate external or inventory effects.
- [ ] A clean-Droplet and fallback-region recovery exercise achieves approved RPO/RTO, including application validation, Namecheap DNS cutover rehearsal and safe failback.
- [ ] Backup/restore failures and stale recovery evidence alert named owners; unmet objectives create blocking follow-up tickets.

## Out of scope

- Executing an actual production disaster action without explicit authorization.
- Correcting domain idempotency/reconciliation logic → TTW-010–TTW-015.

## Design review

Record reviewer, date, data classes/invariants, RPO/RTO, backup isolation/immutability, privacy retention, outage scenarios, authorization, reconciliation, failback and verdict.

## Implementation reviews

Require two independent reviewers covering data/business correctness and infrastructure/security. Repeat implementation, restore and runbook review until both PASS.

## Verification evidence

Record backup identifiers/times (not secrets), isolated targets, exact restore/invariant commands, row/object/checksum results, achieved RPO/RTO, alert delivery, decisions and exercise timeline.

## Completion summary

Summarize protected data, schedules/retention, isolation, recovery procedures, rehearsals, achieved objectives, reconciliation and residual risks.
