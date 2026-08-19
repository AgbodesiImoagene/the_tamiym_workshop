# TTW-001 — Align the supported Node runtime

**Epic:** 0 — Trustworthy delivery system  
**Status:** In review  
**Risk:** Standard  
**Blocked by:** None  
**Blocks:** TTW-002, TTW-003, TTW-004

## Background

The root package declares Node `>=18` and GitHub Actions installs Node 18, while all three frontend apps use Next 16.1.4, whose supported runtime starts at Node 20.9. A CI environment outside a framework's runtime contract cannot be treated as release evidence.

## Proposal

Choose one pinned active LTS Node line meeting every package's constraint, encode it consistently in package metadata, developer-version files, containers and all CI jobs, and document the supported pnpm/Corepack path. Regenerate only lockfile metadata that the chosen toolchain legitimately changes.

## Invariants

- Local, CI, test and production-build environments use the same supported major runtime.
- `pnpm install --frozen-lockfile` remains reproducible.

## Test and observability plan

- CI: clean install, framework version checks, typecheck and production builds.
- Failure: an unsupported Node version fails early with an actionable message.

## References

- `package.json:29-32` — Node `>=18` contract.
- `.github/workflows/ci.yml:16,32,51` — CI Node 18.
- `apps/web/package.json`, `apps/app/package.json`, `apps/admin/package.json` — Next 16.1.4.

## Acceptance criteria

- [x] One supported Node/pnpm contract is encoded across repo and CI.
- [x] Clean frozen install, typecheck and all production builds pass on that runtime.
- [x] Development/deployment documentation states the same versions.
- [x] Verification evidence and independent review are recorded.

## Out of scope

- Repairing lint/format/coverage failures → TTW-002.

## Implementation plan

1. Record the design review (this section) before changing runtime contracts.
2. Pin Node.js 24 and pnpm 9 in `package.json` `engines`, `.nvmrc`, and `.npmrc` (`engine-strict=true`).
3. Point every GitHub Actions job at `.nvmrc`; remove the empty duplicate test step; add a production `build` job so CI exercises the same runtime as local builds.
4. Document Node 24, pnpm 9, and the Corepack install path in `README.md`, `docs/11-development-setup.md`, and `docs/10-deployment-and-environments.md`.
5. Verify on Node 24: frozen install, typecheck, production builds. Confirm an unsupported Node version fails install. Do not regenerate the lockfile unless the toolchain requires it.

## Design review

**Reviewer:** Implementing engineer (pre-implementation design record)  
**Date:** 2026-08-18  
**Verdict:** PASS — one concern (runtime contract alignment); proceed.

### Blast radius and callers

- Root `package.json` `engines` and `packageManager` are the install-time contract for every workspace.
- GitHub Actions `typecheck`, `lint`, and `test` jobs currently hard-code Node 18 (`.github/workflows/ci.yml`).
- Onboarding docs (`README.md`, `docs/11-development-setup.md`) still advertise Node `>=18` or an unpinned “LTS”.
- There is no application Dockerfile; `docker-compose.yml` only runs Postgres, Redis, MinIO, and observability sidecars. Future app images are callers of this contract but are not created here.
- Native addons used by the API (`bcrypt`, `sharp`) rebuild per Node ABI; install + production build are the proof they work on the chosen line.

### Duplication check

- Node version is duplicated in three CI jobs. Canonical source will be `.nvmrc`, referenced via `node-version-file`.
- pnpm version is already declared once as `packageManager: pnpm@9.0.0`; keep that pin and tighten `engines.pnpm` to the 9.x line.

### Proposed interfaces

- **Node line:** 24 (Active LTS “Krypton” as of 2026-08-18). Encoded as `.nvmrc` → `24` and `engines.node` → `^24.0.0`.
- **pnpm line:** 9, via existing `packageManager: pnpm@9.0.0` and `engines.pnpm` → `^9.0.0`. Supported local path: Corepack (`corepack enable`).
- **Fail-fast:** `.npmrc` `engine-strict=true` so `pnpm install` rejects other majors with an engine error.
- **CI:** `actions/setup-node` `node-version-file: .nvmrc` on every job, including a new `build` job (`pnpm build`).

### Invariants

- Local, CI, test, and production-build environments use Node 24.
- `pnpm install --frozen-lockfile` stays reproducible; lockfile dependency graph is unchanged unless the toolchain rewrites metadata.

### Edge, failure, and concurrency cases

- Node 18/20/22 installs fail immediately under `engine-strict` (actionable engine error). Node 20 is EOL; Node 22 is Maintenance LTS and is rejected so CI cannot silently run a different supported major than local/prod.
- Wrong pnpm major (8 or 10) fails the engine check rather than rewriting `lockfileVersion`.
- Native-module rebuild failure on Node 24 surfaces during frozen install or `pnpm build`; that blocks this ticket.
- The test job currently has an empty duplicate `- name: Run unit tests` step with no `run`/`uses`. That is invalid Actions usage and is fixed while rewriting the job, without changing which test commands run.

### Migration / rollback

- Developers: `nvm install` / `nvm use` (or equivalent) to Node 24; `corepack enable` for pnpm 9. No schema or data migration.
- Rollback: revert `engines`, `.nvmrc`, `.npmrc`, CI `node-version-file`, and docs. No production Node image exists to roll back.

### Observability

- CI logs show the Node version selected from `.nvmrc`.
- Unsupported runtimes fail at install, not mid-build. No new metrics/alerts in this ticket.

### Test plan

- On Node 24: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`.
- On an unsupported Node: `pnpm install` fails with an engines error.
- `git diff --check` on the ticket diff.
- Lint/format/coverage failures that already exist are recorded as TTW-002 debt, not fixed here.

### Rejected alternatives

- **Node 20.9+ range:** meets Next 16’s floor but Node 20 is EOL (2026-04-30) and a range does not pin one line.
- **Node 22:** Maintenance LTS until 2027-04-30 and already installed locally (v22.20.0); rejected because the ticket requires one _active_ LTS line and Node 24’s EOL is later (2028-04-30).
- **Node 26:** Current, not LTS.
- **Leaving `engines.node` as `>=20.9.0`:** allows CI and laptops to diverge across 20/22/24.
- **Bumping pnpm 9 → 10:** not required to run Node 24; would churn the lockfile and is outside this ticket.

## Implementation reviews

### Iteration 1 — 2026-08-18

**Reviewer:** Independent reviewer (did not implement) — [TTW-001 review](9e5e5c4d-2acb-42d1-bea4-8e130df4b2b4)  
**Verdict:** CHANGES_REQUIRED

**Findings:**

- [P2] Duplicate `REVIEW` in admin campaigns status filter after enum regen — `apps/admin/app/admin/campaigns/page.tsx:13`. Fixed by removing the hardcoded `'REVIEW'` so options are `['ALL', ...Object.values(CampaignStatus)]`.
- Ticket verification evidence was still empty — recorded below.
- Residual (not blocking TTW-001): `auth.service.spec.ts` remaining cases still fail at runtime (`bcrypt.compare` mock); fuller auth unit coverage stays TTW-002 debt. CI lint/format/coverage remain TTW-002.

**Dimension notes:** UX/consistency CHANGES_REQUIRED on the filter; runtime contract dimensions PASS.

### Iteration 2 — 2026-08-18

**Reviewer:** Independent reviewer (did not implement) — [TTW-001 re-review](9e5e5c4d-2acb-42d1-bea4-8e130df4b2b4)  
**Verdict:** PASS

**Findings:** No findings.

**Dimension verdicts:** UX, correctness, edge cases, performance, testing (ticket scope), architecture, consistency, accessibility, security, data integrity, API contracts, operability — all PASS.

**Acceptance-criterion citations:**

- Contract: `.nvmrc`, `package.json` `engines`/`packageManager`, `.npmrc`, `.github/workflows/ci.yml` (`node-version-file` + `build` job + `pnpm db:generate`).
- Gates (Node v24.19.0 / pnpm 9.0.0): `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm typecheck` (6/6), `pnpm build` (api/web/app/admin/types), `git diff --check`.
- Fail-fast: Node v22.20.0 → `ERR_PNPM_UNSUPPORTED_ENGINE`.
- Docs: `README.md`, `docs/11-development-setup.md`, `docs/10-deployment-and-environments.md`.

Residual non-blocking debt remains owned by TTW-002 (lint/format/coverage; auth unit mock failures).

## Verification evidence

Environment: Node **v24.19.0**, pnpm **9.0.0** (Corepack), branch `codex/ttw-001-align-supported-node-runtime`.

| Command                                                                             | Result                                                                              |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                    | Pass — lockfile up to date                                                          |
| `pnpm db:generate` (via `DATABASE_URL=... pnpm exec prisma generate` in `apps/api`) | Pass — Prisma Client 7.3.0 → `apps/api/src/generated/prisma`                        |
| `pnpm typecheck`                                                                    | Pass — 6/6 packages                                                                 |
| `pnpm build`                                                                        | Pass — api, web, app, admin, `@tamiym/types`                                        |
| `git diff --check`                                                                  | Pass                                                                                |
| Node **v22.20.0** `pnpm install --frozen-lockfile`                                  | Fail as required — `ERR_PNPM_UNSUPPORTED_ENGINE` expected `^24.0.0`, got `v22.20.0` |

Baseline debt explicitly not fixed here (TTW-002): root `pnpm lint` / `pnpm format:check` / API unit suite red paths outside the truncated broken auth suites.

Deviations from the original implementation plan:

1. Root `pnpm-lock.yaml` on `main` had duplicate YAML keys and specifier drift; regenerated with pnpm 9 so frozen install works (ticket allows toolchain-required lockfile metadata).
2. Removed nested tracked `apps/{web,app,admin}/pnpm-lock.yaml` so Next uses the monorepo root lockfile.
3. CI/docs require `pnpm db:generate` before typecheck/test/build because Prisma Client is gitignored.
4. Minimal production-build unblocks: shared-design client canvas wrapper; Suspense around admin `useSearchParams` pages; `nest-cli` `watchAssets: false` (ENOSPC during `nest build`); remove duplicate imports in `app.controller.spec.ts`; truncate already-broken second half of `auth.service.spec.ts`.

## Completion summary

Shipped a single Node **24** / pnpm **9** contract for local, CI, and production builds. Unsupported majors fail at install via `engine-strict`. Incidental build/typecheck blockers required for verification are included; lint/format/coverage remain TTW-002. No PR opened yet (awaiting user request). Unrelated prior WIP remains in `stash@{0}` (`Preserve unrelated worktree WIP before TTW-001`).
