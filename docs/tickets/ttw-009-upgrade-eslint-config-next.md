# TTW-009 — Upgrade eslint-config-next to match next 16.4

**Epic:** 0 — Trustworthy delivery system  
**Status:** Complete  
**Risk:** Standard  
**Blocked by:** None (TTW-007 committed as `6fbbed6`)  
**Blocks:** None

## Background

TTW-007 upgraded `next` from 16.3.1 to 16.4.4 in `apps/web`, `apps/app` and `apps/admin` to clear production advisories, but deliberately left `eslint-config-next` at 16.3.1 (dev-only, no advisory). The two packages are released together and should stay on the same version.

`eslint-config-next` 16.4.4 pulls `eslint-plugin-react-hooks` 7.1.x, whose React Compiler rules report errors in 7 existing files (found during TTW-007):

- `react-hooks/set-state-in-effect` — state set synchronously inside an effect:
  - `apps/web/app/fundraiser/[slug]/checkout/page.tsx:113` — `hydrateCart()` (which calls `setCart`) and the empty-cart `setError` run synchronously in the campaign-match effect.
  - `apps/web/app/verify-email/page.tsx:20` — `setToken(tokenFromQuery)` re-syncs the input when the query changes.
  - `apps/admin/app/admin/catalog/products/[id]/page.tsx:80` — five `setView*` calls re-sync the view form when the `view` prop changes.
  - `apps/admin/components/workshop/CreateProductViewForm.tsx:49,53` — `setSortOrder(nextSort)` and `setIsDefault(false)` re-sync from `views`.
  - `apps/app/app/dashboard/checkout/page.tsx:78,108` — `setQuote(null)` on a new cart revision, and `setSavedAddressId`/`setForm` when the saved addresses load.
- `apps/app/components/workshop/WorkshopEditor.tsx:86` — `handleSave` is used (inside `scheduleAutoSave`) before it is declared; `:139` — the manual memoization of `handleSave` cannot be preserved.

The WorkshopEditor errors point at a real defect, not only a style issue: `scheduleAutoSave` is memoised on `[designId]` only (with an `exhaustive-deps` disable on line 87), so the timer calls the `handleSave` captured in the render where `designId` last changed. On the edit route `designId` is set from mount, so auto-save sends the design data and name **as loaded**, not the user's latest edits; after an explicit save, a later auto-save can overwrite it with the older data. To be confirmed by a failing test before the fix.

## Proposal

1. Pin `eslint-config-next` to `16.4.4` (exact) in the three apps' devDependencies and widen `packages/config` to `^16.4.4`; let pnpm write the lockfile (`pnpm install`).
2. Fix each reported site with the idiomatic React pattern, without lint disables:
   - **Re-sync state from a changed prop/query** (verify-email, admin product view form, `CreateProductViewForm`, app checkout new revision, app checkout saved address): "adjust state during render" — keep the previous input in state and update during render when it changes (React docs, _You might not need an effect_). Same visible behaviour, one fewer render.
   - **App checkout `savedAddressRef`**: it is written in the same place as the address state; writing a ref during render is itself a compiler error, so it becomes state (it is only read at click time in `handleReviewQuote`, after commit).
   - **Web fundraiser checkout**: read the cart from `localStorage` in the async continuation of the auth bootstrap (after `getMe` resolves and the email is verified), which is when it is first needed, instead of synchronously in the second effect; the campaign-match effect then depends on the loaded campaign id.
   - **WorkshopEditor**: keep the latest `handleSave` in a ref updated in an effect, and have the auto-save timer call `ref.current(false)`. This removes the use-before-declaration, lets `handleSave` be memoised normally, and removes the existing `exhaustive-deps` disable. **Behaviour change (bug fix):** auto-save then sends the latest design. See the decision below.

Rejected:

- `eslint-disable` comments or turning the rules off in `packages/config/eslint.config.js` (hides the problems the plugin found; the task excludes it).
- Keying components to force a remount (admin view form): a remount would also reset local UI state such as the print-area success message after a save.
- Moving a synchronous `setState` into a `Promise.resolve().then(...)` only to escape the rule.

### Decision for the user

The WorkshopEditor fix cannot keep the current auto-save behaviour without a lint disable. Proposed: accept the bug fix (auto-save sends the latest design), proven by a unit test that fails before the change. Alternative: split the bug fix into its own ticket and, in the meantime, keep the old behaviour, which would need a lint disable — rejected by this ticket's constraints.

## Invariants

- No visible behaviour change on the affected screens, except the WorkshopEditor auto-save fix if approved.
- No new `eslint-disable`; the existing one in `WorkshopEditor.tsx:87` is removed.
- `eslint-config-next` and `next` are on the same version in each app.
- Lockfile changes come from pnpm only.

## Implementation plan

1. Start `codex/ttw-009-upgrade-eslint-config-next` from the commit that contains TTW-007.
2. Freeze current behaviour with tests where none exist: verify-email query re-sync, `CreateProductViewForm` sort/default re-sync, app checkout quote reset and address prefill (extend `apps/app/__tests__/checkout/checkout-page.test.tsx`), and a WorkshopEditor auto-save test that fails today (sends stale data).
3. Upgrade `eslint-config-next` (4 `package.json`) and run `pnpm install`; record the lint errors.
4. Fix the sites one file at a time, running the related tests after each.
5. Run all gates and the affected browser journeys; record evidence; independent implementation review.

## Test and observability plan

- Unit/component: new/extended tests above; full `pnpm test`.
- Integration/e2e: `pnpm build`; `pnpm test:e2e:smoke`; affected journeys: web fundraiser checkout (TTW-032 flow), web verify-email (`tests/e2e/web/auth-pages.comprehensive.spec.ts`), app checkout (`tests/e2e/app/checkout-idempotency.spec.ts`, `products-cart.comprehensive.spec.ts`), Design Workshop (`tests/e2e/app/design-workshop.comprehensive.spec.ts`), admin product view (`tests/e2e/admin/catalog-settings.comprehensive.spec.ts` or a manual browser pass if it does not cover views).
- Failure, retry, and concurrency: app checkout address change → new idempotency key path (TTW-037) stays covered by the existing tests.
- Logs, metrics, traces, and alerts: none (frontend refactor).

## References

- `apps/web/package.json`, `apps/app/package.json`, `apps/admin/package.json` — `eslint-config-next` `16.3.1`; `packages/config/package.json` — `^16.1.4`.
- `docs/tickets/ttw-007-upgrade-vulnerable-production-dependencies.md` — completion summary lists this follow-up.
- The 7 files and lines listed in Background.

## Acceptance criteria

- [x] `eslint-config-next` is `16.4.4` in web/app/admin and `^16.4.4` in `packages/config`; lockfile written by pnpm.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` pass with no new `eslint-disable`.
- [x] Playwright smoke and the affected journeys pass.
- [x] WorkshopEditor auto-save sends the latest design (if the decision above is approved), proven by a test that failed before the fix.

## Out of scope

- Other `eslint-plugin-react-hooks` 7.1 warnings that are not errors.
- Upgrading `next`/`react` (done in TTW-007).
- The `packages/types/src/enums.generated.ts` drift noted in TTW-007 (handled separately).

## Design review

Approved by the user on 2026-11-03, including the WorkshopEditor auto-save fix (fixed in this ticket, proven by a test that fails first). Blast radius: frontend only (3 apps + shared ESLint config); no API, schema or contract change. Duplication check: no other ticket covers the lint upgrade; TTW-007 lists it as its follow-up. Numbered TTW-009 because TTW-008 is the shared-enums regeneration ticket (`codex/ttw-008-regenerate-shared-enums`).

## Implementation reviews

### Review 1 — 2026-11-03 (independent subagent, read-only)

Verdicts: correctness PASS, behaviour preservation PASS, scope PASS, **tests FAIL**.

- Should-fix 1: the fundraiser checkout (most restructured file) had no automated test. → Added `tests/e2e/web/fundraiser-checkout.comprehensive.spec.ts` (matching cart, campaign mismatch + discard, empty cart).
- Should-fix 2: the verify-email e2e test never exercised the re-sync block; `CreateProductViewForm` / admin view form had no test. → The e2e test now changes the query with `history.pushState` and expects the new token. Admin has no component-test harness (no Jest in `apps/admin`) and no Playwright coverage of product views: added `tests/e2e/admin/product-views.comprehensive.spec.ts` (on a new product, so the seed stays untouched) instead of the planned manual pass.
- Nit 3: an auto-save that fires while a manual save is running is skipped (`isSaving` guard) and not rescheduled until the next edit. Previously it sent stale data in parallel. Accepted; noted as follow-up.
- Nit 4: discarding the fundraiser cart now cancels in-flight fundraiser/address requests. No visible effect (the page navigates away).

### Review 2 — 2026-11-04 (independent subagent, read-only)

Verdicts: correctness PASS, scope PASS, tests PASS. **Overall PASS**; no must-fix or should-fix.

- Nit: `tests/e2e/admin/product-views.comprehensive.spec.ts` finds the sort-order field by position (the inputs have no label link). Kept; the form has no accessible label to target.
- Nit: `fundraiser-checkout.comprehensive.spec.ts` did not dispose the API context if the fundraiser lookup failed. → Fixed with `try/finally`.
- Nit: the test plan still mentioned a manual pass for admin views. → Covered by the deviation below; completion summary updated.

## Deviations from plan

- Implementation: the app checkout `savedAddressRef` became state `savedAddressJson`; the "adjust during render" state for addresses starts `undefined` so addresses already cached on mount still prefill the form (new test `prefills the saved address when the addresses are already cached on mount`, which passes on the original code and fails on the first draft that seeded the state with the cached data).
- Fundraiser checkout: the cart is read right after `setUser(me)`, before the email-verified redirect, so the old order of effects is kept.
- Tests for web and admin components are Playwright (web has a node-only Jest, admin has none), including a new admin spec for product views.
- `seed:e2e` cannot be re-run once e2e orders reference fixture variants (`order_items_variantId_fkey`); the local test DB `tamiym_workshop_test` was reset with `prisma migrate reset --force` (user consent 2026-11-04) and re-seeded. Pre-existing harness defect, out of scope.
- Admin MFA login is rate limited (`429 Too many requests` on the MFA challenge) when `setup` runs again within minutes; the admin re-runs used the saved session with `--no-deps`. Pre-existing harness limit, out of scope.

## Verification evidence

- Lint before fixes (eslint-config-next 16.4.4): exactly the 7 expected errors (web 2, app 4, admin 2 incl. `CreateProductViewForm.tsx:49,53`).
- Failing test first: `apps/app/__tests__/workshop/WorkshopEditor.test.tsx` › "saves the latest layers and name after the inactivity delay" failed on the original code (`Expected: "Renamed"`, `Received: "Saved name"`), passes after the fix.
- `pnpm lint` → 6/6 tasks, 0 errors (warnings only: `no-img-element`, `no-unused-vars`, `no-unsafe-*`; none from `react-hooks`).
- `pnpm typecheck` → 6/6 tasks.
- `pnpm test` → web 40, app 42, api 1207 tests passed.
- `pnpm build` → 5/5 tasks (it regenerates `packages/types/src/enums.generated.ts`; restored, owned by TTW-008).
- No new `eslint-disable`; the `react-hooks/exhaustive-deps` disable in `WorkshopEditor.tsx` is removed.
- Test DB: `prisma migrate reset --force` on `tamiym_workshop_test` (all migrations applied) then `pnpm --filter api seed:e2e` → "Seeded deterministic e2e dummy data."
- `pnpm test:e2e:smoke` (production builds, servers started by Playwright) → `39 passed (1.1m)`.
- Affected journeys: `npx playwright test tests/e2e/web/fundraiser-checkout.comprehensive.spec.ts tests/e2e/web/auth-pages.comprehensive.spec.ts tests/e2e/app/checkout-idempotency.spec.ts tests/e2e/app/products-cart.comprehensive.spec.ts tests/e2e/app/design-workshop.comprehensive.spec.ts tests/e2e/admin/catalog-settings.comprehensive.spec.ts --project=setup --project=chromium-web --project=chromium-app --project=chromium-admin` → `43 passed (1.0m)`, including the 3 fundraiser checkout tests and "verify-email prefills the token from the link and keeps manual edits" on the 3 viewports.
- Admin product views: `npx playwright test tests/e2e/admin --project=chromium-admin --no-deps` → `38 passed (41.2s)`. The new test was checked against the real code paths: with the `CreateProductViewForm` re-sync disabled it fails (`Expected: "2"`, `Received: "1"`); with only the view-settings re-sync disabled it fails (`Expected: "back_panel"`, `Received: "Back Panel"`). Code restored and admin rebuilt before the final run.
- `prettier --check` on the three e2e specs → clean. The e2e specs are outside the ESLint configuration (file ignored), as for the existing specs.

## Follow-ups (not in this ticket)

- `seed:e2e` is not idempotent once e2e orders exist (FK `order_items_variantId_fkey`).
- `WorkshopEditor` `canvasRef` is never attached to the Fabric canvas, so thumbnails are probably never captured.
- An auto-save that fires during a manual save is skipped until the next edit (Review 1, nit 3).

## Completion summary

All gates and browser journeys green locally, Review 2 PASS. Committed as `17db25f`, merged to `main` with TTW-007 (`335e4ee`). CI run [41931373328](https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/41931373328) on `main` `541bad4` is green on all 18 jobs, including Lint, Unit Tests and Playwright Smoke. Nothing left in scope.
