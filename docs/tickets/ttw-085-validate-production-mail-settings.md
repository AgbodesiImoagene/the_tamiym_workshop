# TTW-085 — Validate production mail settings at startup

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** TTW-147

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 10.5, Production email settings not validated at startup** (Critical, P0, 1–2 h, status "To do"): The mail host defaults to localhost and is not a required setting: emails could fail silently.

Client answers:

- **Q42, Production email provider (Mailgun, SendGrid, Amazon SES, Resend…) and sending domain? Termii SMS account opened?** Answer: "Up to you. Do a price and suitability comparison and make an informed recommendation. No official 3p accounts ready for integration yet."

## Proposal

- Make the mail host and credentials required in production in `env-validation.ts`, and reject `localhost` or placeholder values there.
- Keep development and test behaviour unchanged.
- Update the env examples and `docs/11-development-setup.md` if they list these settings.

## Invariants

- The API refuses to boot in production with unusable mail settings.
- Development and test boot exactly as before.

## Implementation plan

1. Start `codex/ttw-085-validate-production-mail-settings` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: `env-validation` in production with missing, localhost and valid values, and in test mode.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/config/env-validation.ts:17` — row 10.5
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] Booting with `NODE_ENV=production` and a localhost mail host fails with a clear message. → real boot of `dist/main`, see Verification evidence.
- [x] Swagger, shared contracts, migrations and docs are updated where applicable. → no endpoint, DTO or schema change; `apps/api/.env.example` and `infra/runtime/secrets/.env.example` updated; `docs/11-development-setup.md` does not list mail settings.
- [x] Required quality gates pass, with evidence recorded below. CI green on `main` at `d4ba5f2` (runs 42429444049 and 42429444034).

## Out of scope

- Choosing the provider → TTW-147.

## Design review

Recorded 2026-11-07, before implementation, on branch `codex/ttw-085-validate-production-mail-settings` (from `main` at `32f1ecb`). Plan approved by the project owner.

**Finding confirmed on current `main`.** `apps/api/src/config/env-validation.ts` checks no `MAIL_*` variable. `buildMailTransportConfig` (`apps/api/src/mail/mail-template.factory.ts:95`) falls back to `localhost:1025` when `MAIL_HOST` is unset and to `"Tamiym" <noreply@tamiym.com>` when `MAIL_FROM` is unset. The production secrets template (`infra/runtime/secrets/.env.example:34-40`) ships `PLACEHOLDER_MAIL_*` values marked "optional until delivery is required", so a forgotten replacement boots today. The same image and secrets file serve the `api`, `worker` and `scheduler` roles (`infra/runtime/compose/docker-compose.prod.yml`), and `validateEnv` runs for all of them, so the mail worker is covered too.

**Design.** Production only (`NODE_ENV=production`), in `env-validation.ts`, following the existing pattern (`requiredProductionEnvVars` plus a dedicated check):

- `MAIL_HOST`, `MAIL_USER`, `MAIL_PASSWORD` and `MAIL_FROM` are required and non-blank. `MAIL_FROM` goes slightly beyond "host and credentials": without it the sender silently falls back to a hard-coded address on a domain not yet chosen (TTW-147). Owner approved including it.
- `MAIL_HOST` is rejected when it names the local machine: `localhost`, `*.localhost`, `127.0.0.0/8`, `::1` (with or without brackets), `0.0.0.0`; trimmed and case-insensitive.
- Any of the four is rejected when its value starts with `PLACEHOLDER` (case-insensitive), the prefix of the secrets template.
- Error messages name the variable and never echo its value, so `MAIL_PASSWORD` cannot reach a log.
- Development is unchanged (no new requirement). `NODE_ENV=test` still skips validation entirely.

**Not changed.** `MAIL_PORT` and `MAIL_SECURE` (they have working defaults for real providers on 587); `buildMailTransportConfig` keeps its development defaults. No endpoint, DTO, schema or migration change, so no OpenAPI regeneration.

**Risks.**

- Any environment run with `NODE_ENV=production`, including a future staging or the TTW-068 temporary validation environment, will refuse to start until a real mail provider is configured. That is the intended fail-closed behaviour; it makes TTW-147 a prerequisite of any production-mode deployment.
- CI is unaffected: every CI and Playwright API boot uses `NODE_ENV=test` (`.github/workflows/ci.yml`, `playwright-comprehensive.yml`, `playwright.config.ts:51`).
- Logging: the validation error is thrown before the logger exists and contains variable names only.

**Tests (written first).** `apps/api/src/config/env-validation.spec.ts`: each of the four missing or blank in production; each local-host form; a `PLACEHOLDER_` value; the password is absent from the error message; a real host passes; development still passes with no mail settings and with `MAIL_HOST=localhost`.

**Parallel work.** TTW-176 runs at the same time in its own worktree. No shared files; `docs/tickets/ROADMAP.md` is left untouched here to avoid a conflict.

## Implementation reviews

**Review 1 — independent reviewer (fresh agent, read-only), 2026-11-07. Verdict: PASS, no blocking finding.** It re-ran the targeted spec (57/57) and the API typecheck, and confirmed: the four invariants hold; presence is checked by the generic production loop before the mail checks, so non-string and blank values are rejected as missing; development and test are unchanged; no error message echoes a value; the only edit to an existing test is the four mail values added to `validProductionConfig`; no CI or Playwright boot uses `NODE_ENV=production`.

Non-blocking findings and what was done:

1. Some local-machine spellings were not caught (`localhost.`, `127.1`, `0`, `::`, `0:0:0:0:0:0:0:1`, `::ffff:127.0.0.1`). **Fixed**: seven cases added to the spec first (7 failed, 57 passed), then `isLocalMailHost` rewritten to canonicalise the host with the WHATWG URL parser before comparing (`apps/api/src/config/env-validation.ts`). Now 64/64.
2. A real `MAIL_USER`, `MAIL_PASSWORD` or `MAIL_FROM` starting with "placeholder" would be refused. **Accepted**: provider-generated credentials do not start that way, the refusal is fail-closed and names the variable.
3. `docs/infrastructure/ttw-065-identity-secrets.md` listed `MAIL_*` without saying they are now required. **Fixed**: a paragraph under the secrets table.
4. `infra/runtime/secrets/.env.example` ships `MAIL_PORT=587` with `MAIL_SECURE=true`; port 587 uses STARTTLS, which needs `secure=false`. **Out of scope, pre-existing**: to settle in TTW-147 when the provider is configured.

The fixes are small and covered by the spec and gates above; no second review was run.

## Verification evidence

All commands run in the ticket worktree on 2026-11-07, Node 24.22.1.

**Tests first.** The new cases were added to `apps/api/src/config/env-validation.spec.ts` before any code change. `pnpm --filter api test -- src/config/env-validation.spec.ts` → `Tests: 22 failed, 35 passed, 57 total`; 21 failures were "Received function did not throw", and the password test failed on its `toContain('MAIL_PASSWORD')` check because nothing threw. The two development cases and the "host merely contains localhost" case passed, as expected, since they assert behaviour that must not change.

**After implementation.**

| Gate                      | Command                                                       | Result                                                                      |
| ------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Targeted unit             | `pnpm --filter api test -- src/config/env-validation.spec.ts` | `Tests: 64 passed, 64 total`                                                |
| API unit suite + coverage | `pnpm --filter api test -- --coverage`                        | `Test Suites: 145 passed`, `Tests: 1260 passed`                             |
| Typecheck                 | `pnpm --filter api typecheck`                                 | exit 0                                                                      |
| Lint                      | `pnpm --filter api lint`                                      | 0 errors, 14 pre-existing warnings, none in touched files                   |
| Format                    | `pnpm format:check`                                           | exit 0                                                                      |
| Coverage ratchet          | `pnpm coverage:ratchet`                                       | passed (statements 82.13%, branches 65.65%, functions 71.80%, lines 82.35%) |
| Diff coverage             | `git fetch origin main && pnpm coverage:diff`                 | `lines: 16/17 covered (94.12%)`, passed                                     |
| Build                     | `pnpm --filter api build`                                     | exit 0                                                                      |

**Real boot of the built API** (`node dist/main`, `NODE_ENV=production`, empty environment except dummy non-secret values for the other required variables):

Re-run on the final code (after review fix 1):

- `MAIL_HOST=127.1` → exit 1, same local-machine message.
- `MAIL_HOST=localhost` → exit 1, `Error: Environment variable MAIL_HOST must name a real mail server in production, not the local machine`.
- `MAIL_HOST=PLACEHOLDER_MAIL_HOST` → exit 1, `Error: Environment variable MAIL_HOST must be set to a real value, not a placeholder`.
- `MAIL_HOST=smtp.example.com` (`PORT=3985`, `API_ROLE=api`) → `Nest application successfully started`, then stopped by the 25 s test alarm.

No endpoint or DTO changed, so `pnpm openapi:generate` was not needed. No schema change, no migration.

## Completion summary

**Done.** In production, `validateEnv` now requires `MAIL_HOST`, `MAIL_USER`, `MAIL_PASSWORD` and `MAIL_FROM`, rejects `PLACEHOLDER_*` values and a `MAIL_HOST` that names the local machine, and never echoes a value in its errors. Development and test behave as before. The two env examples and the TTW-065 secrets doc say so.

**Deviations from the plan.** `MAIL_FROM` added to the required set (owner approved at design review). Local-host detection extended after review finding 1. `docs/infrastructure/ttw-065-identity-secrets.md` also updated (finding 3).

**State: Verified.** Merged into `main` at the owner's request (`d4ba5f2`, merge of `c82baab`, on top of the TTW-176 merge `c135789`) and pushed. CI is green on `d4ba5f2`: run 42429444049 (CI) and run 42429444034 (Playwright Comprehensive) both succeeded. The ticket branch and worktree were deleted at the owner's request.

**Remaining.**

- TTW-147 must configure a real provider before any `NODE_ENV=production` deployment, and should fix `MAIL_SECURE` for port 587 (finding 4).
