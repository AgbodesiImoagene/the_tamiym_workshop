# TTW-211 — Test site settings saves against the real API without breaking parallel specs

**Epic:** 8 — Client review delivery\
**Status:** Complete\
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

**Review 1** (before the last commit), fresh agent, read-only, verdict **PASS**, no blocking point. Checked: the test talks to the real API (no `fulfill`), assertions are the same as the old stub test plus the real answer and a fresh `GET`; the new project holds only its 3 tests and starts after all readers; scripts include it; helper file not collected; throttler change correct, single caller. Follow-ups applied: the starting row is refused when `vatRate` is not a fraction (a corrupted baseline would otherwise be "restored"); `afterEach` no longer crashes when setup failed; ticket wording on CI and lint corrected; README notes the matrix projects. Noted by the reviewer, then handled in a follow-up commit: `AUTO_EXECUTE` is covered at API level with the gate on (new test "accepts AUTO_EXECUTE and stores it" in `admin-site-settings.controller.spec.ts`; the gate-off refusal was already tested); the Redis client was never closed (the factory now passes connection options, not a client, so `ThrottlerStorageRedisService` creates it, connects at creation and disconnects it on module destroy; `throttler-redis.factory.spec.ts` checks the options; `jest src/config src/admin/admin-site-settings`: 83 passed, api `tsc` and eslint clean; two cold API starts in a row then passed `campaign-authoring`). Left as is, on purpose: a unit test with a real ioredis client would need a Redis service (the options check is the unit-level proof; the e2e cold start is the behaviour proof); the 02:00 UTC payout scheduler reading the row is a window of seconds on a test API and is only noted; the connection is still not awaited at boot, so a request within milliseconds of the start can be rejected (ioredis connects before the HTTP port opens in practice, not guaranteed); a second spec file in the new project could run on another worker (README tells to keep one file).

**Review 2** (on the four commits up to `c8b763d`), fresh agent, read-only, verdict **PASS**, no blocking point. It re-read the real behaviour of `@nest-lab/throttler-storage-redis` and confirmed: with options the storage creates the client and disconnects it in `onModuleDestroy`; ioredis connects at creation by default; shutdown hooks are enabled in `main.ts`; one caller only; `NODE_ENV=test` keeps the in-memory throttler. `jest src/config src/admin/admin-site-settings`: 83 passed; `playwright:validate`, `docs:validate`, prettier OK. Its three ticket-accuracy points (wrong test name, status contradicting the review, stale test count) are fixed in this file; its suggestion to reset `original` at the start of each test is applied. Not exercised in CI: the throttler fix only has local proof (CI uses the in-memory throttler).

## Verification evidence

Environment: own database `tamiym_workshop_test_211` (dropped, migrated and seeded with `seed:e2e` before every full run, because `seed:e2e` is not re-runnable on an already seeded database: TTW-210), API on port 3111, web/app/admin built with `NEXT_PUBLIC_API_URL=http://localhost:3111/v1`, `--workers=4 --retries=1`. Command: `playwright test --project=setup --project=chromium-web --project=chromium-app --project=chromium-admin --project=chromium-journeys --project=chromium-admin-settings-writes`.

1. **Real save passes, alone** (`--project=chromium-admin-settings-writes --no-deps`, 1 worker): 3 passed (desktop-1440, tablet-834, mobile-393).
2. **Fails for the right reason when the contract regresses.** Temporary change in `admin-site-settings.controller.ts` (VAT rate stored multiplied by 100, reverted afterwards, `git diff` clean on `apps/api`): the 3 tests failed on `expect(first.saved).toMatchObject(first.body)` (`vatRate` expected 0.0755, received 7.55) and on the fresh `GET` read-back. The old stub could not detect this. Side effect noted: the corrupted row made the next test's restore fail, which is the intended alarm; the database was re-created afterwards.
3. **Two full multi-worker runs in a row, green** (4 workers, a checkout spec and the payment journeys in the same run, settings project last): run A 182 passed, 3 skipped, 1 flaky, exit 0; run B 182 passed, 3 skipped, 1 flaky, exit 0. In both, `chromium-admin-settings-writes` ran after the 180 other tests (`✓ 185/186/187`), and `checkout-idempotency`, `checkout-order-note` and `payment-initiation` passed.
4. **Totals unchanged.** Before and after each run the `site_settings` row is identical (`diff` of the full row: VAT 0.0750, prices include VAT, VAT on shipping, NGN, AUTO_APPROVAL_REQUIRED, cadence 7, hold 7, minimum 1000.00, auto retry true). The orders created during each run all carry `vatRateSnapshot = 0.0750`, `pricesIncludeVatSnapshot = true`, `vatAppliesToShippingSnapshot = true` (query on `orders.createdAt` after the run start: 3 orders per run, 1 distinct value each).
5. Gates: `pnpm playwright:validate` passed, `pnpm docs:validate` passed, `prettier --check` on the touched files passed, `tsc --noEmit` (strict, with node types) on the new and the edited spec passed. `tests/e2e` belongs to no package, so the root lint (`turbo run lint`) does not cover it.

**Problems met while proving, and what was done (second pass, at the user's request):**

- _First request after an API start returned a 500_ (`campaign-authoring.comprehensive` desktop-1440 failed on every fresh start, `GET /v1/organiser/applications/eligibility`). Cause found with the API log: the Redis throttler storage was built with `lazyConnect: true` and `enableOfflineQueue: false`, so the client was not connected for the first request ("Stream isn't writeable and enableOfflineQueue options is false"). **Fixed** in `apps/api/src/config/throttler-redis.factory.ts`: first by removing `lazyConnect`, then (review follow-up) by passing connection options so the storage owns the client; it connects at creation, is closed on shutdown, and still fails fast if Redis is down. Test first: First version of the test (options passed to a mocked ioredis client) failed with `lazyConnect` `true`, then passed after the fix; the final version (after the review) is "lets the storage connect and own the client, failing fast without a queue" in `throttler-redis.factory.spec.ts`; `jest src/config src/admin/admin-site-settings`: 83 passed. This is a small production-code change outside the original test-only scope, recorded here. Reviewer note: `app.module.ts` uses an in-memory throttler when `NODE_ENV=test`, and CI forces `NODE_ENV=test`, so this path is only exercised by a local `.env.test` with another `NODE_ENV`, in development and in production: the fix is not a fix of a CI failure.
- _MFA specs failing, whole suite failing at setup with `429`._ Cause: the API login rate limits live in Redis, which my many reruns shared with other sessions; the limit is a security control and was not changed. Not a test defect. **Documented** in `tests/e2e/README.md` (own `REDIS_DB` per worktree); my environment now uses `REDIS_DB=11`.
- _Fixed ports 3000/3002/3003 collide between concurrent runs._ **Documented** in the README (run one suite at a time). Not fixed in code: making the ports configurable also needs the API origin settings to follow, a change of its own.
- _`seed:e2e` cannot run twice on one database._ That is TTW-210, handled in its own session; **documented** in the README (re-create the database before each full run).
- _`checkout-idempotency` flaky under 4 workers_ (409 then a 60 s timeout, seen twice in full runs). **Not reproduced** in 8 parallel repeats alone, nor in the last runs; no cause found, not fixed. Needs its own ticket if it comes back.
- _Skipped dependency._ If a reader project fails, the new project reports "did not run". Kept on purpose (see design review).

**Final confirmation run** (fresh database and own Redis database, no exclusion, 4 workers, `--retries=1`): 183 passed, 3 skipped, 0 failed, 0 flaky, exit 0; settings row identical before and after; the 3 orders created carry `vatRateSnapshot = 0.0750`.

## Completion summary

The site settings save test now writes to the real API. It moved to `tests/e2e/admin-settings-writes/site-settings-save.comprehensive.spec.ts` (same body assertions: `vatRate: 0.0755`, 100 and 0), runs in the new `chromium-admin-settings-writes` project that starts after every project that reads the row, takes turns across the three viewports, and restores the row after each test (checked by a read-back). It also asserts the real answer and a fresh `GET`. One deliberate change: the payout mode it switches to is `AUTO_APPROVAL_REQUIRED` rather than `AUTO_EXECUTE`, which the real API refuses while `PAYOUT_AUTO_EXECUTE_ENABLED` is off. The unset-VAT and forced-400 stubs stay. Files: `playwright.config.ts`, `package.json` (two scripts list the project), `tests/e2e/fixtures/admin-api.ts` (`readSiteSettings`, `restoreSiteSettings`), `tests/e2e/admin/site-settings-helpers.ts`, `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` (helper moved, save test and stub removed), `apps/api/src/config/throttler-redis.factory.ts` and its spec (cold-start 500 fix, see above), `tests/e2e/README.md`. Remaining: independent implementation review; merge on the user's request.
