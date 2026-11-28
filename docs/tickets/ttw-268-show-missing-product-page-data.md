# TTW-268 — Show the missing product data on the customer product page

**Epic:** 8 — Client review delivery\
**Status:** In review (implemented, verified and reviewed; Playwright e2e not run)\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

TTW-253 audit row 14 compared `/dashboard/products/[id]` with the Figma "Product Info" frames. The page
shows the name, category, description, a text colour picker, a quantity per size, "Add to cart" and
"Go to cart" (`apps/app/app/dashboard/products/[id]/page.tsx:259-471`). It does not show a headline price,
a compare-at price, a stock status, colour swatches, a total quantity, "Start Designing" or
"Proceed To Checkout", although `GET /products/:id` already returns what these need:

- price and compare-at: `resolvedPrice` / `resolvedCompareAt` per variant, `resolvedBasePrice` /
  `resolvedBaseCompareAt` for the product (`apps/api/src/products/products.service.ts:488-515`);
- stock: `isAvailable`, `inStock`, `availableQuantity` per variant (same lines);
- colour hex: `variants[].optionValues[].optionValue.metadata.hex`
  (`apps/api/src/products/products.service.ts:349-362`).

The front types do not declare `metadata` or `resolvedBaseCompareAt` (`apps/app/lib/products.ts:39-75`).

## Proposal

Front only, `apps/app`, following the order of the Figma panel: category, name, stock badge, description,
price, colour, quantity per size, total quantity, actions.

- **Price.** Large price of the selected colour: the lowest price among its purchasable sizes (all its
  sizes when none is purchasable), prefixed "From" when its sizes have different prices. The compare-at
  price is struck through only when it is higher than the price (when several sizes share that price,
  only if each has one, using the smallest). A product without
  variants shows its base price; without any price, "Quote on request" (same wording as the list).
  The per-size "each" price stays. Display only: the server quote stays the price authority.
- **Stock.** "In stock" when at least one size of the selected colour is available and in stock, else
  "Out of stock". No badge for a product without variants.
- **Colour swatches.** One button per colour, filled with the hex (same validation as
  `apps/api/src/products/product-card-summary.ts:6-38`), named by the colour for assistive technology,
  `aria-pressed` on the selected one, whose name is also written next to the "Colour" label. A colour
  without a valid hex keeps the current text button. Shown as soon as the product has a real colour
  option, including a single colour; never for the technical "Default" group.
- **Total quantity.** Read-only total of the chosen sizes across all colours (what will be added). It is
  not an `<output>` element: that has the `status` role used for the cart message.
- **Start Designing.** Link to `/dashboard/design/new/<productId>`, shown for a loaded product, hidden
  when the page orders a saved design (`?designId=`).
- **Proceed To Checkout.** Primary button: adds the chosen sizes to the cart exactly as "Add to cart"
  does, then opens `/dashboard/checkout`. Disabled when nothing is chosen; hidden in the same cases as
  "Add to cart" (not orderable, design loading or unusable). Checkout covers the whole cart, including
  lines added earlier.
- **Kept although Figma omits them:** "Add to cart" (secondary) and "Go to cart".
- Design tokens only (`@tamiym/ui` `Button` / `Badge`, semantic Tailwind colours). The only inline colour
  is the swatch hex that comes from the data.

Rejected: one product-wide price and stock status (wrong for a colour that costs more or is sold out);
a "Proceed To Checkout" that skips the cart (checkout only reads the cart); adding colour data to the
API (not needed).

## Invariants

- The cart lines created by "Add to cart" and "Proceed To Checkout" are identical for the same selection.
- A quantity above current stock is never added.
- A saved design that is loading, missing, foreign or rejected can never reach the cart or checkout.
- A product without a photo shows "Image not available", never a stand-in picture.
- No invented data: nothing is shown that the API does not return.

## Implementation plan

1. Tests first, seen failing: helper cases in `__tests__/lib/product-variants.test.ts` and a new
   `__tests__/products/product-detail-data.test.tsx`. Existing tests are not edited.
2. `lib/products.ts` (types) and `lib/product-variants.ts` (colour hex, compare-at, headline price,
   real-colour flag).
3. `app/dashboard/products/[id]/page.tsx`: badge, price, swatches, total, the two actions.
4. App typecheck, lint, tests, `pnpm playwright:validate`.
5. Browser walk of the journey at desktop and mobile width; update this ticket.

Plan approved by the product owner on 2026-11-25 (relayed by the parent session, their words:
"Oui, j'approuve 268"). The approval covered the plan only: no commit, push or merge.

Deviations:

- The compare-at rule for sizes sharing the lowest price was tightened after the review.
- The new buttons use the `@tamiym/ui` `Button` (design-rules green and blue), so "Add to cart" is now
  an outlined button instead of the former blue pill.
- "Start Designing" sits under the cart actions, outside them, so it stays available for a product that
  cannot be ordered.

## Test and observability plan

- Unit/component: price (single, "From", compare-at higher / equal / absent / string decimals, base price
  only, no price); stock badge per colour; swatch with and without hex, single colour, no colour option,
  invalid hex; total quantity; "Start Designing" href and hidden with a design; "Proceed To Checkout"
  disabled, cart lines then navigation, design line kept, absent when not orderable or design unusable.
- Integration/e2e: existing selectors (`Add to cart`, `Go to cart`, `Quantity for …`, colour button by
  name, single `status`) are kept. Browser walk against the local API.
- Failure, retry, and concurrency: double click on "Proceed To Checkout" adds the lines once.
- Logs, metrics, traces, and alerts: none (display only).

## References

- `apps/app/app/dashboard/products/[id]/page.tsx` — the page.
- `apps/app/app/dashboard/products/page.tsx:145-160` — swatches of the list card.
- `apps/app/lib/cart-store.ts` — cart used by checkout.
- `revue-client/screenshots/` (main checkout only), captures of 2026-11-21 at 22.15.31 and 22.16.10 —
  Figma "Dashboard/Products/Product Info".

## Acceptance criteria

- [x] The page shows a prominent price, with the compare-at price struck through when it is higher.
- [x] The page shows "In stock" or "Out of stock" for the selected colour.
- [x] Colours are swatches filled with the option value hex, selectable and named.
- [x] The total selected quantity is shown.
- [x] "Start Designing" opens `/dashboard/design/new/<productId>`.
- [x] "Proceed To Checkout" puts the selection in the cart and opens checkout with those lines.
- [x] Related products still list and link; a product without a photo says "Image not available".
- [x] App typecheck, lint and tests pass, and the journey was walked in the browser, with evidence below.

## Out of scope

- Likes (heart and count in Figma) and bulk pricing tiers → `GET /products/:id` returns neither today.
  TTW-269 plans both in the API (planned, not shipped); showing them here needs a follow-up front ticket.
- Reviews → later ticket (needs API; the Figma text is lorem ipsum).
- Order note on the product page → not built. Checkout already has an order note for the whole order;
  a per-product note needs a business decision and an API change.
- Size upcharge captions ("+500"), gallery arrows, related-product cards with photos, swatches and prices,
  the "Product Info" back header → visual alignment, to be ticketed if wanted.
- `apps/api`, `prisma/schema.prisma`, `docs/openapi`, `packages/types` → owned by parallel sessions.

## Design review

2026-11-25, self-review by the implementing session (not independent).

- Blast radius: one page and two helper files of `apps/app`. `lib/product-variants.ts` is used only by
  this page and its tests. `lib/products.ts` only gains optional type fields.
- Duplication: swatch rendering and the hex rule exist for the list card (hex already filtered by the API
  there); the detail response is raw, so the front applies the same rule.
- Interfaces: no API, contract or schema change.
- Edge cases: single colour, no colour option, missing hex, sold-out colour, product without variants or
  price, prices as decimal strings, saved-design ordering, double click.
- Risks: e2e selectors (kept); TTW-267 may also add fields to `lib/products.ts` (small merge conflict).
- Verdict: ready to implement once the product owner approves the plan.

## Implementation reviews

Iteration 1, 2026-11-25, `/code-review medium` run by the implementing session, in the same context: it
is **not independent**. Verdict: no open correctness defect added by this ticket after the fixes.

| Finding                                                                                        | Severity     | Outcome                               |
| ---------------------------------------------------------------------------------------------- | ------------ | ------------------------------------- |
| Struck price depended on the variant order when sizes share the lowest price                   | Important    | Fixed, test first                     |
| Old price not announced as such to screen readers                                              | Nit          | Fixed ("Original price:"), test first |
| Page can open on a sold-out colour although another is in stock                                | Nit          | Open: product owner's choice          |
| With a saved design, the large price excludes the design surcharge shown by "Get price"        | Nit          | Open: product owner's choice          |
| A product without any price lists sizes at 0 that can be added to the cart (`toChoice` `?? 0`) | Pre-existing | Not fixed: follow-up ticket           |

Iteration 2, 2026-11-25, independent review by the parent session (it wrote the brief, not the code):
production diff, tests, cart store and add-to-cart path read. Verdict: **PASS**, no blocking defect.

| Finding                                                                                                 | Severity     | Outcome                        |
| ------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------ |
| "Start Designing" shows on every product; the workshop of a product with no designable view not checked | Nit          | Open: to verify in a follow-up |
| When every colour is sold out the swatches are hidden, as the former colour buttons were                | Pre-existing | Not changed                    |

Rerun by the reviewer in this worktree: `pnpm --filter app test` 59 suites, 564 tests passed; app
typecheck and lint clean; `pnpm playwright:validate` passed. Prettier reports only
`apps/app/app/globals.css`, which this ticket does not change.

## Verification evidence

2026-11-25, Node 24.22.1, in the worktree.

- Baseline before the change, `pnpm --filter app test`: 58 suites, 529 tests passed.
- New tests seen failing first: `product-detail-data.test.tsx` and the new cases of
  `product-variants.test.ts`, 31 failed / 14 passed (the passing ones: the 12 existing helper cases and
  2 "shows nothing" cases). Review fixes: 2 failed / 44 passed, then green.
- `pnpm typecheck` (app): clean. `pnpm lint` (app): clean.
- `pnpm test` (app): 59 suites, 564 tests passed. No existing test was edited.
- `pnpm playwright:validate`: passed. `git diff --check`: clean.
- Browser walk, this branch's app on `localhost:3000` (a customer origin) against the running dev API,
  already signed in, 1280×900 and 375×812:
  - Classic Tee: badge, price following the colour (₦6,500 Navy, ₦7,000 White), swatches, total 3 across
    two colours, "Proceed To Checkout" opened `/dashboard/checkout` with Medium/Navy × 2 and
    Large/White × 1; used again after going back, the cart line went to 3.
  - "Start Designing" opened `/dashboard/design/new/e2e-product-classic-tee`.
  - Related products: link to Campus Hoodie ("From ₦12,000", no colour option); "Image not available".
  - Mobile: no horizontal overflow (`scrollWidth` 375).
  - The dev data has no compare-at price and no sold-out variant: both were checked on a response
    rewritten in the browser only (no data changed).
  - No order was placed; the test cart of `localhost:3000` was cleared. The one console error seen is a
    401, not investigated.
- The built-in preview could not start a server from the worktree (`EPERM uv_cwd`); the server ran in a
  Terminal tab, closed afterwards.
- Not run: Playwright e2e (its ports are held by the running dev servers). Selectors used by the existing
  specs were checked by reading them. Not walked in the browser: ordering a saved design, a product with
  a real photo.

## Completion summary

The customer product page shows the price (with former price), the stock status, colour swatches, the
total quantity, "Start Designing" and "Proceed To Checkout", front only. No API, schema or contract
change. Committed on its branch after the independent review.

Left to do: push on request, the Playwright e2e run, the `docs/tickets/ROADMAP.md` row, the open review
questions above, and the follow-ups listed in "Out of scope".
