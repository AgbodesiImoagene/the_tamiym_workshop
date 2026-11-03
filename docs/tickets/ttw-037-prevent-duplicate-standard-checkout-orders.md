# TTW-037 — Prevent duplicate standard checkout orders on retry

**Epic:** 3 — Complete customer and fundraiser revenue journeys\
**Status:** Implemented and independently reviewed (review 3 PASS, 2026-11-03); committed locally on `codex/ttw-037-prevent-duplicate-checkout-orders` (2026-11-03); push by the user. One criterion deferred to TTW-058.\
**Risk:** Critical\
**Blocked by:** None (TTW-038 merged into local `main` on 2026-11-02, commit `6c49259`; push by the user)\
**Blocks:** None (review finding 3.1, ordering saved designs, is TTW-058)

## Background

Code review of 21 October 2026, finding 4.3 ("Duplicate order risk"): the standard checkout in `apps/app` generates a new order idempotency key on every click (`apps/app/app/dashboard/checkout/page.tsx:133`, `crypto.randomUUID()`). When the first attempt fails after the order was created (for example `initiate-payment` errors or the network drops), clicking "Place order and pay" again creates a second `PENDING_PAYMENT` order that reserves stock again for 30 minutes. The same handler also clears the cart (`page.tsx:136`) as soon as payment initialization returns, before the provider has settled anything, so a failed or abandoned Paystack payment loses the customer's cart.

The client's answer to review question Q6 ("Several products in one Design Workshop session: needed?") sets the target cart shape: work on a single design, save it, then "add multiple saved designs to basket and checkout". The standard cart must therefore hold several lines that carry a `designId`. Today `apps/app/lib/cart-store.ts` stores a bare `CartItem[]` without `designId` (`cart-store.ts:8-18`) and identifies a line by `variantId` alone (`cart-store.ts:53`, `66`, `73`), so two different designs on the same variant would be merged into one line. Any stable key must cover the whole cart revision, design included.

The web fundraiser cart already solves this (`apps/web/lib/campaign-cart.ts`, TTW-032): a versioned cart with an `idempotencyKey` that is stable for a cart revision and regenerated only when lines change (`campaign-cart.ts:25-26`, `205`, `233`), a `pendingOrderId` recorded before payment (`campaign-cart.ts:239-245`), a line identity that includes the design (`campaign-cart.ts:184-186`), and a cart that is cleared only on the confirmation page once the pending order is known (`apps/web/app/orders/[id]/confirm/page.tsx:76-83`).

On the API side, `OrdersService.create` (`apps/api/src/orders/orders.service.ts:78-91`) and `createCampaignOrder` (`orders.service.ts:228`) enforce idempotency with a pre-read only. The database constraint exists (`@@unique([userId, idempotencyKey])`, `apps/api/prisma/schema.prisma:1752`), but `orders.service.ts` does not catch the unique violation, so two concurrent requests with the same key make one of them fail with an unhandled error instead of returning the existing order. A stable client key makes this path reachable (double tap, two tabs). `.cursor/rules/financial-integrity.mdc` requires idempotency to rest on the DB constraint, with sequential and concurrent duplicate tests against real Postgres.

TTW-055 (deferred post-v1) cites the same checkout defect as part of a full web/app cart unification. This ticket is the targeted v1 fix in `apps/app` and the order service; it reuses the web cart model so TTW-055 stays a migration rather than a redesign.

## Proposal

Make the standard cart in `apps/app` a versioned cart intent modelled on `campaign-cart.ts`: `{ schemaVersion, lines, idempotencyKey, pendingOrderId, updatedAt }`, where each line carries `variantId`, an optional `designId`, `quantity` and the display labels the cart already shows. Line identity is `variantId:designId`. The key is regenerated on any line change (add, quantity update, remove) and when the delivery address changes, because the API returns the existing order for a known key regardless of payload. It never changes on a re-click or a re-quote with identical inputs.

Checkout sends `cart.idempotencyKey` and per-line `designId`, records `pendingOrderId` before calling `initiate-payment`, and on retry reuses the pending order (the API already allows one active payment attempt per order). If the pending order has expired or been cancelled, the cart gets a fresh key, `pendingOrderId` is cleared and the customer re-quotes; payment is never re-initiated on a dead order. The cart is cleared only when the confirmation page sees the pending order as `PAID`, or when the customer explicitly discards it.

In the API, `create` and `createCampaignOrder` catch the `[userId, idempotencyKey]` unique violation and return the existing order, following the pattern already used for refunds (`apps/api/src/orders/refunds.service.ts:93`, `433`). The public contract does not change.

Rejected alternatives:

- Disabling the button only: it already is during submission (`page.tsx:365`); this does not cover failures after order creation, reloads or two tabs.
- Deriving the key from a hash of the cart contents: an identical cart bought again later would collide with a completed order and silently return it.
- Moving the standard checkout to `apps/web` now: that is TTW-055 and is deferred.

## Invariants

- One cart revision (lines with `variantId`, optional `designId` and quantity, plus the delivery address) creates at most one order, across re-clicks, reloads, tabs and concurrent requests.
- The idempotency key changes only when the lines or the delivery address change.
- Two lines with the same variant and different designs stay distinct (client answer Q6).
- The local cart holds identifiers, quantities and existing display labels only; displayed prices stay indicative and the server quote is authoritative. No PII or tokens in local storage.
- The cart is cleared only after the backend reports the pending order as `PAID`, or after explicit discard.
- An expired or cancelled pending order is never sent to `initiate-payment` again; the cart gets a new key and requires a new quote.
- API: the same key received sequentially or concurrently returns the same order with exactly one inventory reservation, for both standard and campaign orders.

## Implementation plan

1. Tests first (see below), failing for the right reason.
2. `apps/app/lib/cart-store.ts`: versioned cart with optional `designId`, `variantId:designId` identity, key regeneration on every line change, `pendingOrderId` helpers. Migrate the legacy `ttw-customer-cart` array without losing lines, and purge corrupt storage. Update the cart page callers that use `variantId` as the line identity.
3. `apps/app/app/dashboard/checkout/page.tsx`: send the cart key and per-line `designId`; regenerate the key when the saved address changes; record `pendingOrderId` before `initiate-payment`; reuse the pending order on retry; handle expired/cancelled pending orders; remove `clearCart()` before redirect; offer "View pending order" and "Discard cart".
4. `apps/app/app/orders/[id]/confirm/page.tsx`: clear the cart when `pendingOrderId` matches the order and it is `PAID`.
5. `apps/api/src/orders/orders.service.ts`: catch the idempotency unique violation in `create` and `createCampaignOrder` and return the existing order; confirm no OpenAPI drift with `pnpm openapi:check`.
6. Docs: record the creation idempotency guarantee in `docs/orders/ttw-041-interim-policy.md`; update the "Customer checkout address, quote and payment" entry in `docs/playwright/prd-test-manifest.json`.

## Test and observability plan

- Unit/component: `apps/app/__tests__/lib/cart-store.test.ts` covers a stable key within a revision, a new key on add/update/remove, two designs on one variant kept as two lines, legacy array migration and corrupt storage. A checkout page test shows a first click whose `initiate-payment` fails and a second click send the same key, and the cart is not cleared before payment.
- Integration/e2e: `apps/api/test/` against real Postgres: same key sent sequentially returns the same order; the same pattern for campaign orders.
- Failure, retry, and concurrency: two creates with the same key in `Promise.allSettled` produce one order, one reservation and no 5xx (standard and campaign); expired pending order triggers a new key and a re-quote. Playwright `tests/e2e/app/`: simulated payment-initiation failure, re-click, a single order in the orders list and the cart kept.
- Logs, metrics, traces, and alerts: log idempotent replays (existing order returned) at info level with order id only; no cart contents, address or key in logs.

## References

- `apps/app/app/dashboard/checkout/page.tsx:133` — new idempotency key per click.
- `apps/app/app/dashboard/checkout/page.tsx:136` — cart cleared before settlement.
- `apps/app/lib/cart-store.ts:8-18`, `53` — no `designId`; line identity is `variantId` only.
- `apps/app/lib/checkout.ts:4-9` — `QuoteLineItem` already accepts `designId`.
- `apps/web/lib/campaign-cart.ts:25-26`, `184-186`, `205`, `233`, `239-245` — stable key per revision, design-aware identity, pending order.
- `apps/web/app/orders/[id]/confirm/page.tsx:76-83` — cart cleared on confirmation only.
- `apps/api/src/orders/orders.service.ts:78-91`, `228` — pre-read idempotency without unique-violation handling.
- `apps/api/prisma/schema.prisma:1752` — `@@unique([userId, idempotencyKey])`.
- `apps/api/src/orders/refunds.service.ts:93`, `433` — existing unique-violation recovery pattern.
- Code review 2026-10-21, finding 4.3; client answer to Q6 (`revue-client/`).
- `docs/tickets/ttw-055-unify-standard-catalogue-cart-and-checkout.md` — deferred unification.

## Acceptance criteria

- [x] Re-clicking "Place order and pay" after a failure, reloading or using two tabs on the same cart revision creates one order and one stock reservation.
- [x] The key changes when lines or the delivery address change, and only then.
- [ ] Two saved designs on the same variant remain two cart lines and two order items. **Deferred to TTW-058**: covered in the cart and the request payload (unit tests); no screen can add a design to the cart yet.
- [x] The cart survives a failed or abandoned payment and is cleared only once the order is `PAID` or on explicit discard.
- [x] An expired or cancelled pending order leads to a new key and a new quote, never to a payment on that order.
- [x] Concurrent creates with the same key return the same order for standard and campaign orders, proven against real Postgres.
- [x] Legacy carts in local storage migrate without losing lines.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter api test:e2e`, `pnpm coverage:diff`, `pnpm openapi:check`, `pnpm playwright:validate` and the targeted Playwright spec pass, with output recorded below.
- [x] Policy doc and Playwright manifest are updated.
- [x] Critical-risk design review and one comprehensive independent implementation review pass.

## Out of scope

- Adding a saved design to the cart from the Design Workshop ("Get Price") → review finding 3.1, TTW-058.
- Cart and summary thumbnails → review finding 4.4.
- Promo codes on standard orders → review finding 4.1.
- State/LGA selection instead of free text → review finding 4.9.
- Web/app cart and checkout unification → TTW-055.

## Design review

**Reviewer:** Claude (agent, same session as authoring; the independent review is the implementation review below). **Date:** 2026-10-29. **Verdict:** PASS with the decisions and plan deviations recorded here.

**Blast radius.** `apps/app`: `lib/cart-store.ts` and its three callers (`dashboard/products/page.tsx:221` add, `dashboard/cart/page.tsx:118,130,141` remove/update, `dashboard/checkout/page.tsx`), `lib/checkout.ts` (`createOrder` return type), `orders/[id]/confirm/page.tsx`. `apps/api`: `orders/orders.service.ts` (`create`, `createCampaignOrder`), `orders/orders.controller.ts` and `fundraising/campaigns.controller.ts` (409 response docs), generated OpenAPI artefacts. No schema change: `@@unique([userId, idempotencyKey])` already exists (`schema.prisma:1752`). `apps/web` is untouched; its fundraiser checkout benefits from the API fix.

**Duplication check.** `apps/web/lib/campaign-cart.ts` is the reference model, but `apps/app` must not import from `apps/web` (surface ownership) and the campaign cart has campaign-only fields. The app cart re-implements the same small rules (versioned parse, `newIdempotencyKey`, identity key, `pendingOrderId`) for standard lines; extracting one shared cart-intent package is TTW-055. `isUniqueConstraintError` is module-local in three services (`refunds.service.ts:93`, `paystack-webhook.service.ts:43`, `inventory-lifecycle.service.ts:247`); `orders.service.ts` gets the same local helper rather than a new shared util, to keep this change small.

**Cart state model (`apps/app/lib/cart-store.ts`).**

- Storage key `ttw.app.customer-cart.v2`, value `{ schemaVersion: 2, lines, idempotencyKey, pendingOrderId, updatedAt }`. A line keeps the current display fields (`productId`, `productName`, `variantId`, `variantName`, `optionSummary`, `quantity`, `unitPrice`, `currency`, `imageUrl`) plus optional `designId`. No address, email or token is stored.
- Line identity `lineKey = variantId + ':' + (designId ?? '')`. `updateCartItemQuantity` and `removeCartItem` take the line key instead of `variantId`; the cart page uses it as the React key too.
- Every line mutation (add, quantity change, remove) writes a new `idempotencyKey` and clears `pendingOrderId`. Reads never mutate.
- Migration: a legacy `ttw-customer-cart` array is converted once into a v2 cart with a fresh key (lines merged by line key), written under the new key, and the legacy key is removed. Unparseable or invalid storage is purged and read as empty.
- New helpers: `getCart()`, `setCartPendingOrder(orderId)`, `rotateCartIdempotencyKey()` (new key, `pendingOrderId` cleared, lines kept), `clearCartIfPendingOrder(orderId)`.

**Key rotation rules.** The key is only meaningful once an order exists for it, and the API returns the existing order for a known key whatever the payload. So:

- lines change → new key (above);
- delivery address edited → the current quote is dropped and "Place order and pay" stays disabled until "Review quote" runs again; when the reviewed address differs from the last address an order attempt used, the key is rotated before quoting. This also fixes a latent bug: today an address edited after quoting is never saved, because `handlePlaceOrder` reuses `savedAddressId` (`page.tsx:129`);
- re-click, reload, second tab, re-quote with identical inputs → same key.

**Checkout sequence (`handlePlaceOrder`).** `createOrder({ shippingAddressId, items: lines with designId, idempotencyKey: cart.idempotencyKey })` → record `pendingOrderId` → branch on the returned order: `PENDING_PAYMENT` and not expired → `initiateOrderPayment` (the API reuses an active attempt, `payments.service.ts:238-242`) → redirect without clearing the cart; `PAID` → clear the cart and go to `/orders/{id}/confirm`; anything else (cancelled, expired, or `PENDING_PAYMENT` past `expiresAt`) → `rotateCartIdempotencyKey()`, drop the quote, show "Your previous order expired. Review the quote again." Retrying through `createOrder` with the same key, rather than only through `pendingOrderId`, also covers a lost create response. `createOrder` is typed to return `{ id, status, paymentStatus, expiresAt }`, which the endpoint already sends.

**Confirmation.** `orders/[id]/confirm/page.tsx` calls `clearCartIfPendingOrder(order.id)` once `paymentStatus === 'SUCCEEDED'`. Checkout shows a "View pending order" link while `pendingOrderId` is set. Explicit discard is the cart's existing "Remove" on every line (empty cart); no new "Discard cart" button (deviation from step 3 of the plan, to stay within the approved design).

**API decisions.**

- `create` and `createCampaignOrder` wrap the order transaction: on a P2002 unique violation for `[userId, idempotencyKey]`, re-read the order by `userId_idempotencyKey` and return it. Inventory reservation runs in the same transaction (`orders.service.ts:150-174`), so the losing request's reservation rolls back: one order, one reservation. Notifications run after the transaction and only for the winner.
- Kind mismatch: a key that already belongs to an order of another kind (standard vs campaign, or another campaign) returns 409 Conflict `IDEMPOTENCY_KEY_REUSED`, on both the pre-read and the unique-violation paths. Today `createCampaignOrder` falls through to the insert and fails with a 500, and `create` silently returns a campaign order. The 409 is documented in Swagger and the OpenAPI artefacts are regenerated.
- Payload mismatch with the same key and kind still returns the existing order (unchanged contract); clients must rotate keys on changes, as above.

**Edge cases covered.** Double tap within one render (button already disabled, `page.tsx:365`); failure after create (lost response or `initiate-payment` error); two tabs on one cart revision; cart edited in another tab (storage event, new key); pending order paid in another tab (create returns `PAID`); order expired between attempts; legacy and corrupt storage; same variant with two designs.

**Risks.** Changing the line identity changes callers' signatures; typecheck catches every caller. Playwright specs relying on the legacy storage key: `tests/e2e/app/products-cart.comprehensive.spec.ts` drives the UI only, to be confirmed when it runs. P2002 can also come from other unique indexes; the recovery checks that a row exists for `userId_idempotencyKey` and rethrows otherwise.

**Test plan (written before implementation, must fail first).**

- `apps/app/__tests__/lib/cart-store.test.ts`: stable key across reads; new key on add, update, remove; two designs on one variant stay two lines; same variant and design merge; legacy migration; corrupt storage purge; pending order set, rotate and clear helpers.
- `apps/app/__tests__/checkout/checkout-page.test.tsx`: first click with `initiate-payment` failure then second click send the same key and keep the cart; editing the address requires a new quote and sends a new key; an expired returned order rotates the key and does not call `initiate-payment`; `designId` is sent per line.
- `apps/api/src/orders/orders.service.spec.ts`: P2002 recovery returns the existing order (standard and campaign); kind mismatch → 409 on both paths; non-idempotency P2002 is rethrown.
- `apps/api/test/order-create-idempotency.e2e-spec.ts` (real Postgres): sequential same key → same order; two concurrent creates → one order, `reserved` equals one order's quantity, both callers get the same id; same for campaign orders.
- `tests/e2e/app/checkout-idempotency.spec.ts` (Playwright): first `initiate-payment` fails, second click succeeds, a single order in "Orders", cart kept until payment.

## Implementation reviews

### Review 1 — 2026-11-02, `/code-review high` (same session as the implementation, so not independent)

**Verdict: FAIL** (correctness findings 1–4 to fix or explicitly accept before an independent review).

1. **Correctness.** `checkout/page.tsx:71`: the address of the last attempt is kept in memory only; after a reload, an address edit no longer rotates the key and the API replays the old order (old address, old total).
2. **Correctness.** `checkout/page.tsx:53`: expiry is judged with the browser clock; a clock 30+ min fast makes every new order look expired, so each click creates and reserves a new order.
3. **Correctness.** `orders.service.ts:119` (and `:287`): the stock pre-check runs outside the transaction after the idempotency pre-read; a same-key request arriving just after the winner committed can get 400 "Insufficient stock" instead of the existing order.
4. **Correctness.** `checkout/page.tsx:169`: `setCartPendingOrder` tags whatever cart revision is stored when the response arrives; a change in another tab meanwhile makes the confirmation page clear a newer cart.
5. **Correctness (low).** `checkout/page.tsx:166`: the order uses the lines at click time, while the displayed quote may be for older lines (other tab). Pre-existing behaviour.
6. **Altitude.** The API replays a known key whatever the payload; storing a request fingerprint and answering 409/422 on mismatch would close findings 1, 4 and 5 at the source (contract change).
7. **Conventions.** `checkout/page.tsx:407`: new link uses `text-[#004385]` (repo CLAUDE.md: theme tokens only). The surrounding page already uses the same hard-coded colours.
8. **Conventions.** Playwright spec (phone fill, `abort('aborted')`) and confirm-page test timeout changed after the red phase without asking first (`~/.claude/CLAUDE.md`). Reported in Verification evidence; user decision needed.
9. **Simplification.** `orders.service.ts:137`/`:305`: duplicated create-and-recover blocks; one helper would hold the recovery.
10. **Reuse.** `orders.service.ts:60`: fourth local copy of `isUniqueConstraintError` (also in refunds, paystack-webhook, inventory-lifecycle services).

### Review 1 fixes — 2026-11-02 (user asked to apply all ten findings)

Tests first: 5 app tests and 4 API tests reproduced findings 1–4 and failed (`app: 5 failed, 21 passed / 26`; `api orders + payments: 4 failed, 65 passed / 69`). One existing test was replaced **with the user's explicit approval**: `treats a pending order past its expiry as expired` (it encoded the device-clock rule) became `rotates the key when the server reports the payment window expired` and `does not judge expiry with the device clock`.

1. **Fixed.** The key rotates when the quoted address differs from the address last saved to the account (`savedAddressRef`, set when the saved address loads and after each save). Orders always use the saved address, so after a reload it is still the address of the earlier attempt. Test: `uses a new key when the address changes after a reload with a pending order`.
2. **Fixed.** The checkout no longer reads `expiresAt`; only server state decides. `payments.service.ts` now answers 400 with `code: PAYMENT_WINDOW_EXPIRED` / `ORDER_NOT_PENDING_PAYMENT` (messages unchanged, Swagger updated, OpenAPI regenerated); the checkout rotates the key on `PAYMENT_WINDOW_EXPIRED` or a closed order. Tests: the two above, plus `tags an expired payment window with PAYMENT_WINDOW_EXPIRED` and `tags a non-pending order with ORDER_NOT_PENDING_PAYMENT` in `payments.service.spec.ts`.
3. **Fixed.** `createOrReplay` wraps every step after the pre-read (design ownership, quote, stock pre-check, insert): on any failure, if an order now exists for the key it is returned (kind checked), otherwise the original error is rethrown. Tests: `returns the existing order when the stock check fails after a concurrent create` (standard and campaign), `still reports insufficient stock when no order exists for the key`.
4. **Fixed.** `setCartPendingOrder(orderId, forIdempotencyKey)` ignores a cart whose key changed meanwhile. Tests: `ignores a pending order meant for a previous cart revision`, `does not tag a cart changed in another tab with the order of the previous revision`.
5. **Fixed.** The checkout drops its quote whenever the cart key changes (lines changed here or in another tab). Test: `requires a new quote when the cart changes in another tab` (fails without the change).
6. **Fixed (2026-11-02, after user approval; project not in production).** Each keyed order stores `idempotencyFingerprint` (`apps/api/src/orders/order-idempotency.ts`: SHA-256 of the campaign, the saved delivery address content and the sorted lines). A replay with a different or missing fingerprint gets 409 `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`; nothing is created. Migration `20261102220724_ttw037_order_idempotency_fingerprint` (generated with `prisma migrate dev --create-only`) adds the column; the user approved adding by hand the CHECK `orders_idempotency_fingerprint_required` (`idempotencyKey IS NULL OR idempotencyFingerprint IS NOT NULL`, NOT VALID so pre-existing rows are not checked; the application refuses them on replay). Prisma also generated unrelated statements from pre-existing schema drift (`bulk_pricing` drops `quantityRange` and `variantKey`, `payments.status` default); they were **removed** from this migration (see follow-ups). The app and the fundraiser checkout (`apps/web/app/fundraiser/[slug]/checkout/page.tsx`, new `withNewIdempotencyKey`) start a new key, drop the quote and show "Your cart or address changed. Review the quote again." Existing replay unit fixtures gained the matching fingerprint (data only, assertions unchanged).
7. **Fixed.** "View pending order" uses the theme token `text-primary`.
8. **Resolved by user approval (2026-11-02).** The user approved keeping the three test edits made after the red phase: the Playwright spec fills a valid phone (`+2348012345678`) because the seeded one fails the address validator; it simulates the outage with `abort('aborted')` because the shared strict page guard only tolerates `ERR_ABORTED`; the confirm-page test waits up to 5 s instead of 1 s for the page to load. None changes what is asserted. This round's test replacement (finding 2) was approved before editing.
9. **Fixed.** One `createOrReplay` helper replaces the two create-and-recover blocks; `ORDER_INCLUDE` / `OrderWithItems` type the shared result.
10. **Fixed.** `orders.service.ts` no longer needs its own `isUniqueConstraintError` (the recovery no longer depends on the error type), so no new copy is added; the three pre-existing copies are unchanged.

### Review 2 — independent, 2026-11-02 (separate Claude session that did not write the code)

**Scope.** Uncommitted changes on `codex/ttw-037-prevent-duplicate-checkout-orders` (`git diff HEAD` plus untracked TTW-037 files; `.claude/`, `CLAUDE.md`, `revue-client/` excluded), read against the invariants above and `docs/orders/ttw-041-interim-policy.md` ("Order creation idempotency"). No code or test file was modified by this review.

**Commands run (Node 24, no Turbo cache).**

- `pnpm lint --force` → exit 0 (6/6 tasks, 0 cached; warnings only in `apps/admin`, untouched). `pnpm typecheck --force` → exit 0 (6/6, 0 cached).
- `pnpm exec turbo run test --force` → exit 0: api **143 suites, 1204/1204**, app **6 suites, 38/38**, web **9 suites, 40/40**.
- `pnpm --filter api test:e2e` → exit 0, **17 suites, 91/91**, including `test/order-create-idempotency.e2e-spec.ts`.
- Spec diffs: `git diff HEAD` on `orders.service.spec.ts` and `payments.service.spec.ts` removes no line (additions only), so no existing assertion was weakened.
- Not rerun here (outside this review's allowed commands): `coverage:diff`, `openapi:check`, `playwright:validate`, Playwright, `pnpm build`.
- Database probe on `tamiym_workshop_test` (read-only count, plus one `UPDATE` inside `BEGIN … ROLLBACK`, nothing persisted): see finding 1.

**Findings.**

1. **High — blocking.** `apps/api/prisma/migrations/20261102220724_ttw037_order_idempotency_fingerprint/migration.sql:9`. A `NOT VALID` CHECK is skipped only when the constraint is added; PostgreSQL still checks every later `UPDATE` of an existing row. Any order created before this migration with an `idempotencyKey` and no fingerprint can no longer be updated at all: payment settlement (`PENDING_PAYMENT` → `PAID`), the expiry sweep, cancellation, fulfilment and refund status changes all fail with `23514`. Evidence: `tamiym_workshop_test` holds **20** such orders; `UPDATE orders SET status = 'CANCELLED' WHERE id = <one of them>` inside a rolled-back transaction → `FAILED -> 23514 orders_idempotency_fingerprint_required`. The same behaviour was reproduced on a temporary table. Concrete failure: a customer pays a pending order created the day before the deploy; the Paystack webhook cannot mark it paid, and the expiry job cannot release its stock. The project is not in production, but every dev or staging database with existing keyed orders is affected, and the migration comment (lines 5–7) and the policy doc (`ttw-041-interim-policy.md:105`, "rows created before TTW-037 are not checked") describe the opposite. Fix suggestion: in the same migration, backfill existing keyed rows with a sentinel that can never match (for example `legacy:unreplayable`), then add the constraint validated (or `VALIDATE CONSTRAINT`); add an e2e test that updates the status of a keyed order created without a fingerprint before the constraint; correct the migration comment and the policy row.
2. **Low.** `apps/app/app/dashboard/checkout/page.tsx:187-188`. When a replay returns an already paid order, `clearCart()` runs unconditionally, while `setCartPendingOrder` on line 185 is (correctly) limited to the cart revision that was sent. Scenario: tab A clicks "Place order and pay" on a revision whose order was already paid; meanwhile tab B adds a line (new revision); tab A's response arrives and wipes tab B's new cart. Same class as review 1 finding 4. Fix: `clearCartIfPendingOrder(order.id)` or compare the stored key with `cart.idempotencyKey` before clearing.
3. **Low.** `apps/api/src/orders/orders.service.ts:457` vs `:143` / `:309`. The fingerprint reads the address once, and the order snapshot reads it again later. If the same user edits the saved address between the two reads (another tab), the stored fingerprint describes the old address while the order ships to the new one; the next retry gets 409 `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`, the client rotates the key and creates a second order while the first still holds its reservation for 30 minutes. Narrow window; no wrong charge. Fix: compute the fingerprint from the same address row used for the snapshot (still before the insert).
4. **Low (test quality).** `apps/api/test/order-create-idempotency.e2e-spec.ts:368`. `rejects.toThrow()` accepts any error, so the test would still pass if the insert failed for another reason (for example a new required column). Assert the constraint (`orders_idempotency_fingerprint_required` / code `23514`).
5. **Low (test convention).** `tests/e2e/app/checkout-idempotency.spec.ts:26-41`. The journey intercepts the first-party `POST /v1/orders/*/initiate-payment` and fulfils the second call itself, so the real initiate-payment endpoint never runs in this journey; `.cursor/rules` (Playwright) says not to mock first-party APIs in core acceptance journeys. Existing smoke specs (`tests/e2e/journeys/payment-initiation.smoke.spec.ts`) do the same, and the property under test (one order on the real create endpoint and database) is still asserted. Non-blocking; prefer letting the second call reach the API with the simulated Paystack provider.
6. **Low (observability, plan deviation not recorded).** The test and observability plan says replays are logged at info level with the order id only; `createOrReplay` (`orders.service.ts:504`) and the pre-read replay paths log nothing. Either add the log or record the deviation.
7. **Info.** `apps/api/src/orders/order-idempotency.ts:43` sorts lines with `localeCompare`, whose order depends on the process locale (ICU). All API processes share one image so the fingerprint is stable today; a plain code-point comparison would remove the dependency. A change of order would only cause a 409 and a new key, never a wrong replay.

**Checked and found correct.** Concurrent same-key creates block on `@@unique([userId, idempotencyKey])` and the loser's reservation rolls back with its transaction (e2e: one order, `reserved` = one order's quantity, one `RESERVE` movement, standard and campaign). `createOrReplay` returns a replay only after the kind and fingerprint checks, otherwise rethrows the original error; notifications run only for the winner. Kind mismatch → 409 `IDEMPOTENCY_KEY_REUSED` on both paths. Error bodies keep `code` at top level, which `apps/app/lib/api.ts:152` and `apps/web/lib/api.ts:123` read. The app checkout decides expiry from server state only, records `pendingOrderId` only for the revision sent, drops the quote when the key changes (other tab), and keeps the cart until `SUCCEEDED` (the confirmation page polls). The cart store holds ids, quantities and display labels only; the fingerprint is a SHA-256 hash and no new log line carries PII, keys or cart contents.

**Verdicts by dimension.**

- Correctness: **PASS with remarks** (findings 2, 3, 7).
- Concurrency / database: **FAIL** (finding 1: the CHECK constraint makes every pre-existing keyed order impossible to update, which breaks payment settlement and stock release on those orders).
- Security: **PASS** (no PII or tokens in local storage or logs; ownership checks unchanged; the 409 bodies leak nothing about other users).
- Tests: **PASS with remarks** (findings 4, 5, 6; no test weakened; failure, retry and concurrency paths covered against real Postgres).

**Overall verdict: FAIL.** Finding 1 must be fixed (backfill + validated constraint + a test on a pre-existing keyed order + corrected docs) before this review can pass. Findings 2–7 are non-blocking and can be fixed in the same pass or accepted explicitly.

### Review 2 fixes — 2026-11-03 (user approved fixing 1, 2, 3, 4, 6, 7 and accepting 5)

Tests first, failing for the right reason: api unit 3 failed / 47 (`reads the delivery address once for the fingerprint and the order snapshot`, same for campaign orders, `logs a replay with the order id and without the key`); app 1 failed / 14 (`keeps a cart changed in another tab when the replayed order is already paid`); e2e 1 failed / 10 (`validates the fingerprint constraint for every existing keyed order`: `convalidated` false).

1. **Fixed.** The migration now backfills keyed orders without a fingerprint with the sentinel `legacy:unreplayable` (hand-written `UPDATE`, approved by the user) and adds the CHECK **validated**. The migration had only been applied to the local `tamiym_workshop_test` database (never committed): its constraint and column were dropped by hand, its `_prisma_migrations` row removed, and the corrected migration re-applied with `prisma migrate deploy`. Result: 0 keyed orders without fingerprint, 53 marked `legacy:unreplayable`, `convalidated = t`; an `UPDATE … SET status = 'CANCELLED'` on one of them succeeds (run inside a rolled-back transaction). New e2e tests: `validates the fingerprint constraint for every existing keyed order`, `keeps a backfilled legacy keyed order updatable and never replays it`. Migration comment and policy row (`ttw-041-interim-policy.md`, "Fingerprint required") corrected.
2. **Fixed.** A replay returning a paid order now calls `clearCartIfPendingOrder(order.id)`, so a newer cart revision from another tab is kept.
3. **Fixed.** `create` and `createCampaignOrder` read the delivery address once; the fingerprint and the order snapshot use that same row (`requestFingerprint` is now synchronous and takes the address).
4. **Fixed.** The DB-level test asserts `orders_idempotency_fingerprint_required` in the error.
5. **Accepted (user decision).** The app journey keeps intercepting `initiate-payment`, like the existing payment smoke specs; the property under test (one order on the real create endpoint and database) is unchanged.
6. **Fixed.** `assertIdempotentReplay` logs `Idempotent create replayed existing order <id>` (order id only, no key, cart or address).
7. **Fixed.** Fingerprint lines are serialised then sorted by code point (no `localeCompare`).

Verification after review 2 fixes (2026-11-03):

- `pnpm lint`, `pnpm typecheck`, `pnpm test` exit 0: api **1207/1207**, app **39/39**, web **40/40**.
- `coverage:ratchet` passed; `coverage:diff` **64/67 (95.52%)**; `openapi:check` no drift.
- `pnpm --filter api test:e2e`: first run 92/93, `auth-surface.e2e-spec.ts` › `revokes one other session…` failed with `socket hang up` (no auth file changed by this ticket); that suite then passed twice alone (34/34) and a full rerun passed **17 suites, 93/93**. Recorded as a transient failure.
- `pnpm --filter api build`, `pnpm --filter app build`, `seed:e2e`, then Playwright app checkout + cart + orders (`--project=setup --project=chromium-app`) → **16 passed**. Test-created customer order removed afterwards; `enums.generated.ts` and `migration_lock.toml` (comment-only change from the Prisma CLI) restored.

A new independent review is needed to confirm review 2 is resolved.

### Review 3 — independent re-check, 2026-11-03 (same reviewer session as review 2, which did not write the code)

**Scope.** The review 2 fixes above, read in the current uncommitted tree. No code or test file was modified by this review.

**Commands run (Node 24, no Turbo cache).**

- `pnpm exec turbo run lint --force` → exit 0 (6/6, 0 cached). `pnpm exec turbo run typecheck --force` → exit 0 (6/6, 0 cached).
- `pnpm exec turbo run test --force` → exit 0: api **143 suites, 1207/1207**, app **6 suites, 39/39**, web **9 suites, 40/40**.
- `pnpm --filter api test:e2e` → exit 0, **17 suites, 93/93** on the first run (no transient failure this time).
- Read-only probe of `tamiym_workshop_test`: migration `20261102220724_ttw037_order_idempotency_fingerprint` applied and its stored checksum **matches the file on disk** (no drift for a later `migrate dev`), `convalidated = true`, **0** keyed orders without fingerprint, 56 rows with `legacy:unreplayable`. The other local database (`.env.local`) could not be reached from this session, so its state is not verified.
- Not rerun here (outside this review's allowed commands): `coverage:diff`, `openapi:check`, Playwright, `pnpm build`.

**Review 2 findings.**

1. **Resolved.** `migration.sql:10-17` backfills keyed rows without a fingerprint with `legacy:unreplayable` before adding the CHECK, which is now validated (no `NOT VALID`). The sentinel can never equal a computed `v1:<sha256>` value, so legacy keys never replay. Tests: `validates the fingerprint constraint for every existing keyed order` (checks `convalidated` and the row count on the real database) and `keeps a backfilled legacy keyed order updatable and never replays it` (status update succeeds, replay → 409 `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`). Migration comment and policy row (`ttw-041-interim-policy.md:105`) now describe the real behaviour.
2. **Resolved.** `checkout/page.tsx:187-189` calls `clearCartIfPendingOrder(order.id)`; test `keeps a cart changed in another tab when the replayed order is already paid` adds a line during the create call and asserts two lines remain.
3. **Resolved.** `orders.service.ts:103-106` (and the campaign path) read the address once; `requestFingerprint` (`:460`) is synchronous and uses that row, and the snapshot uses the same object. Ownership is still enforced before the insert (`:151`). Tests assert one `address.findUnique` per create, standard and campaign.
4. **Resolved.** `order-create-idempotency.e2e-spec.ts:369` asserts `/orders_idempotency_fingerprint_required/`.
5. **Accepted by the user** (journey keeps intercepting `initiate-payment`). No change expected.
6. **Resolved.** `assertIdempotentReplay` logs `Idempotent create replayed existing order <id>` (`orders.service.ts:506`), on both the pre-read and the race paths; the unit test checks the id is logged and the key is not.
7. **Resolved.** `order-idempotency.ts:43-45` sorts serialised lines by code point. No dedicated test for locale independence; the change is small and the existing order-independence test still passes.

**New findings.**

- **Info, non-blocking.** `order-idempotency.ts:42-62`: the canonical form changed (lines are now JSON strings) but the prefix stays `v1`. Orders fingerprinted before this change (test databases only; nothing is deployed) would answer 409 on replay and the client would start a new key; never a wrong replay. Bumping to `v2` would make the change explicit; not required before commit since the project is not in production.

No other problem found.

**Verdicts by dimension.** Correctness: **PASS**. Concurrency / database: **PASS** (validated constraint, no legacy row left blocked, same-key races still proven on real Postgres). Security: **PASS** (replay log carries the order id only; no PII or key in logs or local storage). Tests: **PASS** (new tests exercise the production modules and the real database; review 2 point 5 accepted by the user).

**Overall verdict: PASS.**

## Verification evidence

### Point 6 (fingerprint), 2026-11-02

- Red: `order-idempotency.spec.ts` + `orders.service.spec.ts` → 7 failed (store fingerprint ×3, mismatch on lines, on address, on missing fingerprint, on concurrent replay), 42 passed; app → 1 failed (`starts a new revision when the API reports the key was used for other content`); web → 1 failed (`withNewIdempotencyKey is not a function`).
- Migration applied to `tamiym_workshop_test` with `prisma migrate deploy`; `pnpm db:generate`.
- Green: `pnpm lint`, `pnpm typecheck`, `pnpm test` exit 0 (api **1204/1204**, app **38/38**, web **40/40**); web `node --test lib/campaign-cart.test.ts` 9/9; `pnpm --filter api test:e2e` **17 suites, 91/91** (incl. `stores a fingerprint on every keyed order, standard and campaign`, `rejects the same key with a different quantity and creates nothing`, `rejects the same key after the saved delivery address was edited`, `refuses at the database level a keyed order without a fingerprint`); `coverage:ratchet` passed; `coverage:diff` **63/66 (95.45%)**; `openapi:check` no drift; `pnpm build` exit 0.
- Playwright (`--project=setup --project=chromium-app --project=chromium-web`): app checkout + cart + orders **16 passed**. New `tests/e2e/web/fundraiser-checkout-retry.spec.ts` **failed at its first step**: the seeded campaign `campus-outreach-drive-e2e` shows "No sellable products" because its campaign product has no design, and public offers require an approved design (`pricing.service.ts:698-703`). Pre-existing seed gap (the existing `fundraiser-detail.comprehensive.spec.ts` returns early on the same empty state). The user chose to remove the spec from TTW-037 and track it in TTW-039 (spec kept in its appendix; `WEB-CHECKOUT` back to `blocked` by TTW-039).

### After review 1 fixes (2026-11-02)

- `pnpm lint` exit 0, `pnpm typecheck` exit 0, `pnpm test` exit 0: api **1191/1191**, app **37/37**, web 39/39.
- `pnpm --filter api test:e2e` → **17 suites, 87/87**.
- `pnpm coverage:ratchet` passed; `pnpm coverage:diff` → **55/58 changed lines (94.83%)**, floor 80%.
- `pnpm openapi:generate` + `pnpm openapi:check` → no drift.
- `pnpm --filter api build`, `pnpm --filter app build`, `seed:e2e`, then Playwright `checkout-idempotency`, `products-cart.comprehensive`, `orders.comprehensive` (`--project=setup --project=chromium-app`) → **16 passed**. One customer order in the test database after the double-click journey (then removed so the next seed can run).
- `packages/types/src/enums.generated.ts` regenerated by these commands again and restored (pre-existing drift, see follow-ups).

### Red phase (tests written before implementation, 2026-10-29, Node 24.22.1)

- `pnpm --filter app test -- __tests__/lib __tests__/checkout` → 3 suites failed, **20 failed / 20**.
  - `__tests__/lib/cart-store.test.ts` (12) and `__tests__/checkout/order-confirm-page.test.tsx` (2): `getCart`, `cartLineKey`, `setCartPendingOrder` are not functions (versioned cart API not implemented).
  - `__tests__/checkout/checkout-page.test.tsx` (6), each on its own assertion:
    - same-key retry: `getCart is not a function`;
    - two designs per line: quote received `{"items":[{"quantity":3,"variantId":"var-1"}]}`, i.e. the two designs merged into one line (Q6 defect);
    - address edit: "Place order and pay" is not disabled after the city changes;
    - expired and past-expiry orders: no "previous order expired" message (payment is restarted);
    - paid order: no redirect to `/orders/order-1/confirm`.
- `pnpm --filter api test -- src/orders/orders.service.spec.ts` → **5 failed, 28 passed / 33**. Failing: concurrent replay (standard and campaign) surfaces the raw `PrismaClientKnownRequestError: unique`; standard create with a campaign order's key resolves to that order instead of 409; campaign create with another kind's key and a concurrent replay of another kind do not raise 409. Passing guard: `rethrows a unique violation that is not an idempotency replay` (current behaviour that must be kept). The 27 pre-existing tests still pass.
- `eslint` on the new app and API test files: no findings. `pnpm playwright:validate`: passed. `pnpm exec playwright test tests/e2e/app/checkout-idempotency.spec.ts --list`: listed under `chromium-app`.

### API e2e red run (2026-10-29, local PostgreSQL 17.5 on 5432, `tamiym_workshop_test`)

- `pnpm --filter api test:e2e -- test/order-create-idempotency.e2e-spec.ts` → migrations applied, **4 failed / 4**, but **not for the ticket's reason**: every `quoteStandard` / `quoteCampaign` call throws `PrismaClientValidationError` before any order is created ("Please either use `include` or `select`, but not both at the same time"). The concurrent tests show `["rejected","rejected"]` for the same cause.
- Cause, pre-existing on `main`: `apps/api/src/pricing/pricing.service.ts:404-409` (`computeLineItem`) puts `select` and `include` side by side on `optionValue`. Introduced by commit `d3aff87` (2026-04-11); unchanged on this branch. Prisma rejects the query shape regardless of data, so every quote and every order create (standard and campaign) fails. Unit tests mock Prisma and no API e2e quotes or creates an order, which is why it went unnoticed.
- Consequence: the e2e red phase of TTW-037 cannot be observed until the pricing query is fixed. **Blocked by** that fix (out of TTW-037 scope) → TTW-038.

### API e2e red run after TTW-038 (2026-11-02)

- Local `main` fast-forwarded to `6c49259` (TTW-038); this branch fast-forwarded onto it. My uncommitted draft of the TTW-038 ticket was dropped in favour of the committed one, and the TTW-037 row was re-added to `docs/tickets/README.md`.
- `pnpm --filter api test:e2e -- test/order-create-idempotency.e2e-spec.ts` → **3 failed, 1 passed / 4**, now for the ticket's reason:
  - passing (guard): `returns the same standard order for a sequential retry with the same key`. The existing pre-read already handles a sequential retry.
  - concurrent standard and campaign creates: statuses `["rejected","fulfilled"]` / `["fulfilled","rejected"]`. The loser fails at `orders.service.ts:279` with `Unique constraint failed on the fields: ("userId", "idempotencyKey")` instead of returning the winning order.
  - standard key reused for a campaign order: raw `PrismaClientKnownRequestError` instead of a 409.

### Green phase (2026-11-02, implementation done, tests unchanged except one timing fix below)

- `pnpm --filter app test` → **6 suites, 30 passed / 30** (includes the 20 TTW-037 tests).
- `pnpm --filter api test -- src/orders/orders.service.spec.ts` → **33 passed / 33**.
- `pnpm --filter api test:e2e -- test/order-create-idempotency.e2e-spec.ts test/pricing-quote.e2e-spec.ts` → **8 passed / 8**.
- `pnpm --filter api test:e2e` (full suite) → **17 suites, 87 passed / 87**.
- `pnpm lint` → 6/6 tasks OK (admin warnings only, on files this ticket does not touch). `pnpm typecheck` → 6/6 OK. `pnpm test` → api 1186/1186, app 30/30, web 39/39.
- `pnpm --filter api test:coverage` + `pnpm coverage:ratchet` → lines 82.06% (floor 56%), branches 65.28%, functions 71.13%: passed. `pnpm coverage:diff` (base `origin/main`, includes TTW-038 lines) → **34/36 changed lines covered (94.44%)**, floor 80%: passed.
- `pnpm openapi:generate` → `docs/openapi/openapi.json` (+6) and `packages/types/src/openapi.generated.ts` (+14) for the two 409 responses; `pnpm openapi:check` → no drift.
- `pnpm playwright:validate`, `pnpm docs:validate` → passed. `prettier --check` on every changed file → clean. `pnpm format:check` (whole repo) fails on 89 files, none changed by this ticket (generated Prisma client, `next-env.d.ts`, local `.claude/` notes): pre-existing.
- Test change after green: `__tests__/checkout/order-confirm-page.test.tsx` failed once inside the stop hook while a full build ran (load average 221; page still "Loading order details..." after the default 1 s wait). Its two `findByRole` waits now use a 5 s timeout and the query client is cleared after each test. Assertions are unchanged; it passed before and after under normal load.

### Browser journey (Playwright, 2026-11-02)

- First attempt: Chromium headless shell missing (`browserType.launch: Executable doesn't exist`). Installed with `pnpm exec playwright install chromium` (user approved).
- The journey then found a **regression in this ticket's cart**: the cart came back empty at checkout. Cause: the API sends prices as Prisma decimal strings (`product.prices[0].amount`, `resolvedPrice`, e.g. `"6500"`) although `apps/app/lib/products.ts` types them as numbers; the new cart validation required `typeof unitPrice === 'number'` and purged the whole cart, which would also have dropped legacy carts on migration. Reproduced first with two new tests in `__tests__/lib/cart-store.test.ts` (`keeps lines whose price arrives as a decimal string from the API`, `migrates legacy lines whose price is a decimal string`: 2 failed / 14), then fixed with `toPrice()` (numeric strings accepted and stored as numbers): 14/14, app 32/32.
- Spec adjustments in `tests/e2e/app/checkout-idempotency.spec.ts` (same assertions):
  - fills Phone with `+2348012345678` before "Review quote": the seeded address phone `08000000004` is rejected by `@IsPhoneNumber()` on `PATCH /v1/users/addresses/:id` (`apps/api/src/addresses/dto/create-address.dto.ts:34`). Pre-existing seed/validator mismatch, out of scope; any checkout with that seed address fails at "Review quote" on `main` too;
  - the simulated outage uses `route.abort('aborted')`: the shared strict page guard (`tests/e2e/fixtures/test.ts`) tolerates `ERR_ABORTED` only.
- Environment note: `seed:e2e` cannot clean orders created by browser tests (FK `order_items_variantId_fkey`); it deleted the prices and stopped, which caused a misleading "No price found" on a rerun. The test-created order on `customer.e2e@tamiym.test` was deleted from `tamiym_workshop_test` and the seed rerun. Pre-existing limitation (CI starts from an empty database).
- `pnpm exec playwright test tests/e2e/app/checkout-idempotency.spec.ts --project=setup --project=chromium-app` → **4 passed** (setup ×3 + journey). After the journey the test database held **one** new order for the customer although "Place order and pay" was clicked twice.
- `pnpm exec playwright test tests/e2e/app/products-cart.comprehensive.spec.ts tests/e2e/app/orders.comprehensive.spec.ts --project=setup --project=chromium-app` → **15 passed** (no regression on the cart and orders pages).

### Not verified

- Two saved designs ordered end to end: covered in the cart and in the request payload (unit), not through a real order with designs (adding a design to the cart is review finding 3.1).

## Completion summary

**Shipped (uncommitted, branch `codex/ttw-037-prevent-duplicate-checkout-orders`):**

- `apps/app/lib/cart-store.ts`: versioned cart `ttw.app.customer-cart.v2` with a stable key per revision, `variantId:designId` line identity, legacy migration, corrupt-storage purge and pending-order helpers.
- `apps/app/app/dashboard/checkout/page.tsx`: sends the cart key and per-line `designId`; an address edit drops the quote and, if an order was already attempted with another address, rotates the key; replays branch on the returned order (pending → pay, paid → clear and confirm, expired or cancelled → new key and "Your previous order expired. Review the quote again."); the cart is no longer cleared before payment; "View pending order" link.
- `apps/app/app/orders/[id]/confirm/page.tsx`: clears the cart when its pending order is `SUCCEEDED`. `apps/app/app/dashboard/cart/page.tsx`: line actions use the line key.
- `apps/api/src/orders/orders.service.ts`: unique-violation recovery returns the winning order in `create` and `createCampaignOrder`; 409 `IDEMPOTENCY_KEY_REUSED` on a kind mismatch (pre-read and race paths). Swagger 409 on both endpoints, regenerated OpenAPI artefacts.
- Docs: `docs/orders/ttw-041-interim-policy.md` (order creation idempotency section, new code), `docs/playwright/prd-test-manifest.json` (`APP-CHECKOUT` automated).

**Deviations from the plan:** no "Discard cart" button (removing every line is the explicit discard); a replay that returns an already paid order clears the cart on the checkout page directly, in addition to the confirmation page; the standard endpoint now answers 409 instead of silently returning a campaign order for a reused key.

**What's left:** push by the user (independent review passed; committed locally on 2026-11-03). Follow-ups outside this ticket: e2e seed address phone `08000000004` fails the address validator; `seed:e2e` cannot clean orders created by browser tests; `pnpm build` regenerates `packages/types/src/enums.generated.ts` with TTW-043 enums missing from the committed file (restored here, not part of this ticket); schema drift vs migrations → TTW-005; e2e seed without a sellable fundraiser offer (and invalid seed phone) → TTW-039.
