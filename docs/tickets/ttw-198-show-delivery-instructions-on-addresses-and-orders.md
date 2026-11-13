# TTW-198 — Let customers enter delivery instructions and show them on orders

**Epic:** 8 — Client review delivery\
**Status:** Complete\
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

- [x] A customer can enter optional delivery instructions in the account address form and at checkout.
- [x] The instructions appear, as plain text, on the customer's order and in the admin order's shipping block, taken from the order snapshot.
- [x] Editing the address later does not change the instructions on an existing order.
- [x] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [x] Required quality gates pass, with evidence recorded below.
- [x] Contracts and docs are updated where applicable (OpenAPI, shared types).

## Out of scope

- The order note → TTW-197.
- Changing how addresses are validated, normalised or matched to a state and LGA → TTW-194, TTW-186.
- Showing the instructions in e-mails, labels or notifications.

## Design review

Confirmed against the code on `main` (f998183) on 2026-11-12. Findings, including two corrections to the Background:

- Confirmed: the address DTOs accept `instructions` (`create-address.dto.ts:75`, `update-address.dto.ts:78`) with `@IsNotEmpty` and no length limit; `AddressNormalizationService` keeps it; `orders.service.ts:187,360` copy it to `Order.shipInstructions`; `privacy.service.ts:439` clears it. No screen reads or writes it.
- **Correction 1: there is no landmark input either.** `landmark` is only a type field in `apps/app/lib/profile.ts` and `checkout.ts`; neither the settings form (`customer-settings-form.tsx`) nor the checkout form has a landmark control (the "landmark" word is only a placeholder of Address Line 2). So "next to the landmark" has no anchor. Decision: add the instructions text area after the postal code in both forms. A landmark input is a different feature, not added here (reported as a follow-up).
- **Correction 2: the admin API already returns the snapshot columns.** `findOneForAdmin` uses `include`, so Prisma returns every `Order` scalar, `shipInstructions` and `shipLandmark` included, next to `shippingAddress`. Only the admin page and its TypeScript type ignore them. No admin API mapping change is needed; the contract is made explicit instead (Swagger description, a unit test locking the fields).
- Customer response: `findOne` selects `shipLandmark` but not `shipInstructions`; the mapping returns `shipping.landmark` only. Add `shipInstructions` to the select and `shipping.instructions` to the mapping and to `CustomerOrderShippingDto`.

**Decision: the admin page reads the order snapshot (`ship*` columns), not the linked `shippingAddress` row.** Today it reads the live `shippingAddress` row, which can be edited (or the link set to null if the address is deleted) after the order is placed. For a person preparing a parcel, the address that was paid for is the right one. The whole "Shipping address" block moves to the snapshot, not only the two new fields, because showing instructions from the snapshot next to a live address would mix two versions of the same address. `shipLine1`, `shipCity`, `shipState` are non-null, so the block is always shown (the "No shipping address recorded" branch disappears for orders; the snapshot is mandatory). Landmark is shown in the same block.

Other decisions:

- **Limit: 500 characters**, added as `@MaxLength(500)` on `instructions` in both address DTOs (none existed). Checked after trim by the service is not needed: the text areas trim before sending, and the DTO bound is the server guarantee.
- **Clearing.** The DTOs reject `''` (`@IsNotEmpty`) and the service keeps the saved value when the field is `undefined`. To remove saved instructions the forms send `null` (`@IsOptional` accepts it, `cleanNullable` turns it into `null`). A new address with nothing typed sends no field.
- **Idempotency.** `order-idempotency.ts` already hashes `instructions`: changing them at checkout rotates the cart key through the existing "address changed" rule, because the instructions are part of the form state compared before quoting.
- **Plain text.** React text nodes only, with `whitespace-pre-wrap` to keep line breaks; no `dangerouslySetInnerHTML`. Never logged: no logging is added on this path.
- **Merge risk with TTW-197** (order note, parallel session): both touch `checkout/page.tsx`, `lib/checkout.ts`, `orders.service.ts` (select, mapping), `customer-order-detail.dto.ts`, the order pages and `openapi.generated.ts`. Changes here are kept to a few lines per file; expect textual conflicts in those files and in the generated OpenAPI.
- Risk stays Standard: no schema change, no auth, upload, queue or payment change.

## Implementation reviews

1. Independent reviewer (fresh agent, read-only), 2026-11-12: **FAIL, one blocking finding.** `instructions` typed `string | null` without an explicit `type` was published as `"type": "object"` in OpenAPI and `Record<string, never> | null` in the generated types (regression for the address DTOs). Fixed with `type: String` on the three properties, `pnpm openapi:generate` rerun: the contract now says `string`, nullable, `maxLength: 500`. Non-blocking: no unit test for the admin page (the admin app has no unit-test setup); covered by Playwright only. Every other point (snapshot source, payload, 500 limit, idempotency key, plain text, privacy erasure, no removed test) was found conforming. 2. Second read-only review of the fix (2026-11-13): **PASS.** Address create/update schemas are `string`, nullable, `maxLength: 500`; the customer order `shipping.instructions` is `string`, nullable; no `Record<string, never>` left for `instructions`; no unexpected change in the two generated files.

## Verification evidence

Run on 2026-11-12 in this worktree, on a dedicated database (`tamiym_ttw198_e2e`, Redis db 7, ports 3100/3101/3103/3112; the shared test database was not used).

- Tests seen failing first, for the right reason: `address-instructions.dto.spec.ts` (501 characters accepted), `orders.service.spec.ts` (`shipping.instructions` undefined), 9 app tests (no "Delivery instructions" field or element). The integration spec was written after the API code and never seen failing.
- `pnpm --filter api test`: 149 suites, 1417 tests passed.
- `pnpm --filter api test:e2e test/order-delivery-instructions.e2e-spec.ts`: 4 passed (customer and admin read the snapshot; address edited then emptied, order unchanged; null for none; privacy erasure clears it).
- `pnpm --filter app test`: first run 105 passed, 1 failed (`product-list-page.test.tsx`), while the API suite was loading the machine. Rechecked on 2026-11-13: that test passes alone 4 times, and the whole app suite passes (12 suites, 106 tests). It was a load-related flake, not a defect of this ticket.
- `pnpm --filter api|app|admin|@tamiym/types typecheck`: exit 0. `pnpm --filter api|app|admin lint`: 0 errors (warnings only in untouched files). Prettier clean on changed files.
- `pnpm openapi:generate` then `node scripts/quality/check-openapi-drift.mjs`: passed. `pnpm playwright:validate`: passed.
- Playwright (`setup` + `chromium-app`): `checkout-delivery-instructions.spec.ts` passed (types at checkout, places the order, customer reads it, admin reads it, address edited afterwards, order unchanged). Existing `settings-clear-lga`, `settings.comprehensive`, `orders.comprehensive` (app) and `orders-workspace.comprehensive` (admin) passed.
- Not caused by this ticket, confirmed on 2026-11-13: `checkout-idempotency.spec.ts` and `checkout-shipping-coverage.spec.ts` both fail at the same step, `Classic Tee` card > "Add to cart" on the product list (Playwright run, `chromium-app`). On this branch the list page has no such button: TTW-092 (commit `fc3e198`, in this branch's base, not yet on `main`) moved it to the product page (`apps/app/app/dashboard/products/[id]/page.tsx`). The same run passed `checkout-delivery-instructions.spec.ts`. These two specs need the new product-page flow; not run against `main`, where the button still exists on the list. Separate ticket.

## Completion summary

- API: `shipping.instructions` in the customer order response (select, mapping, DTO, Swagger), from the order snapshot; admin endpoint documents the `ship*` snapshot fields it already returned; `@MaxLength(500)` on both address DTOs; OpenAPI and shared types regenerated.
- App: optional "Delivery instructions" text area (500 characters) after the postal code in the settings and checkout address forms (`lib/delivery-instructions.ts` holds the shared limit and payload rule: trimmed text, `null` to remove saved text, nothing when never set); read-only plain-text display on the customer order page.
- Admin: the "Shipping address" block now reads the order snapshot (`ship*`), including landmark and delivery instructions, shown only when present. The "No shipping address recorded" branch is gone because the snapshot is mandatory.
- Deviations from the Background: there is no landmark input in any form (the field is not added here); the admin API needed no mapping change.
- Merge risk with TTW-197: `apps/app/app/dashboard/checkout/page.tsx`, `apps/app/lib/checkout.ts`, `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/dto/customer-order-detail.dto.ts`, `apps/app/app/dashboard/orders/[id]/page.tsx`, `docs/openapi/openapi.json`, `packages/types/src/openapi.generated.ts`. Regenerate OpenAPI after merging rather than resolving the generated files by hand.
- Follow-ups: landmark input in the forms; a unit-test setup for the admin app; repair `checkout-shipping-coverage` and `checkout-idempotency` specs for the new product page (TTW-092 flow).
