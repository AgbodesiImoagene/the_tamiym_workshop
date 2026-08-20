# TTW-061 — Establish the DigitalOcean OpenTofu foundation

**Epic:** 6 — Production infrastructure as code\
**Status:** Not started\
**Risk:** High\
**Blocked by:** TTW-060\
**Blocks:** TTW-062–TTW-068

## Background

The repository has no IaC directory, state backend, environment isolation, infrastructure CI or change-control convention. Adding provider resources without those foundations risks state loss, secret leakage, configuration drift and accidental production mutation.

## Proposal

Create an OpenTofu/HCL DigitalOcean layout with reusable modules, thin production/temporary-validation compositions and typed, documented inputs/outputs. Select a remote backend only after proving encryption, version recovery and reliable locking with OpenTofu; do not assume Spaces provides every S3 backend semantic. Use separate state, provider contexts and resource naming for production and temporary validation. Add pinned tooling, formatting, validation, lint, security/policy checks, documentation generation and speculative plans in CI. Until DigitalOcean supports an approved short-lived federation path, use a narrowly scoped API token stored only in the owner-protected GitHub environment and rotated through TTW-065.

## Invariants

- State, plans, credentials and secret values never enter git or normal CI artefacts.
- Production and temporary validation use isolated state and provider configurations; a command cannot target both implicitly.
- Every persistent change has a reviewed plan tied to the exact commit and environment.
- Module interfaces express capabilities and contracts; environment-specific values do not leak into reusable modules.

## Implementation plan

1. Add pinned IaC tooling, repository layout, naming/tagging/labeling standard and environment input schema.
2. Implement a minimal bootstrap/runbook for the TTW-060-approved remote backend, including encryption, versioning, locking, access evidence and recovery.
3. Establish separate production and temporary-validation state paths, provider aliases, DigitalOcean projects/tags and least-privilege provider tokens.
4. Add CI formatting, init-without-backend, validation, lint, security/policy and documentation checks plus credentialed speculative plans only for trusted changes.
5. Add controlled apply, drift detection and emergency/manual recovery runbooks with concurrency protection and immutable audit evidence.

## Test and observability plan

- Unit/component: Module validation, lint/policy fixtures and input/output contract tests.
- Integration/e2e: Provision and destroy a harmless DigitalOcean fixture; prove state locking, isolation, plan/apply identity and drift detection.
- Failure, retry, and concurrency: Concurrent applies, interrupted apply, stale lock, lost local checkout, denied permission and state-version recovery.
- Logs, metrics, traces, and alerts: Audit state access, applies, drift runs and failed policy checks; alert on production drift or unauthorized mutation.

## References

- `.github/workflows/ci.yml:1-57` — no IaC or deployment checks exist.
- `docs/10-deployment-and-environments.md:81-99` — production infrastructure and staging are not formalized.
- `docs/tickets/ttw-054-rehearse-controlled-release.md` — immutable evidence and human-authorized production changes are required.

## Acceptance criteria

- [ ] The documented layout cleanly separates reusable modules, bootstrap code and production/temporary-validation compositions.
- [ ] Remote state is encrypted, versioned, locked, access-controlled and recoverable; bootstrap evidence contains no secrets.
- [ ] Production and temporary validation have independent state, projects/tags and provider contexts; neither can target the other implicitly.
- [ ] CI uses pinned tools and passes format, validation, lint, security/policy and documentation checks.
- [ ] Trusted PRs produce reviewable plans; untrusted code cannot access provider credentials or execute applies.
- [ ] Persistent applies require environment approval, exact-plan verification and concurrency control; drift detection is scheduled and actionable.

## Out of scope

- Application network, runtime or data resources → TTW-062–TTW-067.
- Release-candidate deployment → TTW-068.

## Design review

Record reviewer, date, ADR-001/TTW-060 evidence, remote-state/backend proof, project boundaries, module/version policy, CI trust boundaries, access paths, recovery and verdict.

## Implementation reviews

Require independent infrastructure and security review; remediate state, permission, CI or secret findings and repeat until PASS.

## Verification evidence

Record pinned versions, validation/policy commands, sandbox plan/apply/destroy output, state-lock/recovery exercise, role-policy simulation and drift alert result.

## Completion summary

Summarize layout, state locations, isolation, CI identities/gates, apply controls, recovery procedure and follow-ups.
