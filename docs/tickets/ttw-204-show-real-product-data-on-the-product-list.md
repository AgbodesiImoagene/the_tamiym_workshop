# TTW-204 — Show real product data on the customer product list and match the Figma cards

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
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
- Show "Best Seller" only from real data, or remove it until there is a rule for it (decision to record in the design review).
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

- [ ] No product shows colours, a tag or a price line that the data does not support.
- [ ] The card layout matches Figma, with add-to-cart still reachable.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Playwright acceptance coverage is updated in the same change.

## Out of scope

- Express production badge → TTW-153.
- Search, sort and price filter → TTW-157.
- Product detail page → TTW-092.
- Product reviews and ratings shown in Figma → not done (Q7).

## Design review

Not done yet. Required before implementation.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not complete.
