# TTW-217 — Refuse quotes and orders for a state we no longer deliver to

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

TTW-194 made the address routes refuse a deactivated state, and TTW-200/TTW-202 stopped new shipping rules for deactivated states and LGAs. A saved address whose state is deactivated **later** still loads (on purpose, so the customer can edit it), and it is still priced and ordered: the quote and the order read the address and look only at shipping rules and zones (`shipping-destination-resolver.service.ts`), never at `GeoState.isActive` (TTW-194 security review, LOW 2).

**Owner decisions, 2026-11-14 (items 5 and 6 added the same day, answering the two open questions):**

1. If we stop delivering to a state, **no old address in that state can order any more**; the customer is told we do not deliver to their area.
2. The message is clear, in the form "We do not deliver to this area." (UI text is English).
3. **Orders already in progress finish normally.** An order created before the state was deactivated keeps its path: payment, fulfilment, cancellation and refund are not touched.
4. A race at address save time (an address saved at the moment a state is deactivated) is accepted: the quote and the order refuse it anyway.
5. Idempotent replay (choice A): a replay of an order already created with the same key before the deactivation returns the existing order; it is not refused (it is an order in progress).
6. A deactivated **LGA** gets the same rule as a deactivated state: a quote or new order for an address whose LGA is deactivated is refused with the same code and message, with the same guarantees (nothing written, existing orders intact).

Confirm against current `main` before designing: the code may have moved. Entry points seen so far: `PricingService.validateAddressForUser` (`apps/api/src/pricing/pricing.service.ts`, used by `quoteStandard` and `quoteCampaign`) and the address read in `OrdersService.create` (`apps/api/src/orders/orders.service.ts`). Check the campaign order path and any other reader of `shippingAddressId`.

## Proposal

- After the ownership check, refuse a quote or a new order whose address has a `stateCode` that points to a deactivated `GeoState`, **or an `lgaId` that points to a deactivated `GeoLga`**, with a 400 and a stable error code (for example `ADDRESS_STATE_NOT_DELIVERABLE`) and the message "We do not deliver to this area."
- Apply it to standard and campaign (fundraiser) quotes and orders, in one shared place so the quote and the order cannot disagree.
- Do **not** apply it to anything that acts on an order that already exists (payment initiation for an existing order, webhooks, cancellation, refund, shipment). Prove with tests that an order created before the deactivation can still be paid and completed.
- Show the message to the customer in the app checkout and the fundraiser checkout (`apps/app`, `apps/web`) using the existing error display; no redesign. Update Playwright acceptance coverage for the visible behaviour (`docs/playwright/prd-test-manifest.json`).
- Design review questions: both settled by the owner (items 5 and 6 above).
- If the change touches order state transitions, inventory reservation or payment code, raise the ticket to Critical and add the concurrency and idempotency tests that `.cursor/rules/financial-integrity.mdc` requires. A refusal that happens before any write should not need that.

## Invariants

- No order, reservation, ledger entry or payment is created for a refused request.
- Orders that exist keep working end to end.
- Ownership and the other address rules are unchanged.
- The price authority stays the server quote.

## Implementation plan

1. Start `codex/ttw-217-refuse-quotes-and-orders-for-a-state-we-no-longer-deliver-to` from current `main`, in its own worktree. Move this file into it and add the ticket rows to `docs/tickets/README.md` and `docs/tickets/ROADMAP.md`.
2. Confirm the finding and the entry points against the current code, and update this ticket if it moved.
3. Record the design review below (High risk), including the two open questions; ask the user once with the recommendations.
4. Write the tests first and show them failing for the right reason (real Postgres for the refusal and for the existing-order cases).
5. Implement in small steps. Record any deviation here.
6. Run the gates, play the checkout journey in a browser, record exact results below, and obtain the independent implementation review and a security review (High risk).

## Test and observability plan

- Unit: the shared check refuses a deactivated state or LGA, accepts an active one and an address with no state code or no LGA.
- Integration on real Postgres: quote and order refused for an address in a deactivated state (standard and campaign); no order row, reservation or payment created; an order created before the deactivation can still be paid and completed; an address in a deactivated LGA is refused the same way; an idempotent replay returns the existing order.
- Playwright: the customer sees "We do not deliver to this area." in the checkout; no first-party API mocks (`.cursor/rules/playwright-regression.mdc`).
- Logs, metrics, traces, and alerts: no new PII in logs. A counter or log line for refusals is optional; decide in the design review.

## References

- `apps/api/src/pricing/pricing.service.ts` — `validateAddressForUser`.
- `apps/api/src/orders/orders.service.ts` — `create` and the campaign order path.
- `apps/api/src/shipping/shipping-destination-resolver.service.ts` — does not read `GeoState.isActive`.
- `docs/tickets/ttw-194-refuse-a-deactivated-state-on-addresses.md` — origin (security review, LOW 2).
- `docs/orders/ttw-041-interim-policy.md` — order states; read before changing the order domain.

## Acceptance criteria

- [ ] A quote and a new order for an address in a deactivated state or LGA are refused with "We do not deliver to this area."
- [ ] An order created before the deactivation completes normally.
- [ ] Nothing is written for a refused request.
- [ ] The message shows in the app and fundraiser checkouts, with Playwright acceptance coverage.
- [ ] Required quality gates pass, with evidence recorded below.
- [ ] Contracts and docs are updated where applicable.

## Out of scope

- Keeping one state per address (code decides text) → TTW-216.
- Closing the millisecond window at address save time (made harmless by this ticket).
- Cancelling or migrating orders already in progress.

## Design review

Date: 2026-11-14. Risk stays **High** (not Critical): the refusal runs inside the quote, before the order transaction, the stock check and any write. No order state transition, reservation or payment code is touched.

### Findings against current `main`

- Every price and every order goes through `PricingService.quoteStandard` / `quoteCampaign`, and both call the private `validateAddressForUser` (`pricing.service.ts`). `OrdersService.create` and `createCampaignOrder` call those quotes before `$transaction`, so one check in `validateAddressForUser` covers all four routes (`POST /orders/quote`, `POST /campaigns/:id/orders/quote`, `POST /orders`, `POST /campaigns/:id/orders`).
- `shippingAddressId` is read only in `pricing.service.ts` and `orders.service.ts` (checked with `grep`). Payment initiation, webhooks, cancellation, refund and shipment read the order's own snapshot, never the address, so they cannot be affected.
- `Address.stateCode` points to `GeoState` with `onDelete: SetNull`; a deactivated state keeps its row and `isActive = false`.

### Design

0. `shipping/address-deliverability.ts` holds `assertAddressDeliverable`, the one rule, called by `validateAddressForUser` and by the order snapshot.
1. `shipping.errors.ts`: `ADDRESS_STATE_NOT_DELIVERABLE`, message `We do not deliver to this area.`, helper `addressStateNotDeliverable()` (400, same shape as `SHIPPING_ADDRESS_NOT_COVERED`).
2. `validateAddressForUser` reads `geoState.isActive` and `lga.isActive` in the same query as the address (no extra round trip) and, **after** the not-found and ownership checks, refuses when `stateCode` is set and the state is inactive, or `lgaId` is set and the LGA is inactive. Ownership first, so a caller learns nothing about someone else's address. The extra `geoState` and `lga` fields travel with the address into the pricing pipeline, which ignores them.
3. An address with no `stateCode` (non-NG, or legacy text only) is not affected: there is no state to look up. Not a regression, and not widened here.
4. Orders: the quote refuses before any write. After the independent security review (MEDIUM, see below) `OrdersService.create` and `createCampaignOrder` also check the address row they snapshot (read once, with its state and LGA), through the same helper, so a change of address between the order's read and the quote's read cannot get around the rule.
5. Idempotent replay: `create` and `createCampaignOrder` look up an existing order for the key **before** the quote, so a replay of an order created before the deactivation returns that order. Owner choice A (item 5); it is the current behaviour and tests pin it, for a deactivated state and for a deactivated LGA.
6. Front ends: both checkouts already show `apiError.message` in their existing alert. They also clear the previous quote for the stable code, as they do for `SHIPPING_ADDRESS_NOT_COVERED`, so a stale quote cannot stay on screen after a refusal.
7. Deactivated LGA: **applied** (owner decision, item 6), in the same check, with the same code. The stable code keeps the name `ADDRESS_STATE_NOT_DELIVERABLE` although it now also covers an LGA (renaming a published code is not worth it; the message says "area"). The front ends show the message on the API refusal; the form-side hint (state missing from the list) stays state-only, because a deactivated LGA is simply absent from the LGA list and the field is optional.
8. Observability: no counter and no log line. The refusal is a normal 400, already visible in HTTP metrics; adding the address or state to a log would add PII for no gain.

### Threats and invariants checked

- Refusal before any write: no order, reservation, ledger entry or payment (tested by counting rows and `inventoryItem.reserved`).
- Ownership unchanged: another user's address still answers 403, even if its state is deactivated.
- Accepted race (decision 4): an address saved while the state is being deactivated is refused at quote and order time.
- Existing orders: payment initiation and the Paystack settlement of an order created before the deactivation still work (tested end to end).
- No new public surface, no schema change, no migration.

## Implementation reviews

**Security review (independent, fresh context, read-only, 2026-11-14):** PASS under reserve of one MEDIUM.

- MEDIUM, fixed in this ticket: the order read the address (snapshot, fingerprint) separately from the quote. A `PATCH /users/addresses/:id` moving a deactivated-state address to an active state between the two reads let the order pass the quote but ship with the old state in its snapshot. Fix: `assertAddressDeliverable` also runs on the snapshot row in `create` and `createCampaignOrder` (still one `findUnique`, now with `geoState` and `lga`); unit tests in `orders.service.spec.ts` ("snapshot of an address in a deactivated state or LGA"), written first and shown failing (3 failed), then passing.
- LOW, not done here (separate tickets to open, none created): `PATCH { lgaId: null }` removes the LGA and so the refusal (the LGA is optional); an LGA name typed with a double space finds no LGA, saves `lgaId = null`, yet an active ADMIN2 rule still matches because the resolver normalises spaces; the state text can differ from `stateCode` (already TTW-216).
- INFO: ownership is checked before state (no leak), no PII in the message, no new route, the seed users use the existing fixture password and the seed guard (`assertTestDatabase`).

**Implementation review (independent, fresh context, read-only):** FAIL on first pass, no BLOCKING finding, two IMPORTANT and five MINOR, all handled:

- IMPORTANT: this ticket still described the old design (fixed above, statuses and evidence filled).
- IMPORTANT: no browser test played the message that comes back from the API (only the form hint). Added a seeded customer whose address is in an active state but linked to a deactivated LGA, and a Playwright test in the app and in the fundraiser checkout that clicks the quote button and asserts the real 400 `ADDRESS_STATE_NOT_DELIVERABLE`, the message, no order request and the cart kept.
- MINOR: the first e2e test left the state inactive on failure; an `afterEach` now reactivates the state and LGAs. The ROADMAP row said `Bloqué par TTW-194` (closed); now `—`. Not done: a campaign-order idempotent replay test (same code path as the standard one, covered for the standard order), and a real-database test of the snapshot race (hard to reproduce; the unit test isolates it).
- The reviewer then re-read the code after the security fix and found it correct.

## Verification evidence

Run in the worktree, own database `tamiym_workshop_test_ttw217` and `REDIS_DB=7`, API for Playwright on port 3101, apps built with `NEXT_PUBLIC_API_URL=http://localhost:3101/v1`. Results are the last run of each command (see the final run list below).

- Tests first, shown failing: `pricing.service.spec.ts` (3 of 6 new tests failed, then 2 of 8 after the LGA cases were added); `address-state-not-deliverable.e2e-spec.ts` (4 of 5 failed before the code); `checkout-page.test.tsx` (3 failed) and `checkout-errors.test.ts` (3 failed); the form hint test failed with the condition removed; `orders.service.spec.ts` snapshot tests (3 failed).
- Jest e2e on real Postgres, one file at a time: `address-state-not-deliverable` 6/6 (four routes refused for a deactivated state and for a deactivated LGA, 403 for another user, nothing written, replay returns the existing order, an order created before the deactivation is paid and settled), then `order-create-idempotency`, `pricing-quote`, `shipping-zone-coverage`, `payment-initiation`, `order-customer-note`, `order-delivery-instructions` all passed after the security fix; earlier in the ticket also `paystack-charge-settlement`, `paystack-late-payment-refund`, `paystack-refund-lifecycle`, `inventory-lifecycle`, `address-deactivated-state`, `address-deactivated-lga`, `address-lga-state`, `address-edit-state`, `address-clear-lga`.
- Playwright (Chromium, real API, no mocks): see the final run list.
- Final gates: see the final run list.

### Final run list

Last run of each command, after the security fix and the review follow-ups:

- `pnpm typecheck`: exit 0 (6 tasks successful).
- `pnpm lint`: exit 0 (0 errors, existing warnings only).
- `pnpm test`: exit 0 (unit tests of api, app, web, admin, packages).
- `pnpm openapi:generate` then `pnpm openapi:check`: exit 0 (`docs/openapi/openapi.json` and `packages/types/src/openapi.generated.ts` updated for the 400 description).
- `pnpm --filter api test:coverage` exit 0; `pnpm coverage:ratchet` passed; `pnpm coverage:diff`: 9/9 changed lines covered (100%, floor 80%).
- `pnpm format:check`, `pnpm playwright:validate`, `pnpm docs:validate`: pass.
- Jest e2e after the last code change: `address-state-not-deliverable` 6/6 and `seed-e2e-fixture-owned-rows` pass (10/10 together); `order-create-idempotency` 10/10, `pricing-quote` 5/5, `shipping-zone-coverage` 5/5, `payment-initiation` 2/2, `order-customer-note` 6/6, `order-delivery-instructions` 4/4 (earlier in the ticket, before the seed and Playwright changes, which touch no API code).
- Playwright on a fresh database (drop, migrate, `seed:e2e`), own API on port 3101, `chromium-app` and `chromium-web`: 15 passed (setup x5, the two new spec files with two tests each, `checkout-shipping-coverage`, `checkout-idempotency`, `fundraiser-checkout.comprehensive` x4). No first-party API mock; only Paystack is simulated elsewhere.
- Not run: the full Playwright suite (matrix, a11y, visual, admin) and the full Jest e2e suite; only the files above.

## Completion summary

A quote or a new order (standard or fundraiser) for an address whose state or LGA is deactivated is refused with 400 `ADDRESS_STATE_NOT_DELIVERABLE` and "We do not deliver to this area.", before anything is written. One rule (`assertAddressDeliverable`) serves the quote and the order snapshot. Orders already created keep their path, and the same idempotency key returns the existing order. Both checkouts show the message and clear the previous quote; when the saved state is no longer in the list, the form says so instead of "Choose a state from the list.".

Deviations from the plan:

- The stable code keeps the name `ADDRESS_STATE_NOT_DELIVERABLE` although it also covers an LGA.
- The seed gained two customers (`undeliverable.e2e@tamiym.test`, `undeliverable-lga.e2e@tamiym.test`) because no admin route deactivates a state or LGA.
- A form hint was added (state missing from the active list), otherwise the quote button is disabled and the customer never saw the message.
- The orders service changed (snapshot check) after the security review; the ticket first expected no change there.

Not verified or not done:

- A real-database test of the address-change race (unit test only).
- A campaign-order replay test after deactivation (standard order only).
- Open LOW findings above (LGA removal, double-space LGA name, state text vs code) need their own tickets.
- No server-side LGA hint in the form: a deactivated LGA is absent from the optional LGA list, and the refusal appears when the customer asks for the quote.
