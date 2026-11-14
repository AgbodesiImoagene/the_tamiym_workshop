# TTW-209 — Replace first-party API mocks in Playwright tests with real data

**Epic:** 8 — Client review delivery\
**Status:** In review\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

`.cursor/rules/playwright-regression.mdc` says: "Do not mock first-party APIs in core acceptance journeys. Stub external providers through deterministic simulators." `CLAUDE.md` repeats it ("don't mock first-party APIs (Paystack is simulated)").

Found while replaying the TTW-201 test. `tests/e2e/admin/shipping-zone-area-picker.comprehensive.spec.ts` serves the zone and the geo lists from fixtures with `page.route` (`/v1/admin/shipping-zones/:id`, `.../areas`, `/v1/admin/geo/states`, `/v1/admin/geo/states/*/lgas`). It passes, but it never talks to the real API, so it cannot catch a drift in what the admin routes return (for example the `isActive` flag added by TTW-199).

A grep of `tests/e2e` (current `main`) shows more `route(...)` calls. **Candidates to classify, not confirmed violations:**

- `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` — site-settings API (3 places).
- `tests/e2e/journeys/refund-lifecycle.smoke.spec.ts` — `**/admin/orders/*/refund`.
- `tests/e2e/journeys/inventory-lifecycle.smoke.spec.ts` — `**/v1/products/*/availability`, `**/admin/inventory/*`.
- `tests/e2e/journeys/reconciliation.smoke.spec.ts` — `**/admin/reconciliation/findings**`.
- `tests/e2e/journeys/payment-initiation.smoke.spec.ts` and `tests/e2e/app/checkout-*.spec.ts` — `**/v1/orders/*/initiate-payment` (likely a provider simulation, to confirm) and `https://checkout.paystack.test/**` (external provider, allowed).

The rule targets _core acceptance journeys_ and allows provider simulators. A route that forces a rare error state can be acceptable if the real API cannot produce it; that has to be decided per case.

## Proposal

- Audit every `route(...)` in `tests/e2e` and classify each: external provider simulator (keep), first-party mock that can run against the real API (replace), first-party mock needed to force a state the real API cannot produce (keep, with a comment naming why, and a real-API test for the happy path).
- Start with the TTW-201 spec: run it against the real API with seeded data. It needs a deactivated state and a deactivated LGA, and a zone created through the real admin routes. No admin route deactivates a state, so the data must come from the e2e seed (`apps/api/scripts/seed-e2e-dummy-data.ts`) or a Prisma fixture. Use per-worker names so parallel tests do not collide, and clean up what the test creates.
- Replace the other first-party mocks the audit marks "replace", one spec at a time.
- Record the classification in the design review so the remaining mocks are justified in writing.

## Invariants

- Provider simulators (Paystack) stay deterministic and stay stubbed.
- No test is deleted, skipped or weakened to get green. A replaced test keeps its assertions.
- No shared seed row that other tests count or list is changed (the deactivated test state must not appear in the public lists other tests assert on).

## Implementation plan

1. Start `codex/ttw-209-replace-first-party-api-mocks-in-playwright` from current `main`, in its own worktree. Move this file into it and add the ticket rows to `docs/tickets/README.md` and `docs/tickets/ROADMAP.md`.
2. Audit and classify the mocks. Update this ticket if the list moved.
3. Record the design review below (Standard) before implementing.
4. Convert the TTW-201 spec first. Show it failing for the right reason if the picker or the API regresses (for example, make the API return no `isActive` locally), then green.
5. Convert the other "replace" specs in small, separately reviewable steps. Record any deviation here.
6. Run the gates (`pnpm playwright:validate`, `pnpm docs:validate`, typecheck, lint, the converted specs on a dedicated port set), record exact results, and obtain the independent review.

## Test and observability plan

- Playwright: each converted spec runs against the real API and real Postgres, with role-specific auth state.
- Run twice in a row and with parallel workers to prove the data is isolated and cleaned up.
- Logs, metrics, traces, and alerts: nothing new.

## References

- `.cursor/rules/playwright-regression.mdc` — the rule.
- `docs/16-playwright-regression-strategy.md` — browser-test source of truth.
- `tests/e2e/admin/shipping-zone-area-picker.comprehensive.spec.ts` — first case.
- `tests/e2e/fixtures/api.ts`, `tests/e2e/fixtures/paystack-simulator.ts` — API helper and provider simulator.
- `docs/tickets/ttw-201-mark-deactivated-states-in-the-zone-area-picker.md` — origin.

## Acceptance criteria

- [ ] Every `route(...)` in `tests/e2e` is classified in the design review.
- [ ] The TTW-201 picker spec runs against the real API with seeded data and still fails if the picker or the API contract regresses.
- [ ] Other first-party mocks classified "replace" are replaced; the rest carry a comment justifying them.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- The `seed:e2e` script failing on leftover fixture data in a reused test database (foreign key on `inventory_movements`): separate ticket if it blocks this work.
- Changing the Paystack simulator.
- Visual and accessibility suites.

## Design review

Standard risk, recorded before implementation (2026-11-13). Test code and one seed script only; no production code, schema or contract change.

### Audit of every `route(` in `tests/e2e`

`grep -rn "route(" tests/e2e` finds 18 calls in 9 files (the three checkout specs have two each). The fixtures (`tests/e2e/fixtures/`) contain none. Strategy doc `docs/16-playwright-regression-strategy.md` allows stubs for "external providers and deliberate frontend error-state tests".

| #   | File and call                                                                                      | What it fakes                                                                      | Class                                          | Decision                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1-4 | `admin/shipping-zone-area-picker.comprehensive.spec.ts` (zone, areas, geo states, geo LGAs)        | The whole zone page contract                                                       | First-party API, can run for real              | **Replace.** Real admin routes, one zone per test, deactivated rows from `seed:e2e`.                                                                                                                                                     |
| 5   | `admin/catalog-settings.comprehensive.spec.ts` `mockSettingsSave` (PATCH)                          | Success answer of the site settings save                                           | First-party, needed to avoid a shared write    | **Keep, with comment.** Site settings are one global row (VAT rate, payout mode) that checkout and payout specs read in parallel; a real save of 0 % / 100 % VAT would change their totals. The real PATCH is covered by API unit tests. |
| 6   | same file, GET with `vatRate: null` (uses `route.fetch`, so the rest is the real response)         | A state the seed never has and no admin route can create                           | Forced state                                   | **Keep, with comment.**                                                                                                                                                                                                                  |
| 7   | same file, PATCH answered 400                                                                      | A server refusal the page itself already prevents                                  | Deliberate frontend error-state test           | **Keep, with comment.**                                                                                                                                                                                                                  |
| 8-9 | `journeys/inventory-lifecycle.smoke.spec.ts` (`/v1/products/*/availability`, `/admin/inventory/*`) | The test fetches URLs that it mocks itself. Neither route exists in the real API   | First-party API, can run for real              | **Replace** with the real `GET /v1/inventory/variant/:id` and `GET /v1/products/:id`.                                                                                                                                                    |
| 10  | `journeys/reconciliation.smoke.spec.ts` (`/admin/reconciliation/findings`)                         | Mocked answer is an array; the real route returns `{ items, nextCursor }`          | First-party API, can run for real              | **Replace** with the real route and one finding from `seed:e2e`.                                                                                                                                                                         |
| 11  | `journeys/refund-lifecycle.smoke.spec.ts` (`/admin/orders/*/refund`)                               | Refund route, which calls `https://api.paystack.co/refund` (hard-coded in the API) | Provider boundary                              | **Keep, with comment.** Live Paystack is never called in CI. Real route covered by `apps/api/test/paystack-refund-lifecycle.e2e-spec.ts`.                                                                                                |
| 12  | `journeys/payment-initiation.smoke.spec.ts` (`/v1/orders/*/initiate-payment`)                      | Route that calls `https://api.paystack.co/transaction/initialize`                  | Provider boundary                              | **Keep, with comment.**                                                                                                                                                                                                                  |
| 13  | `app/checkout-order-note`, `checkout-delivery-instructions`, `checkout-idempotency` (3 specs)      | `initiate-payment` only; quote and order creation are real                         | Provider boundary (+ `checkout.paystack.test`) | **Keep.** Already documented in each spec header.                                                                                                                                                                                        |

Findings worth knowing: (a) the inventory and reconciliation stubs had already drifted from the real API (wrong paths, wrong shape) and passed anyway, because they only tested the stub; (b) the refund and payment-initiation "API" tests also assert only the stub. They stay (no test is deleted or weakened) but they prove nothing about the real routes: the checkout journeys and API integration tests carry that.

### Design of the picker conversion

- **Zone:** created by `POST /admin/shipping-zones` in a fixture (`tests/e2e/fixtures/admin-api.ts`) named `TTW-209 picker zone w<parallelIndex>-<timestamp>`, removed by `DELETE /admin/shipping-zones/:id` in the fixture teardown (also on failure). The API client reuses the admin session saved by the setup project and sends the CSRF token returned by `auth/me`.
- **Deactivated rows:** `seed:e2e` adds state `ZZ` "E2E Dormant State" (inactive) and LGA "E2E Dormant LGA" (inactive) under the seeded state Lagos. They are immutable reference rows (the test never writes them), so no per-worker names are needed. Public geo lists (`GeoService`) filter `isActive: true`, so these rows never appear in lists other specs count. The active choices are the seeded Lagos and Ikeja.
- **"No area was created" assertion:** previously a mocked `/areas` route returned 500 and recorded calls. Now the page's requests to `/areas` are recorded AND the zone's areas are read back from the real API (stronger: it checks the database, not just the request).
- **Seed change:** one reconciliation run (kind `TARGETED`, status `INCOMPLETE`) with one `RESOLVED` finding, so analytics (last `COMPLETED` run, `OPEN`/`ACKNOWLEDGED` findings) does not count it. Cleared by `clearFixtureData` (cascade).
- **Inventory:** the customer product detail must report `availableQuantity = max(0, stockOnHand - reserved)` against the real stock row. The admin inventory route is write-only (`PATCH`), and writing would change stock other specs count (and inventory movements, see the foreign key note below), so the admin half of the old test cannot be kept as a read. Recorded as a deviation.

### Test environment

A dedicated database `tamiym_workshop_test_209` (migrated and seeded with `seed:e2e`), API on port 3101, the three Next apps built with `NEXT_PUBLIC_API_URL=http://localhost:3101/v1`. Reason: `seed:e2e` fails on the shared test database (see Verification evidence), and the API on 3001 belongs to another session.

## Implementation reviews

Independent read-only review of commit `c404da1` by a fresh subagent, 2026-11-14: **PASS with reservations**, no blocking finding. It read the code and ticket only; it ran nothing.

- Audit confirmed: `grep` gives 18 `route(` calls; 11 stay (3 checkout specs, 3 site-settings, refund, payment-initiation), 7 removed. Classification holds; the PATCH stub in `catalog-settings` is the only contestable one (follow-up TTW-211).
- No test removed or skipped. Picker and reconciliation assertions kept or strengthened; the declared inventory deviation (admin half) confirmed.
- Isolation confirmed: public geo lists filter `isActive: true`; analytics reads the last `COMPLETED` run and `OPEN`/`ACKNOWLEDGED` findings only; no count assertion elsewhere on states or LGAs; cleanup runs in `finally`; `clearFixtureData` order is safe (cascade).
- To fix, handled: (1) this section was empty, now filled; (2) the "fails if the contract regresses" proof exists only for the picker. **Not proven for the reconciliation and inventory specs** (no forced failure was run for them); the acceptance criterion wording is limited to the picker spec, as written, and the other two are replacements of stubs that could not fail at all. (3) `createAdminApi` now disposes its bootstrap context in a `finally`.
- Notes kept: the real site-settings PATCH is seen by no e2e test (TTW-211); the inventory spec assumes the seeded variant has an inventory row (true for the seed); `getByText(zone.name, { exact: true })` in the picker passed in the recorded runs.

## Verification evidence

Environment: database `tamiym_workshop_test_209` (migrated, `seed:e2e` applied), API on port 3101, web/app/admin built with `NEXT_PUBLIC_API_URL=http://localhost:3101/v1`, `PLAYWRIGHT_API_URL=http://localhost:3101`.

**Seed foreign key (out of scope, not fixed).** `pnpm --filter api seed:e2e` on the shared database `tamiym_workshop_test` fails: `Foreign key constraint violated on the constraint: inventory_movements_variantId_fkey` (P2003) in `clearFixtureData` (`prisma.productVariant.deleteMany()`), because movements remain from earlier runs. On a fresh database the seed passes. A separate ticket is proposed ("seed:e2e must clear inventory movements before deleting variants").

**Fails for the right reason, then passes** (`pnpm exec playwright test shipping-zone-area-picker --project=setup --project=chromium-admin`):

- API drift: `listStates` temporarily stripped `isActive` (reverted) → both picker tests fail (`getByRole('option', { name: 'Lagos', exact: true })` not found).
- Screen regression: the admin picker temporarily stopped disabling/marking states (reverted, admin rebuilt) → the state test fails on `getByRole('option', { name: 'E2E Dormant State (deactivated)' })` not found.
- Unchanged code → 5 passed (3 setup + 2 picker).

**Isolation and repeat:** `--repeat-each=2`, run twice in a row → `7 passed` and `7 passed`; then `select count(*) from shipping_zones where name like 'TTW-209%'` → 0 (cleanup works).

**Converted and kept specs together** (picker, reconciliation, inventory, refund, payment-initiation, catalog-settings; `--workers=3`): `46 passed`. A later run of picker + reconciliation + inventory with `--workers=1`: `7 passed (39.0s)`.

**Not clean, said plainly.** A second full run was spoiled by the Mac going to sleep (`ERR_NETWORK_IO_SUSPENDED`, durations of hours), and several further attempts timed out starting the web servers (`Timed out waiting 180000ms from config.webServer`) or force-killed workers while the host load average was above 150. These are host problems, not test assertions; the runs above are the green ones. A final two-in-a-row of the full set was not obtained in one session.

**Gates**

- `pnpm playwright:validate` → `Playwright manifest validation passed.`
- `pnpm docs:validate` → `Documentation validation passed.`
- `pnpm --filter api typecheck` (`tsc --noEmit`) → no error.
- `eslint` on `apps/api/scripts/seed-e2e-dummy-data.ts` → no output. Root ESLint ignores `tests/e2e`; Prettier check on `tests/e2e` and `apps/api/scripts` passes.
- `tsc` on the new test files reports only missing Node type declarations (the same for untouched fixtures), no type error in the new code.
- Web/app/admin typecheck and lint were not run: no app source changed (the temporary regression edit was reverted).

## Completion summary

- Audit: 18 `route(` calls in 9 files classified (design review). Replaced: the zone picker spec, the inventory contract spec, the reconciliation contract spec. Kept with a written reason: Paystack-boundary stubs (refund, payment initiation, checkout specs) and three site-settings stubs.
- New: `tests/e2e/fixtures/admin-api.ts` (real admin API client, zone create/delete/list); seed rows for a deactivated state, a deactivated LGA and one resolved reconciliation finding.
- Deviations: the old inventory test's admin half is dropped (no admin read route; writing would change shared stock). The refund and payment-initiation "API" tests only exercise their stub; they are kept unchanged, with a comment.
- Follow-ups to open (numbers 210+ after checking `git ls-tree` on all branches): (1) `seed:e2e` fails on leftover `inventory_movements`; (2) site-settings writes cannot be tested for real in parallel because the row is global.
- Status stays "In review" until the independent review is done.
