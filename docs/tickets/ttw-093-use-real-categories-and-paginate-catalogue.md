# TTW-093 — Use real categories and paginate the customer catalogue

**Epic:** 8 — Client review delivery\
**Status:** Implemented and verified by Playwright (journey not played by hand in a browser; Figma not compared)\
**Risk:** Standard\
**Blocked by:** TTW-092\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 2.3, Categories hard-coded, list capped at 20 products** (Medium, P1, 4–8 h, status "To do"): Tabs filter by name instead of using categories, with no pagination.

## Proposal

- Drive the tabs from the API categories instead of filtering by name.
- Add pagination through the existing products query.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-093-use-real-categories-and-paginate-catalog` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Component: tabs from API data, empty category, next and previous page.
- Playwright: more than 20 seeded products stay reachable.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/app/app/dashboard/products/page.tsx:15` — row 2.3
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] All products are reachable, and a new category appears without a code change.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Confirmed against `main` at 20c8c33 (TTW-092 is complete, so the blocker is cleared): `apps/app/app/dashboard/products/page.tsx` hard-codes `categoryTabs` and maps a product to a tab by fuzzy name matching (`getCategoryLabel`); `getDashboardProducts` calls `/products` with no parameter, so the API default limit of 20 caps the list.

Design (no API change):

- Tabs: "All" plus the categories from `GET /v1/categories` (already public). The tab value is the category slug, so a new category appears without a code change.
- Pagination: `GET /v1/products?categorySlug&limit&offset` already exists (max limit 100) but returns no total. The page asks for `pageSize + 1` products (page size 12) and treats the extra item as "there is a next page". No DTO or OpenAPI change.
- Changing category resets to page 1. Previous and Next are disabled at the bounds. An empty category shows an explicit empty message, not the "Preview" placeholder cards (those stay only for a catalogue with no published product at all).
- `getDashboardProducts()` keeps working with no argument, so the design, product-detail and fundraiser screens are unchanged.
- Known limits: offset paging with the default `NEWEST` sort and no tie-breaker can repeat or skip a product if the catalogue changes between two page loads. Acceptable at this stage. Other screens that call `getDashboardProducts()` stay capped at 20: out of scope here (see TTW-204).
- Figma comparison: not done; no visual redesign, existing styles kept.

## Implementation reviews

Independent review (`/code-review`, high effort), 8 findings, none critical. Fixed: empty page > 0 on "All" now shows a message and a "Back to first page" button; the "All" tab value is the sentinel `__all__` so a real category slug cannot collide; `keepPreviousData` keeps the grid while the next page loads; `ProductsService.findAll` now orders by the chosen sort then `id`, so rows with equal `createdAt` or name cannot repeat or vanish across pages (tests: `products.service.spec.ts`, the existing sort-and-pagination test had to change from `{ name: 'asc' }` to `[{ name: 'asc' }, { id: 'asc' }]` because the order is now a list). Not applied, recorded as follow-ups: the pre-existing "Best Seller" badge on the first card now appears on every page; an unknown `categorySlug` makes the API return all products; the design, product-detail and fundraiser screens still read only the first 20 products; the Playwright run was a local one (see below), CI still has to confirm.

## Verification evidence

Run in `.claude/worktrees/ttw-093`, 2026-11-20:

- Tests first: `pnpm --filter app test -- __tests__/products/product-list-page.test.tsx` failed 4 of 6 (no category tabs, no pagination controls) before the change.
- After: `pnpm test` in `apps/app`: 13 suites, 135 tests passed. `pnpm typecheck` and `pnpm lint` in `apps/app`: clean. `pnpm --filter api typecheck`: clean.
- `pnpm format:check` (root): passed. `pnpm docs:validate`, `pnpm playwright:validate`: passed.
- `playwright test tests/e2e/app/products-cart.comprehensive.spec.ts --list` lists the new test at three viewports.

Added after the review (local macOS machine, PostgreSQL 17 on `localhost:5432`, throwaway database `tamiym_workshop_test_ttw093` created, migrated, seeded with `seed:e2e` (24 products) and dropped afterwards, `REDIS_DB=14`):

- `pnpm --filter api test -- src/products`: 130 passed (5 failed before the tie-breaker change). `pnpm --filter api typecheck`: clean, `pnpm --filter api lint`: 0 errors.
- `pnpm build`: exit 0.
- `playwright test tests/e2e/app/products-cart.comprehensive.spec.ts --project=setup --project=chromium-app`: 20 passed, including the new TTW-093 test at the three viewports.
- `playwright test --project=setup --project=chromium-app --project=chromium-web`: 122 passed, 3 skipped, 0 failed (the 22 extra seeded products broke no other spec).
- `pnpm --filter api test:e2e -- test/products.e2e-spec.ts`: 3 passed.

Not verified: the journey was not played by hand in a browser, the Figma was not compared, and the other Playwright projects (admin, journeys, a11y, visual, other browsers) were not run. `docs/tickets/ROADMAP.md` is not ticked: CI on the pushed branch is the final proof.

## Completion summary

Done: tabs come from `GET /v1/categories`; the list pages through `GET /v1/products` with `limit`/`offset` (12 per page, one extra item fetched to detect a next page); empty category message; seed with a 22-product category; unit and Playwright tests. Deviation: three other screens needed `queryFn: () => getDashboardProducts()` because the function now takes an optional argument. Added after review: id tie-breaker in the API sort. Remaining: CI run on the pushed branch, then tick the roadmap.
