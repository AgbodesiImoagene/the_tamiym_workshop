# TTW-181 — Seed the real 7.5% VAT rate in the e2e data

**Epic:** 0 — Trustworthy delivery system  
**Status:** Not started  
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

- [ ] After `pnpm --filter api seed:e2e`, the `default` settings row has VAT `0.0750`, shown by a command or test output.
- [ ] Playwright specs that depend on the seed still pass.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Production defaults: already handled by TTW-084's migration.

## Design review

Low risk: implementation review only.

## Implementation reviews

## Verification evidence

## Completion summary
