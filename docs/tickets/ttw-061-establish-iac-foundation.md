# TTW-061 — Establish the DigitalOcean OpenTofu foundation

**Epic:** 6 — Production infrastructure as code\
**Status:** Complete (implementation reviews pending)\
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

- `.github/workflows/ci.yml` — `infra` job (credential-free validate).
- `.github/workflows/infra-plan.yml` — speculative plan when `DIGITALOCEAN_TOKEN` present.
- `docs/infrastructure/ttw-060-opentofu-state-backend.md` — Spaces + `use_lockfile` decision.
- `docs/infrastructure/ttw-061-iac-foundation.md` — naming, state keys, CI trust, apply/drift.
- `docs/19-digitalocean-production-architecture-decision.md` — London (`lon1`) primary.

## Acceptance criteria

- [x] The documented layout cleanly separates reusable modules, bootstrap code and production/temporary-validation compositions (`infra/README.md`, `infra/modules/*`, `infra/envs/*`, `infra/bootstrap/*`).
- [x] Remote state contract is encrypted/versioned/locked via Spaces + `use_lockfile`; bootstrap runbook and TTW-060 proof contain no secrets (`infra/bootstrap/README.md`, `state-backend-proof/`).
- [x] Production and temporary validation have independent state keys (`prod/opentofu/…` vs `tmpval/opentofu/…`), DO projects (`ttw-prod` / `ttw-tmpval`) and separate env roots.
- [x] CI uses pinned OpenTofu 1.9.1 and passes format, `init -backend=false`, validate and deny-secrets **without credentials** (`infra` job + `pnpm infra:validate`).
- [x] Speculative plans: `infra-plan.yml` is **workflow_dispatch only**, uses a protected GitHub Environment for `DIGITALOCEAN_TOKEN`, and never applies. Pull-request heads never receive credentials.
- [x] Persistent apply and scheduled drift detection are documented; production apply remains human-gated.
- [x] **Deviation (owner-gated):** live DigitalOcean fixture apply/destroy is deferred until `DIGITALOCEAN_TOKEN` exists in a protected environment. Credential-free validation satisfies CI; live proof is an explicit follow-up for the owner.

## Out of scope

- Application network, runtime or data resources → TTW-062–TTW-067.
- Release-candidate deployment → TTW-068.

## Design review

**Reviewer:** implementing agent (self-check against ticket charter; parent will run independent implementation/security reviews)\
**Date:** 2026-08-20\
**Evidence cited:** ADR London primary; TTW-060 Spaces + native lockfile proof (MinIO); separate env roots and state keys; no secrets in repo; CI validate without token.

| Check                 | Result                                                                               |
| --------------------- | ------------------------------------------------------------------------------------ |
| Blast radius          | Foundation only — creates DO _project_ resources when applied; no VPC/Droplet/DB yet |
| Duplication           | Extends TTW-060 proof; does not replace it                                           |
| Module interfaces     | `labeling` (tags), `digitalocean_project` (project + optional URN membership)        |
| Invariants            | Isolated state keys; backend creds via `-backend-config`; no apply in PR CI          |
| Failure / concurrency | Lockfile documented; live concurrent-apply proof owner-gated until token exists      |
| Migration / rollback  | Destroy project in tmpval; restore state object version for recovery                 |
| Observability         | Apply/drift runbooks documented; alerts deferred to TTW-065/066                      |
| Test plan             | `validate-all.sh` + deny-secrets; optional plan workflow                             |

**Verdict: PASS** (honest: live DO fixture apply/destroy and Spaces concurrent-lock proof remain owner-gated deviations until credentials exist; design otherwise meets the foundation charter).

## Implementation reviews

### Review 1 — Infrastructure (iteration 1)

- **Verdict:** CHANGES_REQUIRED
- **Findings:** lockfiles gitignored; PR plan workflow trusts same-repo PR with token; tfplan ignore; dead tags input; unused tflint
- **Fixes:** commit lockfiles; workflow_dispatch + protected environment only; remove tags input; drop unused tflint; lockfile=readonly

### Review 2 — Security (iteration 1)

- **Verdict:** CHANGES_REQUIRED
- **Findings:** DIGITALOCEAN_TOKEN on pull_request heads; overstated fork isolation docs; missing lockfile readonly
- **Fixes:** remove PR credentialed plan; dispatch+environment; docs trust table; -lockfile=readonly

### Review 1 — Infrastructure (iteration 2)

- **Verdict:** **PASS**

### Review 2 — Security (iteration 2)

- **Verdict:** CHANGES_REQUIRED — `infra/README.md` trust text stale
- **Fix:** align README with dispatch-only + protected environment model

### Review 2 — Security (iteration 3)

- **Verdict:** **PASS** (README trust boundaries aligned)

## Verification evidence

Commands that passed (OpenTofu v1.9.1, no `DIGITALOCEAN_TOKEN`):

```bash
export PATH="$HOME/.local/bin:$PATH"
bash infra/scripts/validate-all.sh
# deny-secrets OK; tofu fmt -check -recursive OK;
# init -backend=false + validate OK for:
#   infra/modules/digitalocean_project
#   infra/envs/production
#   infra/envs/temporary-validation

pnpm infra:validate   # same script via package.json (Node 24)

# Per-root equivalents:
(cd infra/modules/digitalocean_project && tofu init -backend=false && tofu validate)
(cd infra/envs/production && tofu init -backend=false && tofu validate)
(cd infra/envs/temporary-validation && tofu init -backend=false && tofu validate)
```

Live DO plan/apply/destroy: **not run** (no `DIGITALOCEAN_TOKEN`); recorded as owner-gated deviation.

## Completion summary

- Layout under `infra/` with modules, dual env roots, bootstrap runbook, policy and validate script.
- State keys `prod/opentofu/infrastructure.tfstate` and `tmpval/opentofu/infrastructure.tfstate`.
- CI `infra` job (no credentials); `infra-plan.yml` gated on secret presence; never applies from PRs.
- `pnpm infra:fmt` / `pnpm infra:validate` wrappers added.
- Follow-ups: owner Spaces bootstrap, live tmpval fixture apply/destroy, concurrent lock proof, TTW-065 identity hardening.
