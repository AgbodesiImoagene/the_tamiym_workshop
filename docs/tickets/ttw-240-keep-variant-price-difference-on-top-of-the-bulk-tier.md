# TTW-240 — Keep a variant's price difference on top of the bulk tier

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-095\
**Blocks:** TTW-096

## Background

Split from TTW-095 on 2026-11-21. The client review (finding 8.5, sheet "Findings") notes that a product-level bulk tier can replace a dearer variant price.

Today, in `PricingService` (`apps/api/src/pricing/pricing.service.ts`, around lines 502–542), the unit price is `unitBasePrice + optionUpcharge + bulkAdjustment + unitViewSurcharge`, where `bulkAdjustment = tier price − unitBasePrice`. So the tier price **replaces** the base price. `unitBasePrice` is the variant price when the variant has one, otherwise the product price (`resolveBaseUnitPrice`, `VariantPrice` then `ProductPrice`).

Example: product price ₦5,000, tier "20 and more = ₦4,500", black variant priced ₦5,500. At 20 pieces the black variant costs ₦4,500: it loses its ₦500 premium, and nobody decided that.

Confirm this against current `main` before designing: the code may have moved (TTW-095 changes the same function).

## Proposal

Decision by the user, 2026-11-21: **a variant's price difference is treated like a size surcharge. It stays on top of the tier.**

> unit price = tier price + (variant price − product price) + size upcharge + view surcharge

- The tier is worked out for the **product price**. The difference between the variant's own price and the product price is kept on top, positive or negative.
- Example: 20 black T-shirts in M: 4,500 + 500 + 0 = ₦5,000.
- If the variant has **its own tiers** (`BulkPricing` with that `variantId`, already read before product tiers by `getBulkTier`), they win and set the price: the admin chose them explicitly. No difference is added in that case.
- If the product has **no product price** (variant prices only), there is no reference to compute a difference from: the tier applies as it does today.
- The final unit price must stay above zero. Refuse the quote with a stable error code rather than price at zero or less.
- Update `docs/pricing-strategy.md` ("Bulk pricing" and the pipeline steps).

Rejected alternatives:

- Per-variant tier sets for every variant with its own price: more admin entry, and discounts would drift apart between variants.
- Keeping the dearer of the two prices: arbitrary, and it cancels the discount for that variant.

## Invariants

- The same cart always gives the same price.
- The discount a tier gives (product price − tier price) is the same for every variant of the product without its own tiers.
- Standard and campaign pricing keep their existing floors. Campaign pricing does not use bulk tiers and is not changed.
- Money in decimals and minor units, never floats.

## Implementation plan

1. Start `codex/ttw-240-keep-variant-price-difference-on-top-of-the-bulk-tier` from current `main`, in its own worktree, after TTW-095 is merged.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: variant dearer than the product at a tier (premium kept); variant cheaper than the product (negative difference kept); variant with its own tiers (no difference added); product without a product price; result at or below zero refused; size upcharge and view surcharge still added; no tier reached (price unchanged).
- Integration/e2e: a quote and an order for a dearer variant at tier quantity give the same unit price, and the order keeps it frozen.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/pricing/pricing.service.ts:502` — price pipeline and `bulkAdjustment`.
- `apps/api/src/pricing/pricing.service.ts:637` — `getBulkTier` (variant tiers before product tiers).
- `docs/pricing-strategy.md` — "Bulk pricing" and "Product and variant base prices".
- `docs/tickets/ttw-095-compute-bulk-tiers-on-total-product-quantity.md` — the quantity rule this builds on.
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] The example above gets ₦5,000 for 20 black T-shirts in M.
- [ ] A variant with its own tiers is priced by them alone.
- [ ] A quote that would price at zero or less is refused with a stable code.
- [ ] `docs/pricing-strategy.md` states the rule.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Which quantity the tier is read on → TTW-095.
- Discounts (product, variant, order) → TTW-096.
- Campaign pricing.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
