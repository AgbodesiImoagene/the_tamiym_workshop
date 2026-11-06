# TTW-058 — Let customers order their saved designs from the Design Workshop

**Epic:** 3 — Complete customer and fundraiser revenue journeys\
**Status:** Not started (to be scheduled later, user decision 2026-11-03)\
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

- [ ] A customer can add a saved design to the cart with a chosen variant and quantity, and see its server price.
- [ ] Two saved designs on the same variant remain two cart lines and two order items (TTW-037 deferred criterion).
- [ ] Non-approved designs follow the policy decided for finding 3.8.
- [ ] Unit, API e2e and Playwright tests pass, with output recorded below.
- [ ] Independent implementation review passes.

## Out of scope

- Print files for the workshop → finding 3.2.
- Several products in one Design Workshop session → finding 3.5 (not required per Q6).
- Workshop layout differences from Figma → finding 3.4.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
