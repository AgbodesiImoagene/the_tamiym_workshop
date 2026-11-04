# TTW-007 — Upgrade vulnerable production dependencies

**Epic:** 0 — Trustworthy delivery system\
**Status:** Complete\
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

- [x] `pnpm audit:prod` passes (or each remaining advisory has a recorded exception).
- [x] All quality gates pass after the upgrades, with output recorded below.
- [x] CI on `main` is green, including "Production Audit".

## Out of scope

- Major framework migrations not required to clear the advisories.

## Design review

Approved by the user on 2026-11-03. Principle: stay inside the current major of every framework; change only what an advisory requires; let pnpm write the lockfile (`pnpm install` after editing a spec, or `pnpm update -r --depth Infinity <pkg>` to refresh a transitive package inside its existing range).

| #   | Group         | Change                                                                                                                                                                                            | Advisories cleared                               | Main risk / coverage                                   |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| 1   | Frontend      | `next` 16.3.1 → 16.4.4 (exact) in web/app/admin; `zod` → `^4.6.7`                                                                                                                                 | next (critical/high), sharp via next, zod        | Image optimisation, cache — `pnpm build`, Playwright   |
| 2   | API framework | `@nestjs/{common,core,platform-express,testing}` → `^11.2.8`; `express` → `^5.3.0`; override `multer` → `^2.5.0`; refresh `body-parser` 2.4.0 and `proxy-addr` 2.0.8 under Nest's `express@5.2.1` | proxy-addr (critical), body-parser, multer       | Body parsing, trusted proxy, uploads — API unit + e2e  |
| 3   | Mail, media   | `nodemailer` → `^10.3.1` (ships its own types; `@types/nodemailer` removed); `handlebars` → `^4.7.10`; `sharp` → `^0.35.5`; `undici` → `^7.30.1`                                                  | handlebars (critical), nodemailer, sharp, undici | Mail transport/templates — `src/mail` specs, typecheck |
| 4   | Observability | Override `@grpc/grpc-js` → `^1.14.5` (resolves 1.14.7); refresh `systeminformation` 5.33.19                                                                                                       | grpc-js, systeminformation                       | OTel start-up                                          |
| 5   | Prisma tree   | Override `mysql2` → `^3.22.0` (resolves 3.24.6); Prisma stays on 7.3.0                                                                                                                            | mysql2                                           | Unused driver (Postgres only) — `db:generate`, API e2e |
| 6   | Transitive    | Override `fast-uri` → `^4.1.4` (resolves 4.2.3); refresh `browserslist` 4.29.5, `source-map-js` 1.2.2                                                                                             | fast-uri, browserslist, source-map-js            | Build tooling only                                     |

Dependabot branches were not merged: they are stale (August/September) and target still-vulnerable versions (for example next 16.3.3 < 16.4.1).

### Deviations from the approved plan

- **Prisma not upgraded (group 5).** The user chose Prisma 7.3 → 7.10.1, the only release that ships a patched `mysql2`. Every Prisma ≥ 7.9 depends on `@prisma/studio-core` (0.27–0.34), whose `engines.pnpm` is `"8"`; with `engine-strict=true` and pnpm 9, `pnpm install` fails with `ERR_PNPM_UNSUPPORTED_ENGINE`. The user then approved a targeted `mysql2` override instead, as allowed by `docs/dependency-security-policy.md` (rule 3: no compatible parent bump exists).
- **`eslint-config-next` kept at 16.3.1.** It is a devDependency (not in `audit:prod`). Version 16.4.4, and the `eslint-plugin-react-hooks` 7.1.1 it pulls in, add `set-state-in-effect` errors in 7 existing files across web/app/admin. Fixing them is application-code work outside this ticket; follow-up ticket to be scoped.
- **Nest scope narrowed.** Only the four Nest packages that carry `express`/`multer` were bumped; `@nestjs/swagger` and the others stay put so the generated OpenAPI is not touched. Note: `@nestjs/platform-express@11.2.8` pins `express@5.2.1`, so the running server is still Express 5.2.1; the fix reaches it through `body-parser` 2.4.0 and `proxy-addr` 2.0.8 (the only versions left in the graph). The direct `express ^5.3.0` bump only affects the API's own `express` import.
- **Overrides bounded to their major** (review suggestion): the four overrides touched here use `^` instead of `>=`, so a future major cannot be pulled silently. Resolutions were unchanged (only the override specifiers moved in `pnpm-lock.yaml`); `pnpm install --frozen-lockfile` and `pnpm audit:prod` pass after the change.

### Override register (policy rule 3)

`docs/dependency-security-policy.md` requires every override to map to an advisory. Overrides added or changed by TTW-007 (the TTW-022 table keeps the earlier ones):

| Override                 | Parent that blocks a direct fix                                          | Advisories                                                                                              |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `multer: ^2.5.0`         | `@nestjs/platform-express@11.2.8` pins `multer@2.4.0`                    | GHSA-535w-7cp7-47q4, GHSA-q7qp-rjg7-q26m, GHSA-qfvm-cv95-jqjf, GHSA-wc9g-mqfw-jrwm                      |
| `@grpc/grpc-js: ^1.14.5` | OTel `otlp-grpc-exporter-base@0.221.0` (`^1.14.3`)                       | GHSA-m9gg-hp2v-232j                                                                                     |
| `fast-uri: ^4.1.4`       | `ajv@8.17.1` (`^3.0.1`; already forced to v4 by TTW-022)                 | GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp, GHSA-qw65-cvwx-89v3 |
| `mysql2: ^3.22.0`        | `prisma@7.3.0` pins `mysql2@3.15.3`; Prisma ≥ 7.9 blocked by pnpm engine | GHSA-3f6p-5ww8-9rcr                                                                                     |

Direct upgrades and in-range refreshes cleared: next (GHSA-2464-fhr4-w9xw, GHSA-2xp9-vwfh-vxw4, GHSA-673q-mjm6-r5xr, GHSA-cjq9-62q9-8jv4, GHSA-p293-qw3h-jr36, GHSA-p3m5-59mp-jv5r, GHSA-vcvr-r3jv-pc5j), proxy-addr (GHSA-jqcg-44mw-7w3h), body-parser (GHSA-27r3-jxmh-p828), handlebars (GHSA-8r5x-fm3f-whwj, GHSA-p8wg-vrv2-v86f), nodemailer (GHSA-2x7j-588g-ccc2, GHSA-v53p-9fqp-m79j), sharp (GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w), undici (GHSA-2m5v-pch6-74hx, GHSA-4w7w-5xrc-9h26, GHSA-qrxm-fqhp-jwvm, GHSA-rfgv-xxqx-mfg5, GHSA-w293-vg96-wgc3, GHSA-xjj6-f33q-929c), zod (GHSA-mrhx-c7xc-m3w5), systeminformation (GHSA-3f7j-7jwc-fxfj), browserslist (GHSA-73wf-gq98-2v4g, GHSA-c83g-rgw3-j3cx), source-map-js (GHSA-68fv-2mgg-jv7q).

### Lockfile side effects

Re-resolution also moved a few packages outside the groups above, all inside their declared ranges: production `@smithy/core` 3.38.1 and `@smithy/types` 4.19.0 now sit next to `@smithy/core` 3.33.2 under `@smithy/hash-node`/`util-utf8`/`util-buffer-from` (AWS SDK helpers); dev-only `@types/node` 25.9.9, `@babel/runtime` 7.29.10, `picomatch` 4.0.7, `thread-stream` 4.2.1. Covered by the full unit, e2e and Playwright runs below.

### Security review

- No advisory is ignored and the audit level is unchanged (`--audit-level=high`); no `--force`.
- Upload (`multer`), body parsing (`body-parser`) and trusted-proxy resolution (`proxy-addr`) changes are exercised by the API e2e suite (auth surfaces, CSRF, uploads, Paystack webhooks) — 93/93.
- Next.js image optimisation / `next/og` RCE and SSRF advisories cleared by 16.4.4; Playwright smoke on web/app/admin passes.
- `mysql2` is not reachable at runtime (PostgreSQL adapter only); the override closes the advisory without changing Prisma.
- No secrets, env files or auth configuration touched.

### Rollback

Revert the TTW-007 commit (package.json files + `pnpm-lock.yaml`), run `pnpm install --frozen-lockfile`, and redeploy the previous image digest, as described in `docs/dependency-security-policy.md`. No migration or data change is involved.

## Implementation reviews

1. Independent read-only review (fresh agent, 2026-11-03), charter: package.json vs design table, override justification, lockfile side effects, audit result, nodemailer 10 type compatibility, ticket accuracy. Verdict **FAIL on documentation only** — the dependency change itself was confirmed correct (audit exit 0, `eslint-plugin-react-hooks` 7.0.1 / `eslint-config-next` 16.3.1 unchanged, nodemailer 10 `export default` + `Transporter` type compatible with `NodeNext` + `esModuleInterop`, counts accurate). Required fixes: override ↔ advisory mapping, security review and rollback sections, final gate evidence, lockfile side effects. All addressed above; optional suggestion (bound overrides to major) applied.

## Verification evidence

Environment: macOS, Node v24.22.1, pnpm 9.0.0, native PostgreSQL 17 and Redis (no Docker).

Baseline on `main` (`46de3a9`) before any change: `pnpm typecheck` exit 0, `pnpm lint` exit 0 (api: 14 warnings, 0 errors), `pnpm test` exit 0 (api 1207/1207, app 39/39, web 40/40). Baseline `pnpm --filter api test:e2e` was disturbed by a concurrent `pnpm install` (2 failures in `auth-surface.e2e-spec.ts`); re-running that file alone gave 34/34.

Audit before: `{'low': 13, 'moderate': 58, 'high': 31, 'critical': 8}`.

Per-group gates:

- Group 1: `pnpm turbo run typecheck lint test --filter=web --filter=app --filter=admin --filter=@tamiym/config --filter=@tamiym/ui` → 13/13 tasks successful (web 40/40, app 39/39).
- Groups 2–3: `pnpm turbo run typecheck lint test --filter=api` → 3/3 tasks, 143 suites / 1207 tests passed; api lint unchanged at 14 warnings, 0 errors; `pnpm --filter api test -- src/mail` → 9 suites / 50 tests passed after nodemailer 10 and the removal of `@types/nodemailer`.

Audit after all groups: `pnpm audit:prod` → exit 0, `24 vulnerabilities found — Severity: 3 low | 21 moderate` (0 high, 0 critical).

Final gates (after all groups):

- `pnpm verify`: `pnpm lint` → 6/6 tasks successful. `pnpm format:check` fails locally only on git-ignored files (Prisma client in `apps/api/src/generated/`, `apps/*/next-env.d.ts`, local `.claude/*.md`), which a clean CI checkout does not have; Prettier on every tracked file (`git ls-files … | xargs prettier --check`) → "All matched files use Prettier code style!". Remaining chain `pnpm typecheck && pnpm test && pnpm --filter api test:coverage && pnpm coverage:ratchet && pnpm coverage:diff && pnpm audit:prod && pnpm build` → exit 0: typecheck 6/6, unit tests api 1207/1207, app 39/39, web 40/40, "Coverage ratchet passed.", diff coverage skipped (no changed executable file under `apps/api/src`), audit 0 high/critical, build 5/5 tasks.
- `pnpm openapi:check` → "OpenAPI contract drift check passed."
- `pnpm --filter api test:e2e` (PostgreSQL `tamiym_workshop_test`, Redis) → 17 suites / 93 tests passed.
- Playwright, after `prisma migrate deploy` (no pending migrations) and `seed:e2e` on the test DB: `pnpm test:e2e:smoke` → 39 passed; `playwright test tests/e2e/app/checkout-idempotency.spec.ts --project=setup --project=chromium-app` → 4 passed ("re-clicking after a payment initiation failure creates one order").
- OpenTelemetry: `startOpenTelemetry()` / `shutdownOpenTelemetry()` from the built `apps/api/dist/observability/otel.js` with `OTEL_SDK_DISABLED=false` → SDK started with auto-instrumentations and shut down, exit 0 (only export errors: no collector on `localhost:4318`, expected).

Noticed, out of scope: `pnpm build` regenerates `packages/types/src/enums.generated.ts` with 52 new lines (TTW-043 notification enums) that are not committed on `main`, so the committed file has drifted from `schema.prisma`. Left untouched here (file restored); to be fixed in its own change.

## Completion summary

GitHub: merged to `main` (`335e4ee`, with TTW-009). CI run [41931373328](https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/41931373328) on `main` `541bad4` is green on all 18 jobs, including "Production Audit". The previous `main` runs failed only on that job. The scheduled "Dependency Audit" (Mondays 09:00 UTC) has not run since the merge; it runs the same audit.

Local work complete: `pnpm audit:prod` passes with 0 high/critical (from 8 critical, 31 high), every local gate is green, and the independent review findings are addressed. Not verified here: CI on GitHub ("Production Audit" and the scheduled "Dependency Audit"), which needs the user to push the branch. Follow-ups shipped: TTW-009 (the `eslint-config-next` 16.4 / `react-hooks` 7.1 lint errors) and TTW-008 (the `enums.generated.ts` drift noted above). Residual moderate/low advisories (21 moderate, 3 low) stay with the follow-up owned by `docs/dependency-security-policy.md`. Dev-only: one `ts-jest` instance still resolves `handlebars@4.7.9` (not in the production graph).
