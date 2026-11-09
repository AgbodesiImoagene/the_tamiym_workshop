# TTW-087 — Offer Nigerian states and LGAs as lists at checkout

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High\
**Blocked by:** TTW-086, TTW-185 (server stops keeping a stale state code on address edits)\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 4.9, State typed as free text at checkout** (High, P0, 4–6 h, status "To do"): The 37 states and 774 LGAs are in the database but not offered. A typo can break the shipping calculation (see 5.6).

## Proposal

- Expose the states and LGAs to customers. The `geo` routes in `admin-shipping.controller.ts` are admin-only, so check first whether `addresses.controller.ts` already covers it.
- Replace the free-text state field with a state list and a dependent LGA list on the address form.
- Apply it to the standard checkout and the fundraiser checkout.

## Invariants

- A saved address always carries a state known to the shipping rules.
- Existing saved addresses still load, and ask for a correction if their state is unknown.

## Implementation plan

1. Start `codex/ttw-087-offer-states-and-lgas-at-checkout` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Component: list loading, empty, error and retry states.
- Integration: an unknown state code is refused.
- Playwright: choose a state and LGA, then get a quote.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/app/app/dashboard/checkout/page.tsx:253` — row 4.9
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] A customer cannot type a misspelled state at checkout.
- [x] Lists work on desktop and mobile.
- [x] Every visible control works and is in English. The journey was played end to end, and Playwright coverage is updated.
- [ ] Theme tokens only: not met. The new selects and error lines reuse the colour classes of the neighbouring fields (`text-red-700`, `border-black/15`, `bg-white`), which the existing checkout pages already hard-code. Moving both pages to tokens is a separate clean-up.
- [x] Swagger, shared contracts, migrations and docs are updated where applicable.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

**Finding confirmed on `main` (43cd1df).** Both checkouts (`apps/app/app/dashboard/checkout/page.tsx`, `apps/web/app/fundraiser/[slug]/checkout/page.tsx`) use a free-text `state` input. `addresses.controller.ts` exposes no geo route; `geo/states` and `geo/states/:code/lgas` exist only under `admin-shipping.controller.ts` (admin-only), and `listLgas` returns `[]` for an unknown code. `AddressNormalizationService.resolveState` returns `null` for an unknown state and the address is still saved with the typed text (TTW-086 only refuses later, at quote time). So the database accepts a misspelled Nigerian state today.

**Design.**

1. New read-only routes for any signed-in user, in a new `GeoController` (`apps/api/src/geo/`), reusing `ShippingAdminService.listStates/listLgas`: `GET /v1/geo/states` returns `[{ code, name }]`; `GET /v1/geo/states/:code/lgas` returns `[{ id, name }]` and 404 `GEO_STATE_NOT_FOUND` for an unknown code. Explicit response DTOs, never raw Prisma rows. No admin route is opened.
2. Server enforcement (invariant 1): for a Nigerian address, `AddressNormalizationService` refuses a state that matches no `GeoState` with 400 `ADDRESS_STATE_UNKNOWN`, on create, and on update only when the request changes the state (`isStateChange`). An edit that leaves an already-saved unknown state untouched still works, so existing addresses load and can be corrected (invariant 2). Non-Nigerian addresses are unchanged.
3. Front ends send `state` (the list name) and `stateCode`, plus `lgaId` when an LGA is chosen. A saved address whose state is not in the list shows an inline "Choose a state from the list" error and blocks the quote until corrected.
4. Both checkouts get a state `<select>` and a dependent LGA `<select>` with loading, empty, error and retry states. Choosing another state clears the LGA.

**Risks.** Other callers that post free-text states (seeds, e2e fixtures, settings forms) may now be refused: run the whole address and order e2e suites. The LGA-vs-state consistency gap stays in TTW-186. Security: the new routes are read-only, authenticated, return public reference data, and take one path parameter validated against the table.

## Implementation reviews

One independent review (`code-review`, high effort) of the working-tree diff before the commit. 10 findings; 4 fixed, 6 not applied:

- Fixed: `GeoController` queried Prisma directly (now a `GeoService`); an update moving a non-Nigerian address to Nigeria skipped the state check (test added); Swagger did not name `ADDRESS_STATE_UNKNOWN` (400 descriptions and contracts updated); app queries refetched on every mount (5-minute `staleTime`).
- Not applied, to follow up: (1) a customer cannot clear a saved LGA, because an empty `lgaId` is omitted and the server keeps the saved one (needs a server rule; close to TTW-186); (2) the server still accepts a deactivated state that the list hides (`resolveState` ignores `isActive`); (3) a saved `lgaId` missing from the loaded list is still sent; (4) state matching is written twice (app inline, web helper); (5) the web page loads the lists by hand, as the web app has no data library or component test setup; (6) the Settings address form (`apps/app/components/customer-settings-form.tsx`) still has a free-text state, and a typo there now gets the 400.

## Verification evidence

Run in the worktree `.claude/worktrees/ttw-087`, on the code that is committed.

- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm openapi:check`, `pnpm docs:validate`, `pnpm playwright:validate`: exit 0 (lint: 0 errors, existing warnings only).
- `pnpm test`: api 1354 (148 suites), app 52, web 51 passed.
- `pnpm --filter api test:e2e`: 29 suites, 163 tests passed, including the new `geo-reference.e2e-spec.ts` (6 tests) and the rewritten `address-edit-state.e2e-spec.ts`.
- `pnpm coverage:ratchet` passed; `pnpm coverage:diff`: 8/8 changed lines covered.
- Playwright (production build, dedicated database): `checkout-shipping-coverage` (choose a state and LGA, refused state, then quote), `checkout-idempotency`, and the new fundraiser list test on `chromium-web` and `mobile-chromium-web`: 13 passed with 2 workers. An earlier run with 4 workers timed out because the machine load was above 200; the same specs passed after reducing workers.
- Tests written before the code and seen failing for the right reason: the 3 unit refusals, the 5 failing geo e2e tests, and the 7 app checkout tests. The web helper tests (`geo-selection.test.ts`) were written together with the helper, so they were not seen failing first. The country-change test was seen failing before its fix.

Not verified: the Settings form (out of scope); a run of the whole Playwright comprehensive suite (only the specs touching checkout were played); Firefox and WebKit projects.

## Completion summary

**What changed.**

- API: new read-only `GET /v1/geo/states` and `GET /v1/geo/states/:code/lgas` for signed-in users (`apps/api/src/geo/`), with explicit DTOs and a 404 `GEO_STATE_NOT_FOUND`. `AddressNormalizationService` now refuses a Nigerian address whose state is unknown with 400 `ADDRESS_STATE_UNKNOWN`: on create, on an edit that changes the state, and on an edit that moves an address to Nigeria. An edit that leaves an already-saved unknown state untouched still works, so old addresses load and can be corrected.
- Standard checkout (`apps/app`) and fundraiser checkout (`apps/web`): the State text field is now a list, followed by a dependent LGA list (optional), with loading, error and retry states. A saved address whose state is not in the list shows "Choose a state from the list." and blocks the quote. A saved state text without a code is matched to the list by name.
- Contracts regenerated (`openapi.json`, `openapi.generated.ts`). Runbook `docs/runbooks/shipping-zone-coverage.md` updated.

**Deviations from the plan.**

- The owner asked for the server to refuse unknown states. This deliberately replaces the TTW-185 behaviour (an edit to an unknown state was saved with its codes dropped and refused at the quote). Four TTW-185 unit tests in `address-normalization.service.spec.ts` and the first test of `address-edit-state.e2e-spec.ts` were rewritten to expect the 400; their old expectations no longer describe the product.
- Two existing tests were adapted to the new control: the app checkout test "quotes again once the customer corrects the address" now picks another state from the list instead of typing one, and `checkout-shipping-coverage.spec.ts` selects the state and LGA instead of typing.
- The web fundraiser page has no component test (no jsdom or Testing Library there). The selection logic is in pure helpers with Jest tests; the page is covered by Playwright.
- The new routes call a small `GeoService` rather than `ShippingAdminService`, because the admin service returns full rows.

**Remaining.** The six follow-ups listed under "Implementation reviews". Not merged or pushed, as requested. The ROADMAP checkbox is left unchecked until the merge.
