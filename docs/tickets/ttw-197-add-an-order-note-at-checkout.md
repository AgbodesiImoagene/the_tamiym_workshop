# TTW-197 — Add an order note at checkout

**Epic:** 8 — Client review delivery\
**Status:** Not started\
**Risk:** High\
**Blocked by:** TTW-092\
**Blocks:** None

## Background

Split from TTW-092. The client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings", row 2.2) lists an order note among the things the Figma "Product Info" page should offer. TTW-092 did not build it, because there is nowhere to send it: `CreateOrderDto` (`apps/api/src/orders/dto/create-order.dto.ts`) has no note field, and a control that saves nothing is not allowed. Confirm each point against current `main` before designing.

What exists today, and why it is not the same thing:

- `Order.shipInstructions` (`apps/api/prisma/schema.prisma`, model `Order`) is a snapshot of the saved address's delivery instructions, copied in `apps/api/src/orders/orders.service.ts` (lines near 187 and 360). It is about reaching the door, it is tied to the address, and no checkout or admin screen in `apps/app` or `apps/admin` shows it.
- There is no free-text field about the order itself (for example "pack the two hoodies separately", "logo slightly smaller").

## Proposal

The user decided not to wait for the client's answer. This is the recommendation, to be confirmed or changed in the design review:

- **One optional note on the order**, not one per line and not on the address. Column `Order.customerNote` (`String?`), plain text, trimmed, at most 500 characters, empty means none.
- **Entered at checkout**, in the order summary, because that is the last place where the customer sees the whole order. The product page of TTW-092 stays free of it, so the note does not depend on which product or size was added last.
- **Sent with `CreateOrderDto`** as `customerNote`, stored on the order, and **shown read-only** on the customer's order detail and on the admin order detail (as plain text, never rendered as HTML).
- **Part of the idempotency payload**: the same idempotency key with a different note is a conflict, like any other order field (`apps/api/src/orders/order-idempotency.ts`).
- **Erased with the other personal data** in the privacy flow (`apps/api/src/privacy/privacy.service.ts`, next to `shipInstructions`).

Rejected alternatives:

- Note per cart line (`OrderItem.note`): the cart merges lines by `variantId:designId`, so two adds of one variant with different notes would need a new merge rule and a cart schema change, for little benefit.
- Reusing `shipInstructions`: it is an address snapshot, so a note would leak into the saved address or be lost on the next edit.
- Note on the product page as in Figma: the same product can be added several times and across several products, so it is unclear which order the note belongs to. Position in the Figma file to be checked in the design review (the Figma was not readable when TTW-092 was done).

## Invariants

- The note never changes price, stock, shipping, or payment. It is stored text only.
- The server trims it and refuses more than 500 characters; the client limit is a convenience.
- It is never written to logs, metrics, or traces (it may contain personal data).
- An order created without a note is unchanged: the field is optional and existing orders keep `null`.
- Idempotent order creation (TTW-037) keeps its guarantees: same key and same payload returns the same order.

## Implementation plan

1. Start `codex/ttw-197-add-an-order-note-at-checkout` from current `main` (after TTW-092 is merged), in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below (High risk) before implementing, including the Figma position.
4. Write the tests first and show them failing for the right reason.
5. Add the column with `prisma migrate dev --name add_order_customer_note` (CLI-generated migration only), the DTO field with validation and Swagger, the service write, the idempotency fingerprint, and the privacy erasure.
6. Run `pnpm openapi:generate` and `pnpm --filter @tamiym/types generate:enums` if affected, and commit the generated artefacts.
7. Add the checkout field and the read-only display in `apps/app` and `apps/admin`.
8. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit (API): the DTO accepts none, a short note, exactly 500 characters; refuses 501 and non-strings; trims whitespace; a blank note is stored as `null`.
- Unit (frontend): the checkout field counts characters, blocks above 500, and sends `customerNote`; the order detail pages show the note as text and nothing when empty.
- Integration on real Postgres: create an order with a note and read it back through the customer and admin endpoints; same idempotency key with the same note returns one order; same key with a different note is refused; an order without a note still works; privacy erasure clears the note.
- Playwright: the customer adds a note at checkout, pays through the Paystack simulator, and the admin sees the note on that order. Update `docs/playwright/prd-test-manifest.json` if a new spec file is added.
- Logs, metrics, traces, and alerts: nothing new; check that no log line carries the note.

## References

- `apps/api/src/orders/dto/create-order.dto.ts` — no note field today.
- `apps/api/src/orders/orders.service.ts` — order creation and the `shipInstructions` snapshot.
- `apps/api/src/orders/order-idempotency.ts` — the payload fingerprint.
- `apps/api/src/privacy/privacy.service.ts` — personal-data erasure.
- `docs/tickets/ttw-092-build-product-detail-page.md` — design review, gap recorded.
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer can type an optional note of up to 500 characters at checkout, and the order stores it.
- [ ] The note is visible, as plain text, on the customer's order and on the admin order.
- [ ] The same idempotency key with a different note is refused; with the same note it returns the same order.
- [ ] The privacy erasure clears the note, and no log line contains it.
- [ ] Required quality gates pass, with evidence recorded below.
- [ ] Contracts and docs are updated where applicable (OpenAPI, shared types, migration).

## Out of scope

- A note per cart line or per product.
- Showing the note in e-mails or in notifications to the operations inbox.
- Changing how `shipInstructions` is stored or shown.
- Letting the admin edit or reply to the note.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
