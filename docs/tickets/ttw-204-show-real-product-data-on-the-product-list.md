# TTW-204 — Show real product data on the customer product list and match the Figma cards

**Epic:** 8 — Client review delivery\
**Status:** Implemented, unmerged (local commit)\
**Risk:** Standard\
**Blocked by:** TTW-093\
**Blocks:** None

## Background

Found on 2026-11-12 by comparing the Figma frame "Dashboard/Products" (file `pg6Emcv2r79FaPdkK17ecE`, node `203:2534`) with `apps/app/app/dashboard/products/page.tsx`. Not in the client review. Confirm each point against current `main` before designing: the code may have moved.

Figma shows, under each product photo: a row of its colours, the name, a size range ("S-5XL"), "$12.27 each for 30 items", and "No Minimum". Only the first product carries a "Best Seller" tag, and photos have no card border.

The code shows fake data to the customer:

- The "Best Seller" tag is always on the first product of the list (`index === 0`), whatever was sold.
- Every product shows the same colour squares, from a fixed `colorDots` list, not the product's own colours.
- The price line reads "{amount} each for {category name}", for example "for T-Shirts", instead of the quantity the price applies to.
- The "No Minimum" line shows the product description when there is one, and "No Minimum" only as a fallback.
- Each card is a bordered, shadowed, 28px-rounded box with an "Add to cart" button and a "View cart" button, none of which is in Figma.

Seen running on 2026-11-12 (customer app on `localhost:3002`, seeded catalogue): "Best Seller" on the first card, the same eight colour squares on every card, and "₦5,000 each for Zone Cat …" as the price line.

Note: Figma's "2-Day Express Production Available" badge is TTW-153, and the colour of the green is TTW-162.

## Proposal

- Show each product's real colours and real size range, from its variants.
- Show "Best Seller" only from real data. The tag was removed in TTW-093 (decision of 2026-11-20: no rule for it yet); bring it back here only with a rule and real sales data.
- Write the price line from the real bulk tier ("each for N items"), and show the real minimum order or "No Minimum".
- Match the Figma card layout: photo, colours, name, size range, price, minimum. Keep add-to-cart reachable, because removing it would break the purchase path, and record where it goes in the design review.

## Invariants

- Prices shown stay equal to what the cart and checkout compute.
- Products without variants, images or prices still render, with the existing "Quote on request" fallback.
- Copy stays in English.

## Implementation plan

1. Start `codex/ttw-204-show-real-product-data-on-the-product-list` from current `main`, in its own worktree, after TTW-093 is merged (same file).
2. Confirm the gaps against the current code, and update this ticket if it moved.
3. Record the design review below before implementing.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit/component: real colours and size range per product; no "Best Seller" without data; price line from the bulk tier; minimum text; product with no variants.
- Integration/e2e: Playwright checks that the list matches the catalogue data for two products with different colours.
- Failure, retry, and concurrency: not applicable beyond the existing loading and error states.
- Logs, metrics, traces, and alerts: nothing new.

## References

- Figma `pg6Emcv2r79FaPdkK17ecE`, node `203:2534` — the target design.
- `apps/app/app/dashboard/products/page.tsx` — `colorDots`, the `index === 0` "Best Seller", the price line, the description fallback.
- TTW-093 (categories and pagination), TTW-095 (tiers on the product total), TTW-153 (express badge), TTW-157 (filters).

## Acceptance criteria

- [x] No product shows colours, a tag or a price line that the data does not support.
- [x] The card layout follows Figma (photo without border, colours, name, sizes, price, minimum), with the product page still reachable. Not compared pixel by pixel.
- [x] Required quality gates pass with evidence recorded below.
- [x] Playwright acceptance coverage is updated in the same change.

## Out of scope

- Express production badge → TTW-153.
- Search, sort and price filter → TTW-157.
- Product detail page → TTW-092.
- Product reviews and ratings shown in Figma → not done (Q7).

## Design review

Done 2026-11-20, before implementation (standard risk).

**Gaps confirmed on `main` (9b3d063).** "Best Seller" and the "Add to cart" button are already gone (TTW-093 and TTW-092): the card has "View product" and "Go to cart". Still false: the fixed `colorDots`, the "each for {category}" line, the description in place of "No Minimum", the bordered 28px card. New finding: `ProductsService.findAll` returns no variants and no bulk tiers, so the page cannot show real colours, sizes or tiers without an API change.

**Design.**

- API: `findAll` also reads the variants' option values and the product-level bulk tiers (`variantId` null, NGN), and returns three derived fields instead of raw rows: `colors` (`{ code, name, hex }`, unique, in option-value order, `hex` only when `metadata.hex` is a valid hex colour, else `null`), `sizeRange` (first and last size by sort order as "S-5XL", one size alone, `null` when none) and `bulkTier` (`{ minQuantity, pricePerUnit }`, the tier with the lowest unit price, `null` when none). Variants and tiers are not exposed. No schema change, no migration.
- Price line: `₦X each for N items` from `bulkTier`, `₦X each` from the base price when there is no tier, "Quote on request" when there is no price. The line is informational: the cart quote stays the price authority.
- Minimum: no minimum order is modelled for a product, so the line is always "No Minimum" (true today). It never shows the description. A real minimum needs a field and a client decision: out of scope.
- Card: photo without border, then colours, name, size range, price, minimum, as in Figma. "View product" and "Go to cart" stay, because choosing size and colour happens on the product page (TTW-092), so the purchase path is intact. A colour without a hex renders a neutral swatch with its name as label, never a made-up colour.
- "Best Seller": not brought back, there is no rule and no sales data.
- Risks: prices shown must equal the cart (test against the quote for a product without tier); the contract changes (OpenAPI regenerated, not in production); a product with no variant, image or price keeps rendering.

## Implementation reviews

2026-11-20, independent review (`/code-review`, high), 8 findings. Fixed: colour swatches now have an accessible name; equal sort orders get a stable tie-break by code; a tier is no longer shown when the product has no base price ("Quote on request" wins). Accepted and not fixed here: (1) the tier price excludes size and print surcharges, so a 5XL can cost more in the cart than the card says; the card is informational and the correct per-quantity price is TTW-095's work, to revisit there; (2) variants are loaded per product on the public list: bounded by `limit` (max 100) and by `MAX_VARIANTS_PER_PRODUCT`, to measure if the catalogue grows; (3) the e2e seed has no bulk tier, so the tier line is covered by unit tests only; (4) old `text-black/xx` classes kept on untouched card lines; (5) the `color`/`size` codes exist in the API and in `apps/app/lib/product-variants.ts`.

## Verification evidence

Run on branch `codex/ttw-204-show-real-product-data-on-the-product-list` from `main` 9b3d063, Node 24.22.1.

- Tests first, seen failing for the right reason: API `product-card-summary.spec.ts` (module missing) and the new `products.service.spec.ts` cases; app `product-list-card.test.tsx` 7 of 9 failed (2 pin existing behaviour).
- `pnpm --filter api test -- src/products`: 139 passed. `pnpm --filter app test`: 170 passed. `pnpm test`: web 79, app 168, api 1856 passed (before the review fixes; api and app rerun after: green).
- `pnpm typecheck`, `pnpm lint` (0 errors, api warnings only), `pnpm format:check`: pass.
- `pnpm openapi:generate` then `pnpm openapi:check`: no drift. `pnpm docs:validate`, `pnpm playwright:validate`: pass.
- `pnpm --filter api test:coverage` then `pnpm coverage:ratchet` (lines 84.75% vs floor 56%) and `pnpm coverage:diff` (2/2 lines, floor 80%): pass.
- Playwright on a throwaway database `tamiym_workshop_test_ttw204` (REDIS_DB 14, dropped after): `products-cart.comprehensive.spec.ts`, 26 passed over desktop, tablet and mobile, including the new TTW-204 test (tee shows Navy and White swatches and "Medium-Large", hoodie has no colour square and shows "Small-Medium", no "Best Seller", description never replaces "No Minimum", "View product" reachable). Run before the three review fixes; the fixes are covered by unit tests and do not change a selector.
- Not verified: the page was not played by hand in a browser outside Playwright; the Figma match was not compared pixel by pixel; the tier line has no e2e (no tier in the seed).

## Completion summary

Done: the list API returns `colors`, `sizeRange` and `bulkTier` (no migration, OpenAPI regenerated); the card shows real colours, the size range, a price line from the real tier or the base price, and always "No Minimum" (no minimum order is modelled). Deviations from the ticket: "Best Seller" and "Add to cart" were already gone; the earlier api test that forbade variants in the list was replaced (user approved). Not done: a real minimum order (needs a field and a client decision), "Best Seller" (no rule). Local commit only, not pushed.
