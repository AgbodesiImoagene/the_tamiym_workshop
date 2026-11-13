# TTW-092 — Build the product detail page

**Epic:** 8 — Client review delivery\
**Status:** Implemented, reviewed, journeys green; Figma comparison pending\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** TTW-093, TTW-058, TTW-123

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 2.2, Product detail page missing** (Blocker, P0, 25–40 h, status "To do"): Gallery per colour, quantity per size, order note, related products (Figma "Product Info"). The API already provides the data.
- **Row 2.1, Size and colour cannot be chosen** (Blocker, P0, 0–0 h, status "Included in 2.2"): "Add to cart" picks the first in-stock variant with quantity 1. A bulk order across sizes is impossible outside the Design Workshop.

## Proposal

- Add `dashboard/products/[id]` following the Figma "Product Info" design: gallery per colour, quantity per size, related products.
- The add-to-cart action creates one cart line per chosen variant. Remove the first-variant shortcut from the list page.
- `CreateOrderDto` has no obvious order-note field. If the design requires a note, record that gap in the design review before adding it.

## Invariants

- The cart stores ids, quantities and labels only. The server quote stays the price authority.
- Cart behaviour from TTW-037 is unchanged.

## Implementation plan

1. Start `codex/ttw-092-build-product-detail-page` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Component: variant selection, out-of-stock, loading, empty and error states.
- Playwright: choose sizes and colours, add to cart, see the correct lines at checkout.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- No dashboard/products/[id] route — row 2.2
- `apps/app/app/dashboard/products/page.tsx:210` — row 2.1
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer can buy several sizes of a product in one action, without the Design Workshop.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.
- The order note of Figma "Product Info" → TTW-197.

## Design review

Standard risk, no API, schema or money-path change. Recorded 2026-11-12 before implementation.

**Finding confirmed on `main` (09239e1).** `apps/app/app/dashboard/products/page.tsx:205-245` fetches the detail, picks the first `isAvailable && inStock` variant and adds quantity 1. There is no `apps/app/app/dashboard/products/[id]` route.

**Data already available (no API change).** `GET /v1/products/:id` (`ProductsService.findOne`) returns `variants[]` with `optionValues` (option `code` such as `size` / `color`, `valueCode`, `displayName`), `isAvailable`, `inStock`, `availableQuantity`, `resolvedPrice`, plus `images[]` (each with an optional `variantId` and a display `url`) and `productImageRoles`. `GET /v1/products` lists products with their category.

**Design.**

- New client page `dashboard/products/[id]/page.tsx`, same shell, auth redirect and TanStack Query pattern as the list page.
- A pure helper `apps/app/lib/product-variants.ts` groups variants by colour and size (option codes `color` and `size`, falling back to a single "default" group when a product has no such option). It is unit-tested on its own.
- Gallery per colour: the images whose `variantId` belongs to a variant of the chosen colour; if none, the images that belong to no variant, then the existing fallback assets (the product image roles are not read).
- Quantity per size for the chosen colour: one stepper per size. A size is disabled when the variant is unavailable or out of stock, and the maximum is `availableQuantity` when stock is tracked (the server quote and checkout stay the authority).
- "Add to cart" adds one cart line per size with quantity above zero, by calling the existing `addCartItem` once per variant. The cart schema is unchanged (TTW-037). Prices shown come from `resolvedPrice`; the server quote stays the price authority at checkout.
- Related products: the same category from the existing list query, current product excluded, at most four, each linking to its own page. Hidden when there are none.
- States: loading, error with retry, not found, product with no purchasable variant, nothing selected (button disabled with a hint).
- The list page keeps its cards but the first-variant button becomes a "View product" link to the detail page, which removes the shortcut. "Go to cart" stays.
- Text in English, theme tokens only, no control without an action.

**Gap recorded: order note.** The Figma "Product Info" design has an order note, but `CreateOrderDto` has no note field and the Figma file is not in the repository, so it could not be checked here. The note is therefore not built and no dead field is shown. Adding it touches the order API, so it has its own ticket, TTW-197, which proposes one optional note on the order entered at checkout.

**Risks.** Cart line merging by `variantId:designId` already sums repeated adds, so adding the same size twice increases the quantity (existing behaviour, covered by `cart-store.test.ts`). A colour with no images falls back to generic assets.

**Tests first.** Unit tests for the helper, a component test for the page (selection, several sizes in one add, out of stock, loading, error, not found), a list-page test that the shortcut is gone, and a Playwright journey for sizes and cart lines.

## Implementation reviews

Independent review of commit b99cb7f by a fresh subagent, 2026-11-12: PASS, no blocker. Findings and what was done:

- Medium, other colours' quantities were added without being visible: a summary line (`selection-summary`) now lists everything that will be added.
- Medium, a related-product link kept the message, image and colour of the previous product: the page remounts per product id (`key`).
- Low, a quantity typed before stock dropped could exceed it: quantities are re-capped to the current stock when added.
- Low, no test for empty, negative or non-numeric quantities: added.
- Low, design review said image roles were a fallback but the code skips them: ticket text aligned with the code.
- Low, e2e selectors used "S"/"M" while the seed labels are "Small"/"Medium": selectors fixed.
- Accepted: the stock cap ignores units already in the cart (the server quote/stock check stays the authority); the list page keeps its older hard-coded colours (out of scope).

## Verification evidence

Run from the worktree on 2026-11-12 (Node 24, `pnpm install --frozen-lockfile`, `pnpm db:generate`).

Tests first, seen failing for the right reason before any production code: `product-variants.test.ts` and `product-detail-page.test.tsx` failed with "Cannot find module" (helper and route absent), `product-list-page.test.tsx` failed because no "View product" link existed (the first-variant button was still there).

After the change:

- `pnpm --filter app test` — 11 suites, 86 tests passed before the review fixes (20 new: `__tests__/lib/product-variants.test.ts`, `__tests__/products/product-detail-page.test.tsx`, `__tests__/products/product-list-page.test.tsx`).
- `pnpm --filter app typecheck` — no errors.
- `pnpm --filter app lint` — no errors.
- `pnpm playwright:validate` — "Playwright manifest validation passed." (`products-cart.comprehensive.spec.ts` was already listed for APP-CUSTOMER-DASH, so the manifest is unchanged.)
- `prettier --check` on the files touched — clean (`apps/app/app/globals.css` also fails the formatter but is untouched by this ticket).

After the review fixes: `pnpm --filter app test` 11 suites, 92 tests passed; app typecheck and lint clean.

Playwright, run 2026-11-12 on a dedicated database (`tamiym_workshop_e2e_ttw092`, Redis db 14) so the shared test database used by the parallel TTW-194 session was not touched: `migrate deploy`, `prisma db seed`, `seed:e2e`, `pnpm build` (5 tasks successful), then `pnpm exec playwright test tests/e2e/app/products-cart.comprehensive.spec.ts --project=setup --project=chromium-app` — 15 passed (1.2m). Scenarios: Campus Hoodie Small x2 and Medium x3 gives a cart with two lines; an unknown product shows a message with a way back; list to product navigation; plus the unchanged cart test. Each ran on desktop-1440, tablet-834 and mobile-393. The unknown-product test tolerates the one deliberate 404 console line for `/v1/products/does-not-exist` only.

**Not verified.** The layout was not compared with the Figma "Product Info" design: the file opens in the browser pane but is a canvas, so nothing could be read from it. Firefox, WebKit and the visual and accessibility Playwright projects were not run.

## Completion summary

Done: product page at `dashboard/products/[id]` (colour choice, gallery of the chosen colour, quantity per size, one cart line per chosen variant, related products from the same category, loading / error / not-found / unavailable states); the list cards now link to it and the first-variant shortcut is gone; `DashboardProductDetail` gained `images`; pure helper `apps/app/lib/product-variants.ts`.

Deviation from the plan: none in scope. The order note was not built (see the design review: it needs an order API change and a client decision).

Left to do: check the layout against Figma (needs exported screens of Product Info), and run the other Playwright projects if wanted. No API, OpenAPI, schema or migration change was needed.
