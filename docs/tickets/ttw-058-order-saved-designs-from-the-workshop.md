# TTW-058 — Let customers order their saved designs from the Design Workshop

**Epic:** 3 — Complete customer and fundraiser revenue journeys\
**Status:** Implemented, committed locally on `codex/ttw-058-order-saved-designs-from-the-workshop` (not pushed). Independent review: PASS (fresh reviewer, 2026-11-21).\
**Risk:** High\
**Blocked by:** TTW-100 (design content validation), TTW-092 (variant picker)\
**Blocks:** TTW-037 acceptance criterion "Two saved designs on the same variant remain two cart lines and two order items"

## Background

Code review of 21 October 2026, finding 3.1 (blocking): customers cannot order their own design. The Design Workshop (`apps/app/app/dashboard/design/new/[productId]/page.tsx`, `apps/app/app/dashboard/design/[designId]/edit/page.tsx`, `apps/app/components/workshop/`) creates, saves and shares designs, but has no "Get Price" or "Add to cart" action. The only "Add to cart" is on the product list (`apps/app/app/dashboard/products/page.tsx:221`), which adds the first in-stock variant without a design. Only fundraisers can sell a design today.

Client answer to review question Q6: "work on a single design, save when satisfied with update/clone capabilities, then add multiple saved designs to basket and checkout."

Already in place after TTW-037: cart lines carry an optional `designId` with `variantId:designId` identity (`apps/app/lib/cart-store.ts`); the checkout sends `designId` per line; the API checks design ownership and product match on order create (`apps/api/src/orders/orders.service.ts`, `assertDesignOwnershipAndProductMatch`); pricing quotes per design (view surcharges). What is missing is the way in: no screen puts a saved design in the cart.

Client answer to Q28: for personal designs "we print whatever you send to us. We can reject and refund an order and cite our reasons as feedback." This answers the policy for finding 3.8, as applied in the Proposal.

Related findings: 3.8 (standard orders do not check design moderation, unlike campaigns: once this ticket ships, a rejected design could be ordered) should be fixed with or before this ticket; 3.2 (the workshop does not receive print files) is separate; 3.5 (several products in one session) is not required per Q6.

## Proposal

- From a saved design (editor and "My Designs" list), let the customer pick a variant (size, colour) and a quantity, see the server price ("Get Price", from the existing quote endpoint) and add the line to the cart with its `designId`.
- The same design can be added in several variants; different designs on the same variant stay separate lines.
- Cart and checkout show which design each line carries (name, thumbnail when available).
- Confirm the "update / clone" behaviour the client expects on saved designs and cover any gap.
- Fix finding 3.8 with the policy from Q28: an order does not wait for moderation approval, a design already rejected cannot be ordered, and an admin can reject and refund an order with a reason. Record at design review whether the existing refund flow already covers that last action. The client is asked to confirm this reading, and this ticket does not wait for the reply.

## Invariants

- A design can only be ordered by its owner and on its own product (existing API check).
- The server quote is authoritative for prices; the cart stores ids, quantities and labels only.
- TTW-037 guarantees stay: one order per cart revision, cart cleared only after payment.

## Implementation plan

1. Design review: screens and copy (English UI), variant/quantity picker, moderation policy for 3.8.
2. Tests first (unit, API e2e, Playwright).
3. "Add to cart" from saved designs; cart and checkout display of the design per line.
4. Moderation check on standard orders (if not done elsewhere).
5. Docs, Playwright manifest (`APP-DESIGN-WORKSHOP` or new entry).

## Test and observability plan

- Unit/component: add-to-cart from a design (variant, quantity, `designId`), two designs on one variant → two lines.
- Integration/e2e: order create with two lines on the same variant and different designs → two order items with their `designId`; non-owner or wrong-product design refused; non-approved design handled per policy.
- Playwright: save a design, add it to the cart in two sizes, add a second design on the same variant, checkout, one order with the expected items (closes the deferred TTW-037 criterion).
- Logs, metrics, traces, and alerts: none beyond existing order logs.

## References

- Review 2026-10-21, findings 3.1, 3.2, 3.5, 3.8; client answer Q6 (`revue-client/`).
- `apps/app/lib/cart-store.ts`, `apps/app/app/dashboard/checkout/page.tsx` — cart and checkout already design-aware (TTW-037).
- `apps/app/app/dashboard/products/page.tsx:221` — current add-to-cart without design.
- `apps/api/src/orders/orders.service.ts` — `assertDesignOwnershipAndProductMatch`.
- `docs/tickets/ttw-037-prevent-duplicate-standard-checkout-orders.md` — deferred acceptance criterion.

## Acceptance criteria

- [x] A customer can add a saved design to the cart with a chosen variant and quantity, and see its server price.
- [x] Two saved designs on the same variant remain two cart lines and two order items (TTW-037 deferred criterion).
- [x] Non-approved designs follow the policy decided for finding 3.8.
- [x] Unit, API e2e and Playwright tests pass, with output recorded below.
- [ ] Independent implementation review passes.

## Out of scope

- Print files for the workshop → finding 3.2.
- Several products in one Design Workshop session → finding 3.5 (not required per Q6).
- Workshop layout differences from Figma → finding 3.4.

## Design review

Recorded 2026-11-21, before implementation. Reviewer: author, against the code of `main` (dc94bcf).

**Entry point.** The product page (`apps/app/app/dashboard/products/[id]/page.tsx`, TTW-092) already has the colour and quantity-per-size picker and the cart call. It is reused with `?designId=<id>`: no second picker. Two links lead there: an "Order" action on each card of "My Designs" (`design/page.tsx`) and an "Order this design" link in the editor once the design is saved. Both link to the design's own product.

**Product page with a design.** It loads the design (`getDesign`, owner only). A banner shows its name and thumbnail. If the design is for another product, is not found, or is `REJECTED`, the picker is replaced by a message and a link back to "My Designs". "Get price" quotes the chosen lines with their `designId` through `POST /orders/quote` and shows each unit price (view surcharge included) and the subtotal. The quote needs a delivery address, so it uses the customer's default address (`getUserAddresses`); with none, the page says so and links to settings instead of guessing. "Add to cart" adds one line per size, with `designId`, `designName` and the design thumbnail; the unit price stored is the quoted one when available, else the variant price. It is a display value: checkout re-quotes (invariant kept).

**Cart and checkout.** `CartItem` gets an optional `designName`; lines with a design show it and the thumbnail. Old carts without it still load.

**Policy for finding 3.8 (Q28).** `assertDesignOwnershipAndProductMatch` refuses a `REJECTED` design (400, stable message) and lets `PENDING`, `FLAGGED` and `APPROVED` through: an order does not wait for moderation. The quote endpoint is unchanged. Reject and refund with a reason: the admin already has `POST /admin/orders/:id/refund` with `reasonCode` and `reason` (`admin-orders.controller.ts`), so no new admin action is needed; the client is asked to confirm the reading.

**Security.** Ownership and product match stay enforced on the server (existing check); the new page never trusts the query string: the API refuses a design that is not the user's. No new endpoint, so the OpenAPI contract does not change.

**Open points.** Editing a design after it is in the cart does not change the line price until checkout re-quotes, which is the existing behaviour.

## Implementation reviews

`/code-review` at high effort, 2026-11-21, run in the author's session (not a separate reviewer). Seven findings:

- Fixed: stale quote shown after the quantities changed (request counter in the product page, test added); no Swagger text or policy doc for `DESIGN_REJECTED` (controller text, `docs/orders/ttw-033-interim-policy.md`, OpenAPI regenerated); "Order this design" shown while saving (now hidden).
- Left, to do later: checkout gives no actionable message when a design in the cart was rejected after being added; a merged cart line keeps the old price and design name; "Order this design" does not warn about unsaved edits; per-line design lookups in `assertDesignOwnershipAndProductMatch` (existing pattern).

Independent review by a fresh reviewer (read-only, commit 180ccf4), 2026-11-21: **PASS**, nothing blocking. Findings:

- Important, existing, not fixed here: `POST /orders/quote` checks neither the owner nor the moderation status of the design (`pricing.service.ts`, `computeViewSurchargeForDesign` reads the design views by id only). A customer can quote another customer's design id and learn its view surcharge (one amount), and a rejected design can be quoted. Order creation is not affected: `create` refuses it before quoting. The Security paragraph of the design review above covers order creation only, not the quote. To be a separate ticket.
- Minor, fixed: no test for loading a cart saved without `designName` (added); no test that the "Order this design" link hides while saving (added); `getDesign` did not encode the id (now `encodeURIComponent`).
- Minor, accepted: if a design is rejected between the check and the insert, the order goes through; that is the Q28 policy (admin refund). The reviewer did not check that the admin refund flow handles a paid order whose design was rejected afterwards, and no test covers it.

## Verification evidence

All run in the worktree on 2026-11-21 (Node 24.22.1).

- API tests first, failing for the right reason: `test/order-saved-designs.e2e-spec.ts`, "refuses a rejected design" received a created order. After the fix: 5/5 pass (`pnpm --filter api test:e2e -- test/order-saved-designs.e2e-spec.ts`). `order-create-idempotency` and the two `seed-e2e-*` suites still pass (21 tests in 4 suites).
- `pnpm --filter api test:coverage`: 175 suites, 2090 tests pass. `pnpm coverage:ratchet` passed. `pnpm coverage:diff`: 2/2 changed lines covered (100%).
- `pnpm --filter app test`: 34 suites, 264 tests pass. Existing `product-detail-page.test.tsx` only gained `useSearchParams` in its `next/navigation` mock (the page now reads `?designId=`); no assertion changed.
- `pnpm lint` (0 errors), `pnpm typecheck`, `pnpm format:check`, `pnpm docs:validate`, `pnpm playwright:validate`, `pnpm openapi:check`: pass. `pnpm build`: 5/5 tasks.
- Playwright (`chromium-app`, `design-order.spec.ts`, `checkout-order-note.spec.ts`, `products-cart.comprehensive.spec.ts`): 30 passed, run on a throwaway database `tamiym_workshop_test_ttw058` (dropped after), `REDIS_DB=14`. The shared test database lacks the TTW-231 users, so it was not used.
- Not run: `pnpm verify` as one command, `pnpm audit:prod`, `pnpm migrations:check`, the `matrix` browser tiers, the other Playwright specs, and a visual check against Figma.

## Deviations from the plan

- No new endpoint and no new screen: the product page of TTW-092 is reused with `?designId=`.
- A seeded customer `designOrder` (`design-order.e2e@tamiym.test`) was added to `seed:e2e`, `identities.ts` and `auth.setup.ts`: checkout refuses an unverified email, so a registered throwaway customer cannot check out. Anyone with an already seeded e2e database must reseed it.
- "Get price" needs a delivery address, because the quote endpoint requires one. Without an address the page links to settings.

## Completion summary

Customers can order a saved design: "Order" on each card of "My Designs" (not for a rejected design) and "Order this design" in the editor lead to the product page, which shows the design, quotes the chosen sizes with "Get price" and adds one cart line per size with `designId` and `designName`. Cart and checkout show "Your design: ...". The API refuses a `REJECTED` design with `DESIGN_REJECTED` and lets pending and flagged ones through (Q28). Two designs on one variant stay two lines and two order items (Playwright and API e2e).

Remaining: independent review; the client's confirmation of the Q28 reading; the left-over review points above. Update/clone already exist ("Duplicate" and the editor), so no gap was added there. Nothing pushed, no PR.
