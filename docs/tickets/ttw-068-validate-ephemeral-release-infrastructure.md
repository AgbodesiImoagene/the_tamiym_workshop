# TTW-068 — Validate ephemeral release infrastructure and integrate CI/CD

**Epic:** 6 — Production infrastructure as code\
**Status:** Not started\
**Risk:** High\
**Blocked by:** TTW-062–TTW-067, TTW-050, TTW-051, TTW-053\
**Blocks:** TTW-054

## Background

Infrastructure is not production-ready merely because an apply succeeds. The exact candidate must be deployable into an isolated production-shaped environment, pass network, security, migration, runtime, dependency, observability, recovery and browser gates, and generate immutable evidence usable by the controlled-release process. A permanently running staging environment is deferred to keep launch costs low. The current CI workflow has no image, IaC, release-environment or deployment jobs.

## Proposal

Create a gated DigitalOcean release workflow that builds once, publishes immutable registry artefacts, produces environment-specific OpenTofu plans, creates a temporary production-shaped Droplet/data fixture through the approved protected GitHub identity and deploys exact image digests. Run infrastructure smoke/policy tests, one-off migrations, OpenAPI/contracts, telemetry/alerts, Playwright/UAT, host-reboot and container rollback/roll-forward validation, then destroy temporary resources after preserving evidence. Produce a signed/immutable release manifest connecting commit, dependencies, images/SBOMs, OpenTofu/provider locks, plan, configuration schema, migrations and test evidence. Production planning may be automated, but production apply/deploy remains an owner-approved TTW-054 action with exact DigitalOcean project, region, Droplet and plan confirmation.

## Invariants

- Temporary validation and production consume the same immutable code/images/modules; only reviewed environment inputs, capacity and protected endpoints differ.
- A candidate is built once and promoted by digest, never rebuilt for production.
- Failed infrastructure, migration, security, alert, recovery or browser gates block promotion.
- CI cannot apply production without explicit environment approval and exact candidate/plan verification.
- Rollback/roll-forward does not duplicate payments, refunds, payouts, inventory, notifications, webhooks or queued work.

## Implementation plan

1. Define release-manifest schema, artefact retention, evidence ownership and mapping to TTW-054 stop/go criteria.
2. Extend CI to build/test/scan/sign or attest images, publish them to the approved registry, and validate/plan OpenTofu with pinned dependency/provider locks.
3. Add approval-gated temporary-environment apply/deploy, controlled migration job, post-deploy infrastructure/application smoke checks and guaranteed teardown with budget/time limits.
4. Run TTW-050 contract, TTW-051 observability/alert and TTW-053 Playwright/UAT gates against temporary real DNS and exact candidate digests.
5. Exercise failed deployment, health rollback, safe roll-forward, worker/scheduler drain, host reboot/loss, data dependency failure and restoration linkage.
6. Generate a production plan and go/no-go packet without applying it; rehearse the handoff to TTW-054 and document environment teardown/retention policy.

## Test and observability plan

- Unit/component: Workflow/schema/policy tests, digest/plan/manifest verification and protected-environment permission tests.
- Integration/e2e: From clean checkout, plan/apply the temporary environment, migrate, deploy exact digests, run all gates, generate the immutable manifest and destroy the environment.
- Failure, retry, and concurrency: Parallel releases, stale plan, changed digest, failed migration/health check, worker drain, alert failure and interrupted apply/deploy.
- Logs, metrics, traces, and alerts: Deployment annotations, revision correlation, workflow audit, gate results, rollback signals and release cost/capacity baseline.

## References

- `.github/workflows/ci.yml:1-57` — current CI ends at application checks.
- `docs/tickets/ttw-050-gate-openapi-contracts.md` — contract release gate.
- `docs/tickets/ttw-051-operationalize-observability.md` — telemetry and alert release gate.
- `docs/tickets/ttw-053-complete-release-browser-uat.md` — temporary-environment browser/UAT release gate.
- `docs/tickets/ttw-054-rehearse-controlled-release.md` — controlled production release and recovery workflow.

## Acceptance criteria

- [ ] A clean, pinned CI run builds once and publishes immutable images, SBOM/provenance, OpenTofu plan and release manifest tied to the exact source revision.
- [ ] Approval-gated automation reproducibly creates/updates an isolated temporary environment, migrates safely and deploys the exact candidate digests without secret leakage.
- [ ] Infrastructure policy/smoke, TTW-050 contracts, TTW-051 telemetry/alerts and TTW-053 Playwright/UAT all pass against temporary real hosts.
- [ ] Stale plan/digest, parallel release, migration, health, dependency and alert failures block promotion and invoke tested recovery behavior.
- [ ] The generated production plan/go-no-go packet is reviewable and cannot be applied without TTW-054's explicit human authorization.
- [ ] Temporary-to-production differences, maximum lifetime/cost, teardown/retention and operating ownership are documented and approved; orphan detection is tested.

## Out of scope

- Authorizing or executing the production release → TTW-054.
- Waiving failed application, security, recovery or business gates.

## Design review

Record reviewer, date, CI trust boundaries, artefact promotion, environment protection, manifest/evidence, migration sequence, gate wiring, concurrency/recovery, cost and verdict.

## Implementation reviews

Require independent implementation and security review of workflow permissions, supply chain, protected environments and recovery; repeat until PASS.

## Verification evidence

Record workflow run/revision, artefact digests/attestations, provider/module locks, temporary plan/apply/deploy identifiers, migration/gate reports, failure injections, production plan checksum and approvals without credentials.

## Completion summary

Summarize release automation, exact candidate, temporary-validation results, manifest, recovery tests, production handoff, ownership/cost and remaining blockers.
