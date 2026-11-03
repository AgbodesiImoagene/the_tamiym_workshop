# TTW-007 — Upgrade vulnerable production dependencies

**Epic:** 0 — Trustworthy delivery system\
**Status:** Not started (to be scheduled later, user decision 2026-11-03)\
**Risk:** High\
**Blocked by:** None\
**Blocks:** A green `main` CI (job "Production Audit") and the scheduled "Dependency Audit"

## Background

The CI job "Production Audit" runs `pnpm audit:prod` (`pnpm audit --prod --audit-level=high`) and requires zero high or critical advisories. On 2026-11-03 it failed on `main` (CI run #261, commit `c9f4bb6`), and the scheduled workflow `.github/workflows/dependency-audit.yml` had already failed on its previous runs (#10, #11). No dependency was changed by TTW-037/TTW-038: the advisories were published after the last dependency update.

Local run (Node 24, 2026-11-03): **110 advisories — 8 critical, 31 high, 58 moderate, 13 low.**

- Critical: `next` (patched in `>=16.3.3`, `>=16.3.6`, `>=16.4.1`), `handlebars` (`>=4.7.10`), `proxy-addr` (`>=2.0.8`).
- High: `next` (`>=16.4.1`), `undici` (`>=7.30.1`), `multer` (`>=2.5.0`), `nodemailer` (`>=10.0.6`), `sharp` (`>=0.35.5`), `zod` (`>=4.6.6`), `body-parser` (`>=2.4.0`), `@grpc/grpc-js` (`>=1.14.5`), `fast-uri` (`>=4.1.4`), `systeminformation` (`>=5.33.16`, via `@opentelemetry/auto-instrumentations-node`), `browserslist`, `source-map-js`, `mysql2`.

Dependabot already has open pull requests for part of this (for example `next, react, react-dom, eslint-config-next`, `@nestjs/*`, `@aws-sdk/client-s3`).

The project is not in production, so there is no live exposure, but CI stays red until this is done, which hides real regressions.

## Proposal

Upgrade in small, separately verified groups rather than one big bump: frontend (`next`, `react`, `eslint-config-next`), API framework (`@nestjs/*`, `body-parser`, `proxy-addr`, `multer`), mail and media (`nodemailer`, `sharp`), observability (`@opentelemetry/*` → `systeminformation`, `@grpc/grpc-js`), then the remaining transitive packages (pnpm `overrides` only where no direct upgrade exists). Reuse the Dependabot pull requests where they fit; the user pushes to GitHub, so their branches can be merged locally and verified.

Rejected: lowering the audit level or adding blanket ignores (hides real issues).

## Invariants

- `pnpm audit:prod` passes with zero high/critical advisories, or every remaining one has a recorded, time-bound exception.
- No behaviour change: all existing gates pass after each group.
- Lockfile changes come from pnpm, never edited by hand.

## Implementation plan

1. Baseline: save the full audit report and the list of open Dependabot updates.
2. Upgrade group by group; after each, run lint, typecheck, unit tests, API e2e, `pnpm build`, Playwright smoke.
3. Record remaining advisories (if any) with owner and deadline.
4. Confirm CI "Production Audit" and the scheduled "Dependency Audit" are green.

## Test and observability plan

- Unit/component: full `pnpm test`.
- Integration/e2e: `pnpm --filter api test:e2e`, `pnpm build`, Playwright smoke and the app checkout journey.
- Failure, retry, and concurrency: covered by the existing suites.
- Logs, metrics, traces, and alerts: check that OpenTelemetry instrumentation still starts after its upgrade.

## References

- `package.json` `audit:prod` script; `.github/workflows/ci.yml` (Production Audit); `.github/workflows/dependency-audit.yml`.
- GitHub Actions CI run #261 (commit `c9f4bb6`); Dependency Audit runs #10 and #11.
- Open Dependabot pull requests on the repository.

## Acceptance criteria

- [ ] `pnpm audit:prod` passes (or each remaining advisory has a recorded exception).
- [ ] All quality gates pass after the upgrades, with output recorded below.
- [ ] CI on `main` is green, including "Production Audit".

## Out of scope

- Major framework migrations not required to clear the advisories.

## Design review

Pending (list of groups and versions, risk per group).

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
