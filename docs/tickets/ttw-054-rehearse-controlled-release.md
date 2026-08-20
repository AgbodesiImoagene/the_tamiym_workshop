# TTW-054 — Rehearse and execute a controlled release

**Epic:** 5 — Contracts, observability and release proof  
**Status:** Not started  
**Risk:** High  
**Blocked by:** TTW-010–TTW-015, TTW-020–TTW-027, TTW-030–TTW-036, TTW-040–TTW-043, TTW-050–TTW-053, TTW-068\
**Blocks:** None

## Background

The repository provides local PostgreSQL, Redis, MinIO and observability services but no production deployment workflow or infrastructure definition. Staging is described as recommended rather than formalized. There is no committed database migration history directory despite a mature schema, no documented production migration/compatibility sequence, no backup-restore proof, no queue/webhook drain plan and no rehearsed rollback or roll-forward runbook. Passing application tests alone cannot establish that a release can be deployed or recovered without data or money-state loss.

## Proposal

Define an immutable release manifest and operator-controlled deployment checklist, then rehearse it in an isolated temporary production-shaped DigitalOcean environment before any production action. Establish a reviewed Prisma migration baseline and forward-only migration policy with explicit application/schema compatibility windows. Prove backup creation and restoration, migration and roll-forward/rollback procedures, queue/scheduler/provider handling, secrets/config validation, observability and smoke/UAT gates. Execute production only with explicit user/change approval, named operators, stop/go criteria and a post-release reconciliation window.

## Invariants

- No production deployment, migration, rollback or destructive operation runs without explicit human authorization and exact target/environment confirmation.
- A verified restorable backup exists before migration; backup success is not inferred from command exit alone.
- Migration and application ordering preserves compatibility, and financial/ledger/inventory invariants hold before and after every rehearsal/action.
- Rollback never replays a payment, refund, payout, notification, media or inventory effect; unsafe schema reversal uses an approved roll-forward recovery instead.
- Queues, schedulers and webhooks are deliberately drained, paused, buffered or kept idempotently active according to the runbook.
- Release artefacts are immutable and traceable to commit, dependency lock, migration set, environment contract and test evidence; secrets never enter them.
- Failure of any stop/go, health, alert, reconciliation or smoke criterion halts progression and invokes the recorded recovery path.

## Implementation plan

1. Approve environment topology, deployment ownership, access/change controls, maintenance expectations, worker/scheduler topology, provider endpoints and secrets-management contract.
2. Create an immutable release manifest containing source revision, build/image digests, Node/pnpm contract, generated contracts, migration checksums, configuration schema and required gate/report references.
3. Establish and review the Prisma migration baseline from the deployed database state; add CI proof that a blank database and an approved production-like snapshot migrate to the candidate schema without drift.
4. Write and automate safe preflight checks for target identity, backup destination, capacity, database/Redis/object-store/provider connectivity, configuration/secrets presence, queue depth, reconciliation status and active incidents.
5. Create backup, restore, migration, application rollback/roll-forward, queue/scheduler/webhook, object-storage and incident-communication runbooks with exact commands, permissions and abort criteria.
6. Rehearse backup restoration into an isolated environment; validate row/object counts, checksums and sampled domain invariants. Rehearse forward migration, old/new application compatibility, failure injection and recovery on production-like volume.
7. Deploy the candidate to temporary validation, run TTW-050 contract checks, TTW-051 telemetry/alerts and TTW-053 UAT, tear down temporary resources after evidence capture, then hold a documented go/no-go review with business, engineering and operations.
8. After explicit production approval, execute the controlled rollout with canary/health gates where supported, monitor provider/queue/money indicators, reconcile controlled and organic transactions, and record final sign-off or recovery.

## Test and observability plan

- Unit/component: Validate release-manifest schema, configuration checks, migration checksum/drift logic and invariant/reconciliation queries.
- Integration/e2e: Migrate both blank and restored production-like databases; boot previous and candidate applications across the compatibility window; restore object/database data; execute temporary-environment smoke and controlled UAT.
- Failure, retry, and concurrency: Inject failed migration step, incompatible app/schema ordering, worker interruption, delayed/duplicate webhook, queue retry exhaustion, provider outage and restore failure; prove stop/go logic and safe roll-forward/rollback without duplicate business effects.
- Logs, metrics, traces, and alerts: Dashboard API, database, webhook/provider, money reconciliation, queues, media and auth before/during/after rollout; preserve redacted deployment audit, alert delivery, trace correlation and reconciliation evidence through the approved retention period.

## References

- `.github/workflows/ci.yml` — CI is the only committed workflow; no deployment/release workflow exists.
- `docker-compose.yml` — local infrastructure only.
- `apps/api/prisma/schema.prisma` — mature schema without a committed `prisma/migrations/` history in the reviewed tree.
- `package.json:18-19` — root database scripts delegate to API scripts that are not currently declared.
- `docs/10-deployment-and-environments.md:5-10,81-100` — staging, production infrastructure, migration, rollback and incident response remain incomplete.
- `docs/backend-production-readiness.md:58-75,345-362` — migration/release, storage and backup/restore runbooks remain production requirements.
- `docs/release-criteria.md` — current domain-specific release checklist.
- `docs/16-playwright-regression-strategy.md:92-98` — release-candidate staging acceptance gate.

## Acceptance criteria

- [ ] A reviewed immutable release manifest ties source, builds, lockfile, contracts, migrations, configuration and verification evidence together.
- [ ] Blank and restored production-like databases migrate deterministically with no schema drift, and previous/candidate compatibility is proven for the rollout sequence.
- [ ] A database/object backup is restored in isolation and validated by integrity plus business-invariant checks; measured recovery time/data loss meet approved objectives.
- [ ] Failure-injection rehearsal proves the stop/go and recovery paths without duplicate money, inventory, queue, notification or media effects.
- [ ] Staging passes contract, observability/alert and full browser/UAT gates on the exact candidate artefacts.
- [ ] Security, operations and independent implementation reviews approve the runbooks, permissions, secrets handling and evidence.
- [ ] Production execution occurs only after explicit user/change approval, and post-release health plus financial/inventory reconciliation remains clean through the approved observation window.

## Out of scope

- Implementing unresolved product, correctness or security blockers → TTW-010–TTW-015, TTW-020–TTW-027, TTW-030–TTW-036 and TTW-040–TTW-043.
- Building observability or acceptance coverage → TTW-051 and TTW-053.
- Selecting a hosting vendor or changing geographic/product scope without a separately approved architecture/business ticket.

## Design review

Record reviewer, date, blast radius, environment/topology, migration compatibility and failure modes, backup RPO/RTO, access/approval controls, queue/webhook/provider handling, stop/go criteria, evidence retention and verdict before implementation.

## Implementation reviews

Record each independent review iteration, findings, fixes, migration/restore/security/operations verdicts, rehearsal results and overall verdict. A production change record and user authorization are separate required approvals.

## Verification evidence

Record immutable revisions/digests/checksums, target environment identity, exact preflight/backup/restore/migration/recovery commands, invariant counts, timings, alerts, UAT reports, go/no-go attendees and post-release reconciliation results. Redact all credentials and sensitive customer/payment data.

## Completion summary

Summarize candidate and production artefacts, rehearsal and release timeline, migrations, backup/restore results, stop/go decisions, incidents/recovery, reconciliation, approvals and follow-up actions.
