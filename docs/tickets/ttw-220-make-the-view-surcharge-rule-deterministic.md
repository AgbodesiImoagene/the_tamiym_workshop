# TTW-220 — Make the print-side surcharge rule deterministic when a variant row and a product row both exist

**Epic:** 8 — Client review delivery\
**Status:** Not started\
**Risk:** High\
**Blocked by:** Product decision (see Proposal): which row wins, the variant row or the product row\
**Blocks:** None

## Background

Found by the independent review of TTW-094 (finding 2).

`computeViewSurchargeForDesign` in `apps/api/src/pricing/pricing.service.ts` reads a view's surcharge with `OR: [{ variantId: null }, { variantId }]`, `take: 1` and no `orderBy`. When a product-level row (`variantId = NULL`) and a variant-level row both exist for the same product, view and currency, Postgres may return either, so the quote for that variant can change between requests.

Before TTW-094 nothing wrote either kind of row. TTW-094 adds admin routes for the product-level row only, so an admin can now create the product row next to an existing variant row (for example by seed data or a database edit). The test `does not touch a variant-level override` in `apps/api/test/admin-product-surcharges.e2e-spec.ts` creates exactly that state and checks the rows, not the quote.

`docs/pricing-strategy.md` already says the rule is undefined in that case.

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
2. Start `codex/ttw-220-make-the-view-surcharge-rule-deterministic` from current `main`, in its own worktree.
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

- [ ] The decided rule is recorded in this ticket and in `docs/pricing-strategy.md`.
- [ ] A quote never depends on row order: both rows present give one stable price.
- [ ] Single-row cases quote the same as before.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Admin screens to edit variant-level surcharges: a separate ticket if the client asks for them.
- Auditing the existing catalogue writes.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
