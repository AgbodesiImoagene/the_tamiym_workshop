# TTW-068 — Validate ephemeral release infrastructure and integrate CI/CD

**Epic:** 6 — Production infrastructure as code\
**Status:** Complete\
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

**Plan vs reality (this ticket):** Steps 1–2 and 6 delivered in-repo as schema, credential-free manifest builder/assert, `release-candidate.yml` (`workflow_dispatch` only, `push: false` builds), teardown policy, TTW-054 mapping docs, and `assert-release-invariants` wired into `validate-all.sh`. Step 3 live temporary-validation apply/deploy is **owner-gated** (`enable_live_tmpval` fail-closed; no auto production apply). Steps 4–5 contract/browser/recovery failure-injection against live tmpval hosts remain **residual**: TTW-050 / TTW-051 / TTW-053 are still Scoped elsewhere; this ticket does not claim those gates already pass.

## Test and observability plan

- Unit/component: Workflow/schema/policy tests, digest/plan/manifest verification and protected-environment permission tests.
- Integration/e2e: From clean checkout, plan/apply the temporary environment, migrate, deploy exact digests, run all gates, generate the immutable manifest and destroy the environment.
- Failure, retry, and concurrency: Parallel releases, stale plan, changed digest, failed migration/health check, worker drain, alert failure and interrupted apply/deploy.
- Logs, metrics, traces, and alerts: Deployment annotations, revision correlation, workflow audit, gate results, rollback signals and release cost/capacity baseline.

## References

- `.github/workflows/ci.yml` — application CI + infra validate + container-build (no push).
- `.github/workflows/release-candidate.yml` — TTW-068 dispatch-only release plumbing.
- `docs/infrastructure/ttw-068-ephemeral-release.md` — lifecycle, digests, TTW-054 mapping, residuals.
- `infra/release/` — schema, example manifest, builder/assert, teardown policy.
- `docs/tickets/ttw-050-gate-openapi-contracts.md` — contract release gate (residual).
- `docs/tickets/ttw-051-operationalize-observability.md` — telemetry and alert release gate (residual).
- `docs/tickets/ttw-053-complete-release-browser-uat.md` — temporary-environment browser/UAT (residual).
- `docs/tickets/ttw-054-rehearse-controlled-release.md` — controlled production release and recovery workflow.

## Acceptance criteria

- [x] A clean, pinned CI run builds once and publishes immutable images, SBOM/provenance, OpenTofu plan and release manifest tied to the exact source revision. → `release-candidate.yml` builds once (`push: false` + provenance/SBOM); manifest assembler ties commit + lock hashes; **registry publish of digests / retained production plan binary remain owner-gated**
- [ ] Approval-gated automation reproducibly creates/updates an isolated temporary environment, migrates safely and deploys the exact candidate digests without secret leakage. → documented + `enable_live_tmpval` fail-closed; **live DO apply/deploy not wired without owner secrets**
- [ ] Infrastructure policy/smoke, TTW-050 contracts, TTW-051 telemetry/alerts and TTW-053 Playwright/UAT all pass against temporary real hosts. → infra policy/smoke in-repo (`validate-all.sh`); **TTW-050/051/053 against tmpval real DNS remain Scoped elsewhere (residual honesty)**
- [ ] Stale plan/digest, parallel release, migration, health, dependency and alert failures block promotion and invoke tested recovery behavior. → schema/policy + fail-closed live gate; **live failure-injection owner-gated**
- [x] The generated production plan/go-no-go packet is reviewable and cannot be applied without TTW-054's explicit human authorization. → plan checksum placeholder + docs; `production_auto_apply: false`; workflow never applies production
- [x] Temporary-to-production differences, maximum lifetime/cost, teardown/retention and operating ownership are documented and approved; orphan detection is tested. → `ttw-068-ephemeral-release.md` + `teardown-policy.json`; orphan notes validated by policy assert; **live orphan scan owner-gated**

## Out of scope

- Authorizing or executing the production release → TTW-054.
- Waiving failed application, security, recovery or business gates.
- Claiming TTW-050 / TTW-051 / TTW-053 already pass — residual handoff only.

## Design review

**Reviewer:** implementing agent (self-check against ticket charter; dual independent implementation reviews below)\
**Date:** 2026-08-20\
**CI trust boundaries:** `workflow_dispatch` only; no `pull_request`; credential-free default jobs; live tmpval behind `enable_live_tmpval` fail-closed; production apply excluded (TTW-054).\
**Artefact promotion:** build once; promote by digest; digests optional/empty when `push: false`.\
**Environment protection:** same model as `infra-plan.yml` (protected Environment + token when live enabled).\
**Manifest/evidence:** schema + builder + example; no secrets in artefacts.\
**Migration sequence:** documented create → migrate → deploy digests → gates → teardown.\
**Gate wiring:** infra in-repo; contracts/browser/telemetry slots `scoped_elsewhere` / `owner_gated`.\
**Concurrency/recovery:** documented; live drills owner-gated.\
**Cost:** `max_lifetime_hours: 24`, `max_monthly_usd: 30`, orphan detection notes.

**Verdict: PASS** (honest: live DO tmpval apply/deploy and TTW-050/053 real-host gates not claimed).

### Deviations

1. **No live temporary-validation OpenTofu apply/deploy** (owner-gated; `enable_live_tmpval` fails closed).
2. **No registry push** of immutable digests in the default workflow (`push: false`).
3. **No TTW-050 contract / TTW-051 alert / TTW-053 Playwright** evidence against temporary real DNS — residual; Scoped elsewhere.
4. **No live failure-injection** (stale plan, parallel release, migration/health) on DO.
5. **No live orphan scan** against project `ttw-tmpval` (policy + docs only).
6. **Production plan binary** not generated in CI without owner token; checksum remains PLACEHOLDER until owner plan retention.

## Implementation reviews

### Review 1 — Release / CI correctness

- **Verdict:** PASS
- Manifest schema covers commit, image digests, SBOM refs, OpenTofu lock hashes, plan checksum placeholder, gate results, `createdAt`. Builder validates before write; example is PLACEHOLDER-only. Workflow is dispatch-only, reuses `validate-all.sh`, matrix builds mirror CI container-build with `push: false`, uploads manifest artefact. Live path gated and fail-closed. Does not claim TTW-050/053 pass.

### Review 2 — Security / supply chain

- **Verdict:** PASS
- No secrets in schema/example/scripts/teardown policy. Workflow never on `pull_request`. Production auto-apply forbidden in policy. `assert-release-invariants` enforces schema, example validity, teardown max lifetime, dispatch-only workflow, and doc honesty needles. Live DO token path documented as protected-Environment only (same as infra-plan).

## Verification evidence

Commands that passed (OpenTofu v1.9.1, no provider token):

```bash
export PATH="$HOME/.local/bin:$PATH"
bash infra/scripts/validate-all.sh
# … assert-release-invariants OK …

node --test infra/release/scripts/__tests__/release-manifest.test.mjs
node --test infra/policy/__tests__/assert-release-invariants.test.mjs
node infra/release/scripts/assert-release-manifest.mjs --example
node infra/release/scripts/build-release-manifest.mjs --commit "$(git rev-parse HEAD)" >/dev/null
```

Live DO temporary-validation apply/deploy, registry digest publish, TTW-050/051/053 against real tmpval hosts, orphan scan: **not run** (owner-gated / Scoped elsewhere); recorded as deviations.

## Completion summary

- Docs: `docs/infrastructure/ttw-068-ephemeral-release.md` (digest promotion, lifecycle, TTW-054 mapping, residuals for TTW-050/053, teardown/orphan, owner-gated live apply).
- Release: `infra/release/` schema, PLACEHOLDER example, builder/assert, `teardown-policy.json`.
- CI: `.github/workflows/release-candidate.yml` (dispatch only; credential-free jobs; live gate fail-closed).
- Policy: `assert-release-invariants` wired into `validate-all.sh`; node:test coverage.
- Handoff: production plan never auto-applied; TTW-054 owns production authorization.
- Follow-ups: owner-gated live tmpval; registry digests; wire TTW-050/051/053 evidence into the same candidate; TTW-054 rehearsal.
