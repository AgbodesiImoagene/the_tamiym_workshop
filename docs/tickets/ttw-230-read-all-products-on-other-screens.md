# TTW-230 — Read the right number of products on the design, product-page and fundraiser screens

**Epic:** 8 — Client review delivery\
**Status:** Complete (journey not played by hand in a browser)\
**Risk:** Standard\
**Blocked by:** None (TTW-093 is on the same branch)\
**Blocks:** None

## Background

Found during the TTW-093 review (finding "other screens still capped at 20 products"). `getDashboardProducts()` called with no argument returns the API default page, 20 products. Three customer screens still use it that way:

- `apps/app/app/dashboard/fundraiser/[id]/page.tsx` — the "Select product" list of the campaign form. With more than 20 products, the rest cannot be chosen for a campaign.
- `apps/app/app/dashboard/products/[id]/page.tsx` — "Related products" are taken from those 20 and filtered by category on the client. A product whose category mates are beyond the first 20 shows no related products.
- `apps/app/app/dashboard/design/page.tsx` — "Start from a product" downloads 20 products and shows only the first 6 (`slice(0, 6)`).

Confirm each point against the code before designing: the code may have moved.

## Proposal

- Fundraiser: add `getAllDashboardProducts()` in `apps/app/lib/products.ts`. It reads `GET /v1/products` page by page (`limit` 100, the API maximum) until a page is short, with a hard page bound, and the select lists every product.
- Product page: ask the API for the products of the same category (`categorySlug`, `limit` = related count + 1 to leave room for the current product) once the product is loaded. Keep the client-side category and self filter, so an API that ignores an unknown slug cannot show unrelated products.
- Design screen: keep the six-card teaser (a layout decision, not changed here) and ask the API for six products instead of twenty.
- Rejected: raising the API default limit (changes every caller), and a new "list all" endpoint (no need yet, no API change).

## Invariants

- No API, DTO or OpenAPI change. Behaviour outside these three reads stays unchanged.
- `getDashboardProducts()` with no argument still means one default page.

## Implementation plan

1. Tests first, shown failing: paging helper, related products query, design query size.
2. Implement the helper and the three call sites.
3. Playwright: a product beyond the first 20 can be chosen in the campaign form.
4. Run the gates, record evidence, independent review.

## Test and observability plan

- Unit: `getAllDashboardProducts` stops on a short page, walks several pages, stops at the page bound. Product page asks for its category with the right limit. Design page asks for six products.
- Playwright: the campaign form lists a seeded product beyond the first 20 ("Bulk Item 01").
- Logs, metrics, traces, and alerts: nothing new. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/app/lib/products.ts` — `getDashboardProducts`.
- `docs/tickets/ttw-093-use-real-categories-and-paginate-catalogue.md` — origin, seed with 22 extra products.

## Acceptance criteria

- [ ] The campaign form lists every product, not the first 20.
- [ ] Related products come from the product's own category even when the catalogue has more than 20 products.
- [ ] The design screen asks for the six products it shows.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Real product data on the list cards → TTW-204.
- Showing more than six products on the design screen.
- API sort or filter changes.

## Design review

Confirmed on `main` at 20c8c33 plus TTW-093: the three screens call `getDashboardProducts()` without argument (24 seeded products, so "Bulk Item 01" is beyond the first 20). Blast radius: three read-only screens in `apps/app` and `lib/products.ts`; no API, DTO, migration or OpenAPI change. Duplication check: `getDashboardProducts` already takes `categorySlug`, `limit` and `offset` (TTW-093), so the only new code is the paging loop. Edge cases: a short page ends the read, an exactly full last page costs one extra empty request, a page bound of 50 (5,000 products) prevents an endless loop, any failing page fails the whole read (the select shows no partial list). Product without a category: the related query is not sent and no related block is shown, as before. Risks: the six-card design teaser is unchanged (layout decision). Verdict: proceed.

## Implementation reviews

`/code-review` (medium), one low finding: `getAllDashboardProducts` stops silently at 5,000 products. Accepted: the bound is deliberate, far above the current catalogue, and written in the ticket and the code. No other finding. Also checked: no code invalidates the three changed query keys.

## Verification evidence

Run in `.claude/worktrees/ttw-093`, 2026-11-20, local PostgreSQL 17 with a throwaway database (dropped afterwards), Redis DB 14:

- Tests first: `__tests__/lib/products.test.ts`, `__tests__/products/design-page-products.test.tsx` and the new related-products test failed (`getAllDashboardProducts is not a function`, `Expected: {"limit": 6}`, `Expected: {"categorySlug": "t-shirts", "limit": 5}`) before the change.
- After: `pnpm test` in `apps/app`: 15 suites, 145 tests passed. `pnpm typecheck`, `pnpm lint` in `apps/app`: clean. `pnpm format:check`, `pnpm docs:validate`, `pnpm playwright:validate`: passed.
- Playwright `campaign-authoring.comprehensive.spec.ts`: the new test (creates a draft, opens its editor, finds "Bulk Item 01" in the Product list) passed at the three viewports. A first version of it was skipped because no draft campaign is seeded, so it now creates its own draft.
- `playwright test --project=setup --project=chromium-app --workers=1`: 75 passed, 3 skipped, 0 failed.
- Same projects plus `chromium-web` with the default 4 local workers: 124 passed, 1 failed in each of three runs, always a checkout journey sharing the seeded customer (`checkout-idempotency` twice, `checkout-delivery-instructions` once). Each passes alone and with one worker. Not run on `main`, so whether it predates this branch is unproven; CI uses 2 workers.

Not verified: the journey was not played by hand in a browser, admin, journeys, a11y, visual and other-browser projects were not run, and `main` was not run as a baseline.

CI: CI on the pushed branch `codex/ttw-093-use-real-categories-and-paginate-catalog`, run 44779149860 (commit 5d528b0): every job green, including Unit Tests, Coverage, API Integration and Playwright Smoke. That workflow runs only the `@smoke` Playwright tests; the `@journey` and `@comprehensive` specs added or changed here were run locally only (see above).

## Completion summary

Done: `getAllDashboardProducts()` feeds the campaign Product list; the product page asks the API for same-category products (limit 5, keeps the category and self filter); the design screen asks for the six products it shows. No API change. Deviation from the plan: the Playwright test creates its own draft campaign. Remaining: CI run on the pushed branch, tick the roadmap, and look at the intermittent checkout failure with several workers (suggest a ticket if CI shows it).
