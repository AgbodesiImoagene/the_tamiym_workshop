# TTW-181 — Seed the real 7.5% VAT rate in the e2e data

**Epic:** 0 — Trustworthy delivery system  
**Status:** Done (local commit on `codex/ttw-181-seed-real-vat-rate`, not pushed)  
**Risk:** Low  
**Blocked by:** None  
**Blocks:** None

## Background

The e2e seed means to set VAT to 7.5%, but it stores 7%.

- `apps/api/scripts/seed-e2e-dummy-data.ts:407` (update) and `:419` (create) pass `toAmount(0.075)` as `vatRate`.
- `toAmount` (`seed-e2e-dummy-data.ts:209-211`) is a money helper: `amount.toFixed(2)`. `(0.075).toFixed(2)` gives `"0.07"`, and the column `vatRate Decimal(5,4)` stores `0.0700`.

Every database prepared with `pnpm --filter api seed:e2e` (local Playwright runs and the CI Playwright jobs) therefore prices with 7% VAT, while production starts at 7.5% (migration `20261108014827_ttw084_default_site_settings`, TTW-084). Tests that read VAT from the seed check the wrong rate without knowing it.

Found during TTW-084. The admin settings Playwright test (`tests/e2e/admin/catalog-settings.comprehensive.spec.ts:37-57`) had to read the loaded value instead of expecting `7.5`. Already noted, without a ticket, in `docs/tickets/ttw-038-fix-invalid-pricing-quote-query.md:137`.

## Proposal

To confirm at design review:

- Write the rate without the money helper, for example `vatRate: '0.0750'` or a small `toRate()` helper that keeps 4 decimal places, matching `Decimal(5,4)`.
- Check that no other non-money field in the seed goes through `toAmount`.

## Invariants

- After `seed:e2e`, `site_settings.vatRate` is exactly `0.0750`.
- Money amounts in the seed keep 2 decimal places.

## Implementation plan

1. Add a check that fails today: after the seed runs, the `default` row has `vatRate = 0.075`.
2. Fix the seed.
3. Make `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` expect `7.5` again if that adds value, or leave it reading the loaded value.

## Test and observability plan

- Unit/component: none, unless a `toRate()` helper is added (then test its rounding).
- Integration/e2e: run `seed:e2e` on the test database and read the row back; run the Playwright specs that touch prices or the settings page.
- Failure, retry, and concurrency: the seed is an upsert, so running it twice keeps `0.0750`.
- Logs, metrics, traces, and alerts: none.

## References

- `apps/api/scripts/seed-e2e-dummy-data.ts:209-211` — `toAmount` rounds to 2 decimals.
- `apps/api/scripts/seed-e2e-dummy-data.ts:404-429` — `siteSettings.upsert` with `toAmount(0.075)`.
- `apps/api/prisma/schema.prisma` — `vatRate Decimal(5,4)`.

## Acceptance criteria

- [x] After `pnpm --filter api seed:e2e`, the `default` settings row has VAT `0.0750`, shown by a command or test output.
- [ ] Playwright specs that depend on the seed still pass. Not run locally (see evidence); to read on the CI Playwright jobs after the push to `main`.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- Production defaults: already handled by TTW-084's migration.

## Design review

Low risk: implementation review only.

Choice made at implementation: the rate is the literal `'0.0750'` (4 decimals, as `Decimal(5,4)`), with no `toRate()` helper, since there is a single rate in the seed. The settings upsert moved to `apps/api/scripts/seed-e2e-site-settings.ts` because `seed-e2e-dummy-data.ts` runs `main()` on import and cannot be loaded by a test.

## Implementation reviews

**2026-11-08, independent reviewer (fresh subagent, implementation charter), read-only: PASS, no blocking finding.** Confirmed with file references:

- All 9 fields of the old inline upsert are still written, in both `update` and `create`, with the same values except `vatRate` (`seed-e2e-site-settings.ts`, schema `prisma/schema.prisma:764-774`).
- Every remaining `toAmount` call in `seed-e2e-dummy-data.ts` is a money field (`flatFee`, `amount`, `goalAmount`, `currentAmount`, subtotal, shipping, discount, total, unit prices). No rate, percentage, quantity or day count goes through it.
- The spec imports the production module, fails on the original bug, and restores the previous row like `site-settings-default.e2e-spec.ts`.
- Scope: `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` untouched.

Non-blocking notes, left as is: the restore deletes then recreates the row (same pattern as `site-settings-default.e2e-spec.ts`; e2e runs with `maxWorkers: 1`); the spec does not assert the non-VAT fields (covered by the review).

## Verification evidence

Local database `tamiym_workshop_ttw181_test`, Redis DB 13, Node 24.22.1.

- Reproduction before the fix: `pnpm --filter api seed:e2e` then `SELECT id, "vatRate", "minimumPayoutAmount" FROM site_settings;` → `default | 0.0700 | 1000.00`.
- Red phase: `pnpm --filter api test:e2e test/seed-e2e-site-settings.e2e-spec.ts` with the extracted module still using the 2-decimal rounding → `Tests: 2 failed`, `Expected: "0.0750" Received: "0.0700"` on both cases.
- After the fix, rebased on `main` (`0be20ba`, includes TTW-083) and `prisma migrate deploy`:
  - `seed:e2e` run twice, then the same query → `default | 0.0750 | 1000.00`.
  - `test/seed-e2e-site-settings.e2e-spec.ts` → `Tests: 2 passed` (`creates the default row with VAT 0.0750 and money kept to 2 decimals`, `overwrites an existing row back to VAT 0.0750 on every run`). The row reads `0.0750` afterwards (restored).
  - `pnpm --filter api typecheck` → exit 0.
- Rebased again on `main` `f7f6fff` (includes TTW-086, which also edits `seed-e2e-dummy-data.ts`; no conflict):
  - `prisma migrate deploy` (nothing pending), `seed:e2e` twice → `default | 0.0750 | 1000.00`.
  - `pnpm --filter api typecheck` → exit 0.
  - `test:e2e test/seed-e2e-site-settings.e2e-spec.ts test/shipping-zone-coverage.e2e-spec.ts`: first run `Tests: 1 failed, 6 passed` under heavy machine load (failure detail not captured; the TTW-181 spec passed). Re-runs: shipping spec alone `5 passed`, then both together twice `7 passed, 7 total`, exit 0.
- Before the rebase (base `81d003b`):
  - `pnpm --filter api test:e2e` (full suite) → `Test Suites: 24 passed, 24 total`, `Tests: 142 passed, 142 total`, exit 0.
  - `pnpm --filter api test` → `Test Suites: 147 passed`, `Tests: 1310 passed`, exit 0.
  - `pnpm --filter api lint` → exit 0, 0 errors, 14 existing warnings, none in the touched files. `eslint test/seed-e2e-site-settings.e2e-spec.ts` → exit 0. `prettier --check` on the 3 files → clean.
- Not run: Playwright. Only `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` mentions VAT, and it reads the loaded value (TTW-084), so it passes with either rate. Prices are VAT-inclusive, so no other spec's totals change. A local run needs a full build of the three Next apps on ports 3000/3002/3003, which the parallel TTW-182/TTW-183 sessions may use; it was skipped. The CI Playwright jobs (`ci.yml` smoke, `playwright-comprehensive.yml`) run `seed:e2e` and will cover it after the push.

## Completion summary

- Fix: `apps/api/scripts/seed-e2e-site-settings.ts` writes `vatRate: '0.0750'`; `seed-e2e-dummy-data.ts` calls `seedE2eSiteSettings(prisma)` instead of the inline upsert.
- Regression guard: `apps/api/test/seed-e2e-site-settings.e2e-spec.ts` (real Postgres, create + overwrite twice).
- Deviations from plan: step 3 (make the admin settings Playwright spec expect `7.5` again) not done, because TTW-183 is editing that file in parallel. It can expect `7.5` once both tickets are on `main`.
- Left: merge into `main` and push when the user asks, then read the CI Playwright jobs and move TTW-181 to Complete in `docs/tickets/README.md` and `ROADMAP.md` (closing commit). `docs/tickets/ttw-038-fix-invalid-pricing-quote-query.md:137` still records the bug as noticed; it is a past record and was left unchanged.
