# TTW-197 — Add an order note at checkout

**Epic:** 8 — Client review delivery\
**Status:** Done (local commit, awaiting merge after TTW-092)\
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

- [x] A customer can type an optional note of up to 500 characters at checkout, and the order stores it.
- [x] The note is visible, as plain text, on the customer's order and on the admin order.
- [x] The same idempotency key with a different note is refused; with the same note it returns the same order.
- [x] The privacy erasure clears the note, and no log line contains it.
- [x] Required quality gates pass, with evidence recorded below.
- [x] Contracts and docs are updated where applicable (OpenAPI, shared types, migration).

## Out of scope

- A note per cart line or per product.
- Showing the note in e-mails or in notifications to the operations inbox.
- Changing how `shipInstructions` is stored or shown.
- Letting the admin edit or reply to the note.

## Design review

High risk (schema change on `Order`, new customer free text, idempotency contract, personal-data erasure). Recorded 2026-11-12 before implementation, on the local TTW-092 commit `fc3e198` (not yet on `main`; this branch starts from it, so TTW-197 must be merged after TTW-092).

**Finding confirmed on the current code.**

- `apps/api/src/orders/dto/create-order.dto.ts` has `shippingAddressId`, `items`, `idempotencyKey` only; the global `ValidationPipe` uses `whitelist` and `forbidNonWhitelisted`, so a `customerNote` sent today is refused with a 400.
- `Order.shipInstructions` is copied from `address.instructions` in `OrdersService.createOrder` and `createCampaignOrder` (`orders.service.ts`, lines 187 and 360). `CustomerOrderDetailDto` does not expose it and the admin page does not show it.
- `findOne` (customer) uses an explicit `select`, so a new column must be added there and to `CustomerOrderDetailDto`. `findOneForAdmin` uses `include`, so every scalar column, including the new one, is returned to the admin app; `AdminOrderDetail` (`apps/admin/lib/dashboard.ts`) must declare it.
- The privacy erasure blanks the `ship*` snapshot with `tx.order.updateMany({ where: { userId } })` (`privacy.service.ts`, near line 428). The privacy export lists orders with `id, status, currency, totalAmount, createdAt` only.
- Figma: the file is not in the repository and was not readable for TTW-092, so the position of the note in "Product Info" cannot be checked. The decision (note at checkout) comes from the user and rests on the reasons in "Proposal". If Figma shows something else, that is a design follow-up, not a blocker.

**Decisions.**

1. **Storage.** `Order.customerNote String?` (`TEXT`, no database default, nullable). Existing rows stay `NULL`. The migration is produced by `prisma migrate dev --name add_order_customer_note`; it is a pure `ADD COLUMN`, so there is no table rewrite or lock beyond a catalogue change, and no backfill. No database `CHECK` on length: the limit is a product rule enforced by the DTO, and a later change of the limit must not need a migration. (Critical-risk database enforcement is not required at High.)
2. **DTO.** `customerNote?: string | null`, `@IsOptional`, `@IsString`, `@MaxLength(500)` applied after a `@Transform` that trims strings and turns a blank string into `null`. Non-strings are not coerced (`enableImplicitConversion` is on in the pipe, so the property is typed `string | null` and covered by a test through a real `ValidationPipe` with the application's options). Swagger: `required: false`, `nullable: true`, `maxLength: 500`.
3. **Length counted in UTF-16 code units** (what `MaxLength` and the browser `maxLength` both count), so client and server agree.
4. **Idempotency.** The fingerprint gains the note only when it is non-null, so every existing fingerprint (`v1:` digests already stored on orders created before this ticket) stays valid and a replay of an old key still works; a request with no note produces the same digest as before. A note makes the digest differ, so the same key with another note, or with a note added or removed, returns `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH` (409), like any other field. The version prefix stays `v1`: the canonical form for the existing inputs does not change.
5. **Both creation paths.** Standard orders and campaign orders both read `dto.customerNote`, store it, and pass it to the fingerprint, because both accept `CreateOrderDto`.
6. **Customer read.** Added to `CustomerOrderDetailDto` and the `select`; the customer sees only their own note (existing ownership check unchanged).
7. **Admin read.** Returned by `findOneForAdmin` through the existing admin guard; shown read-only on the admin order page. No admin endpoint writes it. It is not added to the admin order list.
8. **Frontend.** A labelled optional textarea in the checkout order summary with a live "n / 500" counter and `maxLength={500}`; the note is sent with `createOrder`. The note lives in component state only (not in `localStorage` or the cart store: it can be personal data). Editing the note after an order was already created for the current cart revision makes the API answer `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`; the page already handles that code by rotating the key and asking for a new quote, and its message is widened to say "cart, address or note". Display uses React text nodes with `whitespace-pre-wrap`, never `dangerouslySetInnerHTML`.
9. **Privacy.** Erasure sets `customerNote: null` in the same `updateMany` as the `ship*` snapshot, in the same transaction. The privacy export gains `customerNote` on each order, because it is the customer's own personal data (right of access) and costs one selected column; after erasure it is `null`.
10. **No other behaviour.** The note is not read by pricing, quote, inventory, shipping, payment, webhooks, refunds, e-mail or notifications.

**Security review.**

- _Stored XSS:_ the note is untrusted text shown to staff. Both apps render it as a React text node; a test puts `<img src=x onerror=alert(1)>` in the note and checks the DOM has text and no element. The API returns JSON only.
- _Injection:_ Prisma parameterised writes; no raw SQL.
- _Abuse:_ 500 characters cap enforced server side; the global JSON body limit and rate limits are unchanged. A note cannot change prices, so there is no fraud lever.
- _Access control:_ customer reads go through `findOne(userId, id)` (404 for other users' orders); admin reads stay behind the admin role guard. Covered by integration tests (another customer receives 404).
- _Logging:_ no `Logger` call in the order path prints the DTO or the note; the global HTTP log redacts only `req.body.password` and does not log bodies. A unit test asserts the logger spies receive no call containing the note. The validation error message from `class-validator` never contains the submitted value.
- _Privacy:_ the note is personal data (it may hold names, phone numbers, delivery hints). Erasure and export are handled above. Retention follows the order record, as for the `ship*` snapshot.

**Concurrency / failure paths.** Unchanged transaction: the note is written in the same `order.create`, so a rolled-back reservation leaves no note. The concurrent same-key race already resolved by `@@unique([userId, idempotencyKey])` compares fingerprints, which now include the note, so two concurrent requests with different notes cannot both succeed.

**Observability.** No new metric, log or alert (a counter by "has a note" would add personal-data-adjacent cardinality for no operational value).

**Rejected, in addition to the Proposal.** A database length `CHECK` (see decision 1); storing the note in the cart store or `localStorage`; showing it in the admin list (long free text in a table).

**Tests first.** (a) Unit: DTO through `ValidationPipe`, fingerprint, orders service (stored for both creation paths, replay, mismatch, no log), customer detail mapping, privacy erasure and export. (b) Integration on a real database: create with a note and read back through the customer and admin endpoints; same key same note returns one order; same key another note is refused; no-note orders unchanged; another customer gets 404; erasure clears the note. (c) Frontend: checkout counter, block above 500, payload, XSS text-only on both order pages. (d) Playwright: note typed at checkout, paid through the simulator, seen by the admin.

## Implementation reviews

**Review 1 (independent sub-agent, read-only, 2026-11-12): FAIL, then findings handled.**

- Security core confirmed in code: server validation, stored XSS (React text nodes), access control, logs, backward-compatible fingerprint, migration (`ADD COLUMN` only), erasure and export, OpenAPI regenerated.
- Fixed: the 409 descriptions in `orders.controller.ts` and `campaigns.controller.ts` now name the note (OpenAPI regenerated); `docs/privacy/ttw-025-data-inventory.md` and `docs/orders/ttw-033-interim-policy.md` updated; the 500 limit in `CustomerOrderDetailDto` now uses `ORDER_NOTE_MAX_LENGTH`.
- Deviation from the design review (decision 8), accepted and recorded: when the customer edits the note after an order exists for the current key, the page rotates the key and creates a new order straight away, without a new quote. The previous pending order stays `PENDING_PAYMENT` until its normal expiry, the same behaviour as an address change. The 409 message stays "Your cart or address changed. Review the quote again." because an existing test pins that text and the message is only reached after a page reload.
- **User decisions (2026-11-13):** (1) the checkout warns the customer, before the click, that changing the note after an order exists will create a new order ("Changing the note will create a new order. The previous unpaid order will expire on its own."); tests `warns that changing the note...` and `shows no warning before any order exists`. (2) No `sessionStorage`: a later order must never inherit an old note, so a lost note on return is preferred.
- **Residual risk, accepted by the user (2026-11-13):** the sent note lives in component state only (it is personal data, so it is not put in `localStorage`). If the customer goes to Paystack, comes back with the browser Back button (page reload, empty field, same key) and places the order again without retyping the note, the API answers 409, the page starts a new revision, and the order is then created without the note, with only the generic message. Decision: accept it; the note is not kept in `sessionStorage`.
- Not done, noted: the e2e integration test calls services rather than HTTP; the admin app has no unit test runner (its display is covered by Playwright only); `findAllForAdmin` returns the note in the API payload (not shown in the list UI, admin-only endpoint); a NUL character in any text field gives a 500 (existing behaviour of the whole API).

## Verification evidence

Environment: dedicated database `tamiym_ttw197_e2e` (migrations deployed), `REDIS_DB=7`, servers on ports 3400-3403 (ports 3100-3103 were taken by another session, whose servers a first Playwright run hit by mistake; that run is discarded).

- Tests first, seen failing: API unit 13 failed / 73 passed (`create-order.dto.spec`, `order-idempotency.spec`, `orders.service.spec`, `privacy.service.spec`); API integration `order-customer-note.e2e-spec.ts` 4 failed / 2 passed; frontend 7 failed / 26 passed.
- After implementation: API unit `jest src/orders src/privacy` 16 suites, 262 tests passed; API integration (`order-customer-note`, `order-create-idempotency`, `privacy-lifecycle`) 3 suites, 19 tests passed; app `jest` checkout + orders 37 passed (after the warning was added); app `tsc` and `lint` clean.
- Playwright `tests/e2e/app/checkout-order-note.spec.ts` (setup + chromium-app, own servers): 4 passed, including the customer typing the note, the customer order page and the admin order page showing it as text.
- `tsc --noEmit`: api, app, admin, types clean. `pnpm --filter app lint`: 0 problems. `pnpm --filter admin lint`: 0 errors (21 existing warnings). `pnpm --filter api lint`: 0 errors (14 warnings). Prettier clean on changed files.
- `pnpm openapi:generate` run after the last change; `pnpm openapi:check`: contract drift check passed. API `tsc --noEmit` clean; API unit rerun after the last change: 16 suites, 262 tests passed.
- Whole `apps/app` jest run: 100 tests, 1 failure in a TTW-092 file (product list or detail page) when the machine was loaded; the two TTW-092 suites pass alone (16 tests). Not touched by this ticket.
- Pre-existing, not caused by this ticket: `tests/e2e/app/checkout-idempotency.spec.ts` fails on this base because it still clicks "Add to cart" on the product list, which TTW-092 replaced with a link. It needs its own fix.

## Completion summary

Done on branch `codex/ttw-197-add-an-order-note-at-checkout`, one local commit, nothing pushed. The dedicated database `tamiym_ttw197_e2e` and Redis db 7 were removed at the end. Must be merged after TTW-092 (this branch starts from its commit `fc3e198`).
