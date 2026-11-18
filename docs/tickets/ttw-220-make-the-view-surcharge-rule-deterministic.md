# TTW-220 — Make the print-side surcharge rule deterministic when a variant row and a product row both exist

**Epic:** 8 — Client review delivery\
**Status:** Implemented, not committed (awaiting the user)\
**Risk:** High\
**Blocked by:** None (product decision recorded below, 2026-11-15)\
**Blocks:** None

## Background

Found by the independent review of TTW-094 (finding 2).

`computeViewSurchargeForDesign` in `apps/api/src/pricing/pricing.service.ts` reads a view's surcharge with `OR: [{ variantId: null }, { variantId }]`, `take: 1` and no `orderBy`. When a product-level row (`variantId = NULL`) and a variant-level row both exist for the same product, view and currency, Postgres may return either, so the quote for that variant can change between requests.

Before TTW-094 nothing wrote either kind of row. TTW-094 adds admin routes for the product-level row only, so an admin can now create the product row next to an existing variant row (for example by seed data or a database edit). The test `does not touch a variant-level override` in `apps/api/test/admin-product-surcharges.e2e-spec.ts` creates exactly that state and checks the rows, not the quote.

`docs/pricing-strategy.md` already says the rule is undefined in that case.

## Decision

2026-11-15, the user approved the recommendation: **the more specific row wins**. When a variant-level row and a product-level row both exist for the same product, view and currency, the variant row sets the surcharge for that variant and the product row is ignored for it. Variants without their own row use the product row. The alternative (forbid the two rows existing together) was declined, so writes are not refused.

## Proposal

Decide the rule, then make pricing deterministic.

Recommendation (needs the user's approval before any code, per `AGENTS.md` "Client decisions"): **the more specific row wins**, so the variant row replaces the product row for that variant. It matches how variant prices override product prices elsewhere in the catalogue. The alternative is to forbid the two rows existing together and reject the write with a clear error.

Once decided:

- Add an explicit `orderBy` (or an explicit two-step lookup) in `computeViewSurchargeForDesign` so the winner is always the same.
- Check the other readers of view pricing (`campaign-line-price`, floor computation near line 945 of `pricing.service.ts`) use the same rule.
- Show the admin which rows are in force: either a note on the print-surcharge row when a variant override exists, or a block that prevents the conflict, depending on the decision.
- Update `docs/pricing-strategy.md` (replace "rule undefined" with the decided rule).

## Invariants

- A product with only product-level rows, or only variant-level rows, quotes exactly the same price as before.
- Orders already created never change.
- Money stays decimal, never float.

## Implementation plan

1. Get the decision above. Stop and ask if it is not recorded here.
2. Branch: `claude/ttw-220-make-the-view-surcharge-rule-deterministic-3f1d0d`, in its own worktree, started from the TTW-094 branch (commit `f384b90`, not yet on `main`) instead of `main`, because this ticket and the TTW-094 code do not exist on `main` yet. Merge order: TTW-094 first, then this ticket.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing: both rows present, repeated quotes (and reversed insert order) must give the same price.
5. Implement, regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed, update docs.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: the winner among the product row and the variant row, for each currency.
- Integration (real Postgres): both rows inserted in both orders, 20 repeated quotes, all identical; existing single-row cases unchanged.
- Playwright: only if the admin screen changes.
- Logs, metrics, traces, and alerts: nothing new.

## References

- TTW-094 independent review, finding 2.
- `docs/tickets/ttw-094-let-admins-enter-size-and-print-surcharges.md` — Design review, fact 3.
- `docs/pricing-strategy.md` — "Product view pricing".
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.

## Acceptance criteria

- [x] The decided rule is recorded in this ticket and in `docs/pricing-strategy.md`.
- [x] A quote never depends on row order: both rows present give one stable price.
- [x] Single-row cases quote the same as before.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Admin screens to edit variant-level surcharges: a separate ticket if the client asks for them.
- Auditing the existing catalogue writes.

## Design review

Recorded 2026-11-15, before any code (risk: High).

Facts checked in the code:

1. `computeViewSurchargeForDesign` (`pricing.service.ts`) is the only reader of `ProductViewPricing` that feeds a price. Quotes (standard and campaign) call it for the unit surcharge; `getMinCampaignProductPrice` (the floor) calls it per variant. `campaign-line-price` does not read view pricing. `variant.productViewPricings` (included in the quote's variant query) is loaded but never read, so it cannot change a price.
2. Rows that can match one view, one product, one currency, for a given variant: at most one product-level row (partial unique index from TTW-094) and at most one row for that exact variant (the Prisma unique index covers non-null `variantId`). So at most two rows, never more.
3. The first view of a design is free and the other views are charged. That part (ordering by `DesignView.id`) is untouched.

Design:

- Keep one query, drop `take: 1`, so both rows come back, and choose in code: the row whose `variantId` equals the variant, otherwise the row with `variantId = NULL`, otherwise nothing. The choice never depends on row order, on insert order, or on what Postgres returns first. The choice is two `find` calls inline in `computeViewSurchargeForDesign`; the unit tests reach it through that method with a mocked Prisma, and the e2e tests through real Postgres.
- No schema change, no migration, no endpoint or DTO change, so no `openapi:generate`.
- Money stays decimal: the amount is still read from `Decimal` and rounded with `roundToMinor` exactly as before.

Invariant check:

- Only product rows: the selection returns that row, same price as before.
- Only variant rows: the selection returns that row, same price as before.
- Both rows: the variant row wins (user decision above). This is the only price that changes, and today it is undefined.
- Orders already created store their own price snapshot and are not recomputed.

Risks and answers:

- A variant row of `0` must still win over a product row of a positive amount (an admin may want a free extra view for one size). The selection tests the row exists, not that its amount is truthy. Covered by a test.
- Another currency's row must never be picked: the query keeps the `currency` filter.
- Other variants of the same product must not get this variant's row: the selection compares `variantId` exactly. Covered by a test.
- Admin screen: the admin only writes product-level rows and does not list variant rows, so no screen change and no Playwright test. A variant row that hides the product row is therefore invisible in the admin; this is recorded as a follow-up, not fixed here (editing variant rows is out of scope).

Security, concurrency: no new input, no new write path, read-only change. Nothing to add.

## Implementation reviews

2026-11-15, independent reviewer (fresh subagent, read-only), charter: correctness against the decision and invariants, other readers of the table, test quality, docs accuracy. **Verdict: PASS**, no blocking finding.

Minor findings, all fixed:

- The design review said the choice lives in "a small pure function"; the code uses two inline `find` calls. Sentence corrected.
- E2E header comment tidied.
- Ticket status and evidence were still "Pending". Filled in below.

Noted, not changed: the unit tests mock Prisma, so the `OR` and currency filter are covered only by the e2e; in the e2e only the "product row inserted first" case fails on the old code (Postgres returned the variant row first in the other order), so it is the one that proves the regression.

## Verification evidence

Own database `tamiym_workshop_test_ttw220`, `REDIS_DB=11`; the shared test database was not used.

Tests first, shown failing on the unchanged code for the right reason (the first row returned wins):

- Unit, `npx jest src/pricing/pricing.service.spec.ts -t TTW-220`: 5 failed, 2 passed (failed: product row first, 20 repeated reads, variant row of 0, product row for a variant without own row, never another variant row).
- E2E, `view-surcharge-precedence.e2e-spec.ts`: 3 failed, 2 passed (failed: product row inserted first, variant without own row, variant row of 0; received `1000` where `400` or `0` was expected).

After the change:

- `npx jest src/pricing src/products/product-surcharges`: 4 suites, 58 tests passed.
- E2E (real Postgres), `pricing-quote`, `campaign-authoring`, `bulk-pricing-quantity-limits`, `view-surcharge-precedence`, `admin-product-surcharges`: 5 suites, 46 tests passed.
- `pnpm --filter api test`: 153 suites, 1510 tests passed.
- `tsc --noEmit` (api): no output. `eslint` on the 3 touched files: 0 errors, 10 warnings, all already present (`currency as any`).
- `pnpm format:check`: all files formatted. `pnpm docs:validate`: passed.
- `pnpm openapi:check`: not run, no endpoint or DTO changed.
- Not run: the full API e2e suite, the web/admin unit suites (no front-end change), Playwright (no screen change).

## Completion summary

When a product-level row and a variant-level row both exist for the same product, view and currency, the quote now always uses the variant's own row (even at `0`); variants without one use the product row. One change in `computeViewSurchargeForDesign`; no schema, endpoint or screen change. `docs/pricing-strategy.md` states the rule.

Follow-ups, not done here:

- The admin only shows and edits the product-level row, so a variant row that overrides it is invisible there. Editing variant rows needs its own ticket if the client asks.
- `variant.productViewPricings` is loaded in the quote's variant query and never read; it could be removed.
- Merge order: TTW-094 first, then this ticket (this branch starts from the TTW-094 commit).
