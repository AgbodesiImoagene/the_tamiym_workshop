# TTW-211 — Test site settings saves against the real API without breaking parallel specs

**Epic:** 8 — Client review delivery\
**Status:** Implemented, awaiting independent review\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

Found in the TTW-209 audit. `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` answers the site settings PATCH with a stub (`mockSettingsSave`), so the success path of the save (the body the page sends, the "Site settings saved." state) never reaches the real API. The stub exists because site settings are one global row (VAT rate, payout mode, cadence) that checkout and payout specs read in parallel: a real save of 0 % or 100 % VAT from three viewport runs would change their totals.

## Proposal

Find a way to run the save for real without disturbing other specs, for example: a save that writes back the values just read (a real round trip), or a settings write serialised in a dedicated Playwright project and restored in a `finally`. Choose in the design review; do not weaken the existing assertions on the body (`vatRate: 0.0755`, boundaries 100 and 0). Keep the other two stubs (unset VAT rate, forced 400) as forced states.

## Invariants

- No shared setting other specs read stays changed after the spec ends.
- No test is deleted, skipped or weakened.
- Parallel viewport runs do not race on the row.

## Implementation plan

1. Design review: pick the approach, list the specs that read the settings.
2. Implement it for the save test; run it with parallel workers twice in a row.
3. Record evidence.

## Test and observability plan

- Playwright: converted spec, parallel workers, twice in a row, plus a checkout spec in the same run to prove totals are unchanged.
- Logs, metrics, traces, and alerts: none.

## References

- `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` — `mockSettingsSave`.
- `docs/tickets/ttw-209-replace-first-party-api-mocks-in-playwright.md` — audit.

## Acceptance criteria

- [x] The save success test sends the PATCH to the real API and asserts the saved result.
- [x] Specs that read the settings still pass in the same run, with unchanged totals.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- The stubbed unset-VAT and forced-400 tests.

## Design review

Date: 2026-11-14. Reviewer: the implementing session (Standard risk, design review before code).

**Who reads the row.** In the API: `PricingService.getSiteSettings` (VAT rate, prices include VAT, VAT on shipping, currency; used every time an order total is quoted or created), `payout-runs.service.ts`, `payout-run-scheduler.service.ts` and `campaign-ledger.service.ts` (payout mode, cadence, hold days, minimum). In the browser specs, the readers are every spec that creates or prices an order, plus the settings form itself:

- `tests/e2e/app/`: `checkout-idempotency`, `checkout-order-note`, `checkout-delivery-instructions`, `checkout-shipping-coverage`, `products-cart.comprehensive`, `design-workshop.comprehensive`, `orders.comprehensive`;
- `tests/e2e/web/fundraiser-checkout.comprehensive`;
- `tests/e2e/journeys/`: `payment-initiation`, `refund-lifecycle`, `reconciliation`, `inventory-lifecycle` (they create orders);
- `tests/e2e/admin/catalog-settings.comprehensive` (read-only tests of the form and the refused-save tests: they send nothing) and `orders-workspace.comprehensive`.

**Options.**

1. Round trip with the same values: rejected. The existing assertions require `vatRate: 0.0755`, 100 and 0, and a changed payout mode and cadence; a save of the values just read would prove none of it, which is a weakened test.
2. Real write in the same projects, restored in a `finally`: rejected. Even restored, the row holds 0 %, 7.55 % or 100 % VAT for several seconds, and any checkout spec running on another worker in that window prices its order with the wrong rate. The three viewport runs would also race on the row.
3. Real write in a dedicated project that starts only after the readers have finished, not fully parallel, with a snapshot and restore around every test: chosen.

**Decision (option 3).**

- The save test moves, unchanged in its assertions, to `tests/e2e/admin-settings-writes/site-settings-save.comprehensive.spec.ts`, in a new project `chromium-admin-settings-writes`. Its `dependencies` are `setup`, `chromium-web`, `chromium-app`, `chromium-admin` and `chromium-journeys`, so Playwright starts it only when every reader project is done: no overlap by construction, whatever the number of workers. `fullyParallel: false` makes its three viewport runs take turns.
- `beforeEach` reads the row through the real admin API; `afterEach` writes it back (also when the test fails) and asserts the read-back is equal. A failed restore fails the test, so a dirty row cannot pass silently.
- The page's PATCH is no longer answered by a stub. The test waits for the real response, asserts 200, then asserts the response and a fresh `GET` carry the saved values (a stronger check than the stub allowed).
- The payout mode the test switches to is `AUTO_APPROVAL_REQUIRED` instead of `AUTO_EXECUTE`: the real API refuses `AUTO_EXECUTE` while `PAYOUT_AUTO_EXECUTE_ENABLED` is off (TTW-042), and the select-to-request wiring is proved just as well by any other mode.
- Kept as forced states (out of scope): unset VAT rate and forced 400 in `catalog-settings.comprehensive.spec.ts`.

**Known costs.** If a reader project fails, Playwright reports this project as not run (the failure itself is already the result to fix). Running only `--project=chromium-admin-settings-writes` also runs its dependencies. `test:e2e:comprehensive` and `test:e2e:matrix` list the new project.

**Risks and gates.** Standard: no schema, API or auth change. Gates: `playwright:validate`, `docs:validate`, lint and typecheck of the touched files, and the run evidence below.

## Implementation reviews

Pending: independent implementation review not yet run (Standard risk requires one before merge).

## Verification evidence

Environment: own database `tamiym_workshop_test_211` (dropped, migrated and seeded with `seed:e2e` before every full run, because `seed:e2e` is not re-runnable on an already seeded database: TTW-210), API on port 3111, web/app/admin built with `NEXT_PUBLIC_API_URL=http://localhost:3111/v1`, `--workers=4 --retries=1`. Command: `playwright test --project=setup --project=chromium-web --project=chromium-app --project=chromium-admin --project=chromium-journeys --project=chromium-admin-settings-writes`.

1. **Real save passes, alone** (`--project=chromium-admin-settings-writes --no-deps`, 1 worker): 3 passed (desktop-1440, tablet-834, mobile-393).
2. **Fails for the right reason when the contract regresses.** Temporary change in `admin-site-settings.controller.ts` (VAT rate stored multiplied by 100, reverted afterwards, `git diff` clean on `apps/api`): the 3 tests failed on `expect(first.saved).toMatchObject(first.body)` (`vatRate` expected 0.0755, received 7.55) and on the fresh `GET` read-back. The old stub could not detect this. Side effect noted: the corrupted row made the next test's restore fail, which is the intended alarm; the database was re-created afterwards.
3. **Two full multi-worker runs in a row, green** (4 workers, a checkout spec and the payment journeys in the same run, settings project last): run A 182 passed, 3 skipped, 1 flaky, exit 0; run B 182 passed, 3 skipped, 1 flaky, exit 0. In both, `chromium-admin-settings-writes` ran after the 180 other tests (`✓ 185/186/187`), and `checkout-idempotency`, `checkout-order-note` and `payment-initiation` passed.
4. **Totals unchanged.** Before and after each run the `site_settings` row is identical (`diff` of the full row: VAT 0.0750, prices include VAT, VAT on shipping, NGN, AUTO_APPROVAL_REQUIRED, cadence 7, hold 7, minimum 1000.00, auto retry true). The orders created during each run all carry `vatRateSnapshot = 0.0750`, `pricesIncludeVatSnapshot = true`, `vatAppliesToShippingSnapshot = true` (query on `orders.createdAt` after the run start: 3 orders per run, 1 distinct value each).
5. Gates: `pnpm playwright:validate` passed, `pnpm docs:validate` passed, `prettier --check` on the touched files passed, `tsc --noEmit` (strict, with node types) on the new and the edited spec passed. ESLint ignores `tests/e2e`.

**Pre-existing problems met while proving (not from this ticket, not fixed):**

- `campaign-authoring.comprehensive` desktop-1440 "fundraiser hub controls and editor entry" fails on the first attempt of a fresh API start (a 500 console error) and passes on retry.
- `admin-mfa.smoke` "wrong TOTP errors then valid TOTP reaches overview" and `auth-mfa-sessions.smoke` "admin MFA recovery code" failed in some of my runs (once each; TOTP window and rate limit sensitive); with the admin login rate limit hit after many reruns (`429`) the whole suite fails at setup. Because the new project depends on the others, such a failure makes it report "did not run" instead of running.
- `checkout-idempotency` is flaky under 4 workers (409 then a 60 s timeout once; passes alone).
- Another session's Playwright run on the fixed ports 3000/3002/3003 collided with mine twice (`EADDRINUSE`, then a web server stopped mid-run); the runs above were taken when the ports were free. The ports are hard-coded in `playwright.config.ts`.
- `seed:e2e` cannot be run twice on one database (TTW-210).

## Completion summary

The site settings save test now writes to the real API. It moved to `tests/e2e/admin-settings-writes/site-settings-save.comprehensive.spec.ts` (same body assertions: `vatRate: 0.0755`, 100 and 0), runs in the new `chromium-admin-settings-writes` project that starts after every project that reads the row, takes turns across the three viewports, and restores the row after each test (checked by a read-back). It also asserts the real answer and a fresh `GET`. One deliberate change: the payout mode it switches to is `AUTO_APPROVAL_REQUIRED` rather than `AUTO_EXECUTE`, which the real API refuses while `PAYOUT_AUTO_EXECUTE_ENABLED` is off. The unset-VAT and forced-400 stubs stay. Files: `playwright.config.ts`, `package.json` (two scripts list the project), `tests/e2e/fixtures/admin-api.ts` (`readSiteSettings`, `restoreSiteSettings`), `tests/e2e/admin/site-settings-helpers.ts`, `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` (helper moved, save test and stub removed). Remaining: independent implementation review; merge on the user's request.
