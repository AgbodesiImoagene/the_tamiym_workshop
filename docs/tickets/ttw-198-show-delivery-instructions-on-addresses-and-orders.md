# TTW-198 — Let customers enter delivery instructions and show them on orders

**Epic:** 8 — Client review delivery\
**Status:** Not started\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

Found while scoping TTW-197 (order note). The API already stores delivery instructions, but no screen lets anyone enter or read them. Confirm each point against current `main` before designing: the code may have moved.

- The address API accepts `instructions` (`apps/api/src/addresses/dto/update-address.dto.ts:78`, Swagger in `apps/api/src/addresses/addresses.controller.ts`) and `AddressNormalizationService` keeps it (`apps/api/src/shipping/address-normalization.service.ts:18,203`).
- Order creation copies it to the order as a snapshot, `Order.shipInstructions` (`apps/api/src/orders/orders.service.ts:187,360`). The privacy flow clears it (`apps/api/src/privacy/privacy.service.ts:439`).
- No form in `apps/app` has a field for it. The landmark, stored the same way, does have one: `apps/app/app/dashboard/checkout/page.tsx`, `apps/app/lib/checkout.ts` and `apps/app/lib/profile.ts` handle `landmark` but not `instructions`.
- The customer order response maps the landmark (`apps/api/src/orders/orders.service.ts`, near line 931) and not the instructions, and the order read selects `shipLandmark` (near line 800) and not `shipInstructions`.
- The admin order page (`apps/admin/app/admin/orders/[id]/page.tsx`, "Shipping address" block near line 146) shows name, lines, city, state and phone, with no landmark and no instructions. Whoever prepares the parcel never sees them.

The result: the field is dead data. A customer cannot say "ring twice" or "leave with the guard", and the delivery team could not read it anyway.

## Proposal

- **Entry.** An optional "Delivery instructions" text area next to the landmark in the address form of the account settings and of the checkout, sent as `instructions`. Plain text, trimmed, at most 500 characters (check the API's own limit in the DTO first and use it, or add one there if none exists), empty means none.
- **Order snapshot in the API.** Return `shipInstructions` (and `shipLandmark` if the admin response lacks it) in the customer and admin order responses, from the order's snapshot columns and not from the live address row, so an address edited later does not rewrite what was ordered. Add the fields to the response DTOs, Swagger, shared types and OpenAPI together.
- **Display.** Read-only, as plain text (never HTML), in the "Shipping address" block of the admin order page and in the customer order detail (`apps/app/app/dashboard/orders/[id]`), shown only when present.
- No new column and no migration: the columns already exist.
- Decide in the design review whether the admin page reads the order snapshot or the linked `shippingAddress` row today, and align it on the snapshot for these fields.

## Invariants

- Instructions never change price, shipping zone, stock or payment.
- A saved address with no instructions, and orders created before this ticket, behave exactly as before (`null` is shown as nothing).
- Text is rendered as text. It is never written to logs, metrics or traces.
- The privacy erasure still clears `shipInstructions`.
- The order snapshot is not rewritten when the customer later edits the address.

## Implementation plan

1. Start `codex/ttw-198-show-delivery-instructions-on-addresses-and-orders` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps: API response mapping and DTOs, then the two address forms, then the two order displays. Record any deviation here.
6. Run `pnpm openapi:generate`, commit the generated artefacts, run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit (API): the customer and admin order responses include `shipInstructions` from the snapshot and `null` when absent; editing the address afterwards does not change an existing order's value.
- Unit (frontend): the settings and checkout forms send `instructions`, enforce the length, and prefill from a saved address; the order pages show the text, and nothing when empty.
- Integration on real Postgres: create an address with instructions, place an order, read it back as the customer and as an admin; edit the address and read the order again (unchanged); privacy erasure clears it.
- Playwright: the customer types instructions at checkout, places the order, and the admin sees them on that order. Update `docs/playwright/prd-test-manifest.json` if a new spec file is added.
- Logs, metrics, traces, and alerts: nothing new. No tokens, cookies, PII or provider secrets in logs, and no instructions text either.

## References

- `apps/api/src/addresses/dto/update-address.dto.ts` — `instructions` input.
- `apps/api/src/orders/orders.service.ts` — snapshot copy and order response mapping.
- `apps/admin/app/admin/orders/[id]/page.tsx` — "Shipping address" block.
- `apps/app/app/dashboard/checkout/page.tsx`, `apps/app/lib/profile.ts` — where `landmark` is handled and `instructions` is not.
- `docs/tickets/ttw-197-add-an-order-note-at-checkout.md` — the order note, a separate feature.
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer can enter optional delivery instructions in the account address form and at checkout.
- [ ] The instructions appear, as plain text, on the customer's order and in the admin order's shipping block, taken from the order snapshot.
- [ ] Editing the address later does not change the instructions on an existing order.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Required quality gates pass, with evidence recorded below.
- [ ] Contracts and docs are updated where applicable (OpenAPI, shared types).

## Out of scope

- The order note → TTW-197.
- Changing how addresses are validated, normalised or matched to a state and LGA → TTW-194, TTW-186.
- Showing the instructions in e-mails, labels or notifications.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
