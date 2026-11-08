# TTW-084 — Create default site settings so VAT is never silently 0%

**Epic:** 8 — Client review delivery\
**Status:** Implemented-unverified (local commit, CI not run)\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 8.6, VAT is 0% until site settings are saved** (Critical, P0, 1–2 h, status "To do"): No default site settings are created: VAT is zero without any warning.

## Proposal

- Create the default `SiteSettings` row in the production seed, with the current Nigerian VAT rate, confirmed in the ticket.
- If the row is missing at quote time, fail clearly instead of pricing at 0% VAT.
- Add the step to the release checklist (`docs/release/controlled-release-checklist.md`).

## Invariants

- A quote never uses a VAT rate nobody set.
- Orders keep their frozen VAT snapshot (TTW-024).

## Implementation plan

1. Start `codex/ttw-084-create-default-site-settings` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: quote with and without the settings row.
- Integration: seed on an empty database, then quote and read the VAT line.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/pricing/pricing.service.ts:362` — row 8.6
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] A fresh deployment quotes the configured VAT rate before any admin opens Settings. Evidence: `site-settings-default.e2e-spec.ts` › "quotes 7.5% VAT on a fresh deployment before anyone opens Settings".
- [x] Swagger, shared contracts, migrations and docs are updated where applicable.
- [x] Required quality gates pass, with evidence recorded below (local; CI runs only once `main` is pushed).

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Recorded 2026-11-08, before implementation.

**Finding confirmed on `main` (dc0e11e).**

- `PricingService.getSiteSettings()` (`apps/api/src/pricing/pricing.service.ts:353-376`) returns `vatRate: 0` when the `default` row is missing, without any warning.
- `prisma/seed.ts` only loads Nigerian states and LGAs. The release path runs only `prisma migrate deploy` (`docs/release/controlled-release-checklist.md`, CI workflows), never the seed. A seed-only fix would therefore not reach a fresh deployment.
- A second path writes a VAT rate nobody set: `PATCH /v1/admin/site-settings` creates the row with `vatRate ?? 0` when it is missing and the admin only saves payout fields.

**Decisions (approved by the user on 2026-11-08).**

- Default values: VAT 7.5% (`0.075`), prices include VAT, VAT applies to shipping, currency NGN. These match the schema defaults. (`seed:e2e` intends 7.5% but actually stores 7%, a pre-existing bug flagged under "Remaining".)
- Mechanism: a Prisma migration (`migrate dev --create-only`, then one SQL statement added) inserts the `default` row with `ON CONFLICT ("id") DO NOTHING`. This deviates from the ticket's "production seed" proposal because the seed never runs on release. Precedent for data statements in a generated migration: TTW-024, TTW-030. `schema.prisma` does not change, so there is no drift.

**Design.**

1. Migration: insert the default row once, never overwrite an admin-edited row.
2. Fail closed: if the row is missing at quote time, `getSiteSettings()` logs an error (no PII) and throws `ServiceUnavailableException` (503). This covers both quote routes and both order-creation routes, which all go through `quoteStandard`/`quoteCampaign`. The order is not created.
3. Admin PATCH: when the row is missing and `vatRate` is absent, refuse with 400 instead of creating a 0% row.
4. Swagger: document 503 on `POST /orders/quote`, `POST /orders`, `POST /campaigns/{id}/orders/quote` and `POST /campaigns/{id}/orders`, and 400 on the admin PATCH. Regenerate contracts.
5. Release checklist: after `migrate deploy`, check the VAT rate in Admin → Settings.

**Invariants and how they hold.**

- A quote never uses a VAT rate nobody set: the only fallback is removed, and the only implicit 0 on write through the API is refused. Correction after the implementation review: the admin page could still send back the 0 it was shown when the row was missing (review 1, finding 1). Fixed in the follow-up below, approved by the user on 2026-11-08.
- Frozen order snapshots (TTW-024) are untouched: no code path rewrites existing orders.
- Idempotency: `ON CONFLICT DO NOTHING` on the primary key, so re-running the statement, or running it against a database where an admin already saved settings, changes nothing.

**Risks.** Any local or CI database that relied on the missing row now gets 7.5% inclusive VAT. For inclusive prices the total does not change, only the extracted VAT line. `pricing-quote.e2e-spec.ts` pins VAT to 0 and restores the previous row, so it is unaffected.

**Out of scope, flagged only.** The payout fallbacks (`payoutSettlementHoldDays ?? 7`, etc.) in `apps/api/src/payouts/*`.

## Implementation reviews

**Review 1, 2026-11-08: independent subagent, implementation and security charter. Verdict: PASS, with three findings.**

Checked and holding:

- the migration SQL matches the `site_settings` DDL;
- `getSiteSettings` is the only VAT read in the API, and its callers are the 4 documented routes;
- a 503 happens before the order transaction, the stock reservation and any idempotency write, so no partial state is left (the e2e checks that 0 orders exist);
- frozen snapshots are untouched;
- the log line carries no PII;
- the e2e restores the shared row.

Findings:

1. **Medium-low, fixed in the follow-up (user approved doing it in this ticket).** When the row is missing, `GET /v1/admin/site-settings` still returns `vatRate: 0`. The admin page (`apps/admin/app/admin/settings/site/page.tsx:55`, `:98`) pre-fills that 0 and always sends `vatRate`, so saving only a payout field would recreate the row at 0%. This only happens if someone deletes the row by hand: the migration creates it on every deployment. Fixing it changes the admin screen (GET returns `vatRate: null`, the form requires a rate), which is outside this ticket's scope. The user asked for it here; see the follow-up and review 2.
2. **Low, fixed.** The e2e expected `837.21`, which assumed a 2000 shipping fee. In the shared, never-truncated test database the oldest Lagos zone wins. The expected VAT is now derived from `quote.shippingFee`.
3. **Low, fixed.** The web and app checkouts display `apiError.message`, so the 503 text is now generic ("Pricing is temporarily unavailable. Please try again later."). The configuration detail stays in the server log only.

**Follow-up for finding 1 (2026-11-08, approved by the user).**

- `GET /v1/admin/site-settings` returns `vatRate: null`, never 0, when the row is missing. Swagger is updated.
- The admin page keeps the VAT field empty in that case and shows an alert ("No VAT rate is set. Checkout is paused until you enter one and save."). It refuses to save an empty, out-of-range or over-precise rate.
- The field is also empty while settings load, instead of showing a placeholder 0.
- `UpdateSiteSettingsDto.vatRate` now allows at most 4 decimal places (`maxDecimalPlaces: 4`), matching `Decimal(5,4)`. Before, an input such as 0.00004 was stored as 0.0000, i.e. 0%.
- The admin page limits the percentage to 2 decimals and checks it on the text, not with float arithmetic. The saved rate is shown rounded to 2 decimals, so 7% shows as `7`, not `7.000000000000001`.

**Review 2, 2026-11-08: independent subagent, implementation charter on the follow-up. Verdict: FAIL on the first version, then fixed.**

1. **Medium, fixed.** The Playwright test could read the placeholder `'0'` shown while loading. Fix: the form starts empty, and the test waits for the Save button, which only renders after loading, before reading the value.
2. **Low, fixed.** The client-side error was not announced. It now has `role="alert"`, and the VAT input gets `aria-invalid` plus `aria-describedby` pointing at it.
3. **Low, fixed.** A rate finer than the stored precision could round to 0%. Now refused by the DTO and the page (see the follow-up above).
4. **Low, accepted.** The null-rate screen has no Playwright test: covering it would mean deleting the shared settings row, which breaks parallel checkout tests, or mocking a first-party API, which the rules forbid. It is covered by the API unit test, and it was played by hand in the browser (see evidence).

Not addressed (already the case before this change): the page uses `useState` instead of Zod and React Hook Form, and existing hard-coded colours. The new alert uses the `text-destructive` theme token.

## Verification evidence

Run on 2026-11-08 in worktree `.claude/worktrees/ttw-084`, against a dedicated local database (`tamiym_workshop_ttw084_test`, Redis DB 14), so as not to disturb the parallel TTW-082 session.

Tests written first and failing for the right reason:

- unit: 4 failed (quote resolved at 0% instead of rejecting; PATCH created the row);
- e2e: 3 failed (row `null` after the migration SQL; `vatRate` 0; quote resolved instead of rejecting).

After implementation:

| Command                                                                                                          | Result                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter api test -- src/pricing/pricing.service.spec.ts src/admin/admin-site-settings.controller.spec.ts` | 27 passed                                                                                                                           |
| `pnpm --filter api test:e2e -- test/site-settings-default.e2e-spec.ts test/pricing-quote.e2e-spec.ts`            | 10 passed                                                                                                                           |
| `pnpm --filter api test:e2e` (full suite, before review fixes)                                                   | 22 suites, 131 tests passed                                                                                                         |
| `pnpm test`                                                                                                      | api 1266, web 40, app 42 passed                                                                                                     |
| `pnpm lint`                                                                                                      | 0 errors. The api warnings are on `main` already; `pricing.service.ts` has the same 11 `no-unsafe-assignment` warnings as on `main` |
| `pnpm typecheck`, `pnpm format:check`                                                                            | pass                                                                                                                                |
| `pnpm openapi:check`                                                                                             | "OpenAPI contract drift check passed."                                                                                              |
| `pnpm migrations:check`                                                                                          | "Prisma schema matches the migrations."                                                                                             |
| `pnpm release:check-migrations`                                                                                  | "Migration artefacts OK (26 migrations)."                                                                                           |
| `pnpm coverage:ratchet`                                                                                          | pass (lines 82.45%, floor 56.00%)                                                                                                   |
| `pnpm coverage:diff` (vs `origin/main`)                                                                          | 7/7 changed lines covered (100%)                                                                                                    |

Not run: CI (`ci.yml` runs on `main` only).

**Follow-up evidence (admin page and API GET), 2026-11-08.**

Tests written first and failing for the right reason:

- GET returned `0`, received instead of `null`;
- the DTO accepted `0.00004`.

The admin app has no unit-test runner, so the page change was covered by Playwright and by hand.

| Command                                                                                                                                                                        | Result                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `pnpm --filter api test -- src/admin`                                                                                                                                          | 60 passed                                                                                      |
| `pnpm --filter api test:coverage`                                                                                                                                              | 1275 passed                                                                                    |
| `pnpm --filter web test`, `pnpm --filter app test`                                                                                                                             | 40 and 42 passed                                                                               |
| `PLAYWRIGHT_API_URL=http://localhost:3011 PORT=3011 pnpm exec playwright test tests/e2e/admin/catalog-settings.comprehensive.spec.ts --project=setup --project=chromium-admin` | 18 passed, including "site settings refuse to save an empty VAT rate (TTW-084)" at 3 viewports |
| `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm openapi:check`, `pnpm migrations:check`, `pnpm playwright:validate`, `pnpm coverage:ratchet`, `pnpm coverage:diff`   | pass (0 lint errors; the admin warnings are on `main` already)                                 |
| `pnpm --filter api test:e2e -- test/site-settings-default.e2e-spec.ts test/pricing-quote.e2e-spec.ts`                                                                          | 10 passed                                                                                      |

Playwright ran with the API on port 3011 because port 3001 is held by an unrelated local project. The admin was built with `NEXT_PUBLIC_API_URL=http://localhost:3011/v1`, because that value is baked in at build time.

Played by hand in the browser (built API and admin, seeded test admin, `default` row deleted in the dedicated database):

- the VAT field is empty and the alert is shown;
- saving with only the payout cadence changed is refused, and no row is created;
- `0.004` is refused, with the error announced and `aria-invalid="true"`;
- `7.55` is saved: the database holds `0.0755` and the field shows `7.55`;
- with a row present, clearing the field and saving is refused, and the rate stays unchanged.

The two sets of new tests were not shown failing first:

- the Playwright test;
- the admin page itself, which has no unit runner.

Under the parallel `pnpm test` (turbo), `apps/app` showed 3 and then 5 failures (WorkshopEditor auto-save, DashboardCheckoutPage). `apps/app` has no change on this branch, and its 42 tests pass when run alone, twice. This looks like existing timing sensitivity under load.

## Completion summary

Done:

- Migration `20261108014827_ttw084_default_site_settings` creates the `default` row (7.5%, prices include VAT, VAT on shipping, NGN) and never overwrites an existing row.
- `PricingService` now refuses with 503 instead of pricing at 0% when the row is missing. This covers the 2 quote routes and the 2 order-creation routes.
- `PATCH /v1/admin/site-settings` refuses (400) to create the row without `vatRate`, and the DTO refuses a rate finer than 4 decimal places.
- `GET /v1/admin/site-settings` reports `vatRate: null` when no row exists. The admin page then shows an empty field and an alert, and refuses to save an empty, out-of-range or over-precise rate.
- New Playwright acceptance test on the admin settings page.
- Swagger and OpenAPI artefacts regenerated. Release checklist and `docs/pricing-strategy.md` updated.

Deviations from the proposal:

- A migration instead of the production seed, because release never runs the seed (approved by the user).
- The admin PATCH guard was added after the design review found the second 0% path.

Remaining:

- Pre-existing bug, outside this ticket: `apps/api/scripts/seed-e2e-dummy-data.ts:407` stores `toAmount(0.075)`, and `toAmount` uses `toFixed(2)`, so `seed:e2e` writes VAT 7% (`0.0700`), not 7.5%.
- Pre-existing: `apps/app` unit tests are flaky under parallel turbo load (see evidence).
- The admin page still uses `useState` rather than Zod and React Hook Form.
- Out of scope: the payout fallbacks in `apps/api/src/payouts/*`.
- CI evidence after the merge to `main`.
- The `ROADMAP.md` checkbox is left for the merge, to avoid a conflict with TTW-082.
