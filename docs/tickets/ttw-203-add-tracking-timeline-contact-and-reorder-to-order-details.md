# TTW-203 — Add the tracking timeline, contact support and reorder to the order details page

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

Found on 2026-11-12 by comparing the Figma frame "Dashboard/Orders/Order Details" (file `pg6Emcv2r79FaPdkK17ecE`, node `378:15176`) with the customer app. Not in the client review. Confirm each point against current `main` before designing: the code may have moved.

Figma shows, on one order:

- A tracking timeline with three steps: Order Placed, Delivering, Delivered, each with a time or date.
- A summary card with Sub total, Discount, Shipping Fee and Total, and a second card with Payment Method, Shipping Method and Tracking Number.
- Three buttons: Download Invoice, Contact Support, Reorder.

Current code (`apps/app/app/dashboard/orders/[id]/page.tsx`) shows the shipping destination, the totals and the tracking number. A search of `apps/` finds no timeline, no "Contact support" and no "Reorder". "Download Invoice" is already scoped in TTW-108 and is out of scope here.

Seen running on 2026-11-12 (customer app on `localhost:3002`, seeded order `e2e-order-fulfilled`): the page title is the raw order id cut short ("Order e2e-orde…") instead of "Order : #895743"; there are no item photos, colours or size grid; there is no discount row and no payment method row; a "Payment attempts" side card and "Refresh" / "Payment confirmation" buttons appear that Figma does not have. The dashboard home page already shows an Order Placed / Delivering / Delivered timeline, which the order page can reuse.

## Proposal

- Add the three-step timeline, driven by the order and shipment status that already exist. No new status is invented.
- Show the shipping method and the payment method (card, via Paystack) in the second card.
- Add "Contact support": a link to the official contact from the site settings. If no official contact is configured yet (Q46), hide the button, which is the default proposed for Q46.
- Add "Reorder": put the same items, sizes and colours in the cart at **today's** prices and stock, and tell the customer when an item is no longer available or its price changed. It never reuses the old price.

## Invariants

- Orders, payments and stock are not modified by viewing the page.
- Reorder only adds to the cart. It never creates an order or a payment.
- The page stays readable for orders in every status, including cancelled and refunded.

## Implementation plan

1. Start `codex/ttw-203-add-tracking-timeline-contact-and-reorder-to-order-details` from current `main`, in its own worktree.
2. Confirm the gaps against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit/component: timeline step for each order and shipment status; contact button hidden when no contact is configured; reorder message when an item is unavailable or its price changed.
- Integration/e2e: Playwright plays a delivered order, then a reorder that lands in the cart with current prices.
- Failure, retry, and concurrency: reorder twice quickly adds the quantities once per click, never a hidden duplicate order.
- Logs, metrics, traces, and alerts: nothing new. No tokens, cookies or PII in logs.

## References

- Figma `pg6Emcv2r79FaPdkK17ecE`, node `378:15176` — the target design.
- `apps/app/app/dashboard/orders/[id]/page.tsx` — current page.
- TTW-108 — invoice download. TTW-125 and Q46 — official contacts.
- `AGENTS.md`, `CLAUDE.md`, `docs/tickets/ROADMAP.md`.

## Acceptance criteria

- [ ] The timeline shows the right step for each order status.
- [ ] The shipping method and the payment method are shown.
- [ ] "Contact support" opens the official contact, or is hidden while none exists.
- [ ] "Reorder" fills the cart at current prices and reports unavailable or changed items.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Playwright acceptance coverage is updated in the same change.

## Out of scope

- Invoice download → TTW-108.
- Thumbnails in the order summary and related products on "Purchase Successful" → TTW-160.
- Returns and claims → TTW-149.

## Design review

Not done yet. Required before implementation.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not complete.
