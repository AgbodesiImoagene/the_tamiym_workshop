# TTW-086 — Reject addresses outside every shipping zone

**Epic:** 8 — Client review delivery\
**Status:** In progress (implemented on its branch, not merged)\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-087, TTW-098

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 5.6, ₦0 shipping when the address matches no zone** (Critical, P0, 3–5 h, status "To do"): No error or alert: the fee is zero and the workshop pays for delivery.

Client answers:

- **Q22, Address outside every zone: reject the order, or apply a default rate?** Answer: "Will check but for now reject. We need to communicate this clearly on handover to the admins so they can enter all their available zones accurately. Could also be an admin setting."

## Proposal

- When no rate matches the address, the quote and order creation fail with a stable error code instead of a ₦0 fee.
- Standard and fundraiser checkouts show a clear English message and keep the cart.
- Record in the handover notes that admins must enter all their zones (client request, Q22).

## Invariants

- No order is created with a ₦0 shipping fee because a zone was missing.
- An explicit ₦0 rate set by an admin stays valid.
- A retry after a corrected address still works (TTW-037).

## Implementation plan

1. Start `codex/ttw-086-reject-addresses-outside-shipping-zones` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: no matching rate, explicit ₦0 rate, matching rate.
- Integration: quote and order create for an uncovered address.
- Playwright: the checkout shows the message and the cart survives.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/pricing/pricing.service.ts:300` — row 5.6 (the client review cited line 297; the fallback is at 300 on `f9bdf0b`)
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] An address outside every zone cannot be ordered, and the customer understands why.
- [x] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [x] Swagger, shared contracts, migrations and docs are updated where applicable.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- An admin setting for a default rate: the client mentions it as an option, not for now.
- State and LGA lists → TTW-087.

## Design review

Recorded 2026-11-08, before implementation. Plan approved by the user on 2026-11-08.

**Finding confirmed on `main` (f9bdf0b).**

- `PricingService.runPipeline` (`apps/api/src/pricing/pricing.service.ts:300`) sets `shippingFee = shippingBreakdown ? shippingBreakdown.appliedFee : 0`. `computeShipping` (:1049) returns `null` in two cases: no zone matches the address (`shipping/shipping-destination-resolver.service.ts:70`, legacy Nigeria area lookup at :142/:161), or the zone has no active rate (`shipping/internal-zone-rate-provider.service.ts:50`).
- An explicit ₦0 rate set by an admin returns a breakdown with `appliedFee: 0`, not `null`. Testing for `null` keeps that rate valid.
- `POST /v1/orders/quote` and `POST /v1/campaigns/{id}/orders/quote` return the ₦0 fee to the customer today. `POST /v1/orders` and `POST /v1/campaigns/{id}/orders` already refuse it (`orders/orders.service.ts:654`, `assertShippingResolved`), but with a plain message and no stable code.
- Both carts live in `localStorage` (`apps/app/lib/cart-store.ts`, `apps/web/lib/campaign-cart.ts`) and are only cleared after an order is created, so they already survive a refused checkout.

**Design.**

1. New stable code `SHIPPING_ADDRESS_NOT_COVERED`, exported from `apps/api/src/shipping/shipping.errors.ts` (same style as `orders/order-idempotency.ts`).
2. `computeShipping` throws `BadRequestException({ code, message })` when no breakdown is found. Message: "We don't deliver to this address yet. Please check the state and LGA, or use another delivery address." Both quotes and both order creations go through `runPipeline`, so all four routes refuse.
3. A `warn` log records the reason (`NO_ZONE` or `NO_RATE`), the country code, the state code and the zone id, so admins can spot a missing zone. No street, city, name or user id.
4. `assertShippingResolved` stays as a defence and gains the same code. Its message is unchanged (an existing unit test pins it).
5. The refusal happens before the order transaction and before any stock reservation. No order row is written and the idempotency key is not consumed, so a retry after a corrected address works (TTW-037).
6. Contract: `shippingBreakdown` stays nullable in the DTO to keep the diff small. The four endpoints document the new 400 code in Swagger; contracts are regenerated.
7. Frontends: the standard checkout (`apps/app`) and the fundraiser checkout (`apps/web`) recognise the code, show a fixed English message in their existing error area, show no total, and leave the cart alone. No visual redesign.
8. Docs: shipping step of `docs/pricing-strategy.md`, and an admin handover note `docs/runbooks/shipping-zone-coverage.md` (client request, Q22).

**Invariants and how they hold.**

- No order is created with a ₦0 fee because a zone was missing: the only fallback to 0 is removed, and order creation calls the same pipeline before its transaction.
- An explicit ₦0 rate stays valid: only a missing breakdown is refused.
- A retry after a corrected address works: nothing is written on refusal.

**Tests planned (written first).**

- Unit (`pricing.service.spec.ts`): no zone, zone without rate, explicit ₦0 rate, normal rate. The file's shared mocks currently return "no zone", so every quote test relied on the ₦0 fallback. The shared mock changes to "zone with an explicit ₦0 rate", which keeps every existing price assertion unchanged.
- Unit (`orders.service.spec.ts`): the stable code on order creation.
- Integration (`apps/api/test/shipping-zone-coverage.e2e-spec.ts`, real Postgres): HTTP quote returns 400 with the code; standard and campaign order creation write no order and reserve no stock; a retry with the same idempotency key after correcting the address succeeds; an explicit ₦0 rate still creates an order.
- Playwright (`tests/e2e/app/`): an uncovered state shows the message, the cart survives, and a covered state quotes again.
- Fundraiser checkout: `WEB-CHECKOUT` is blocked by TTW-039 in the Playwright manifest, so it gets a unit test or a manual browser run, recorded below.

**Environment note.** This worktree uses its own test database (`tamiym_workshop_test_ttw086`) and `REDIS_DB=14`, so it does not collide with the TTW-083 session, which migrates `AuthToken` in the shared test database.

## Implementation reviews

**Review 1 — 2026-11-08, independent sub-agent, one comprehensive charter (correctness, financial integrity, security/privacy, tests, frontend, contracts). Verdict: PASS.** No blocker or major finding. It confirmed that the only ₦0 fallback is gone, that all four routes go through `runPipeline`, that an explicit ₦0 rate is kept, and that the refusal happens before `assertInventoryAvailable` and before `$transaction`. It also confirmed that an error thrown inside `createOrReplay` cannot replay a wrong order (the fingerprint includes the address), that the log carries no PII, and that no existing assertion was weakened.

Findings and outcome:

1. Minor — nothing pinned the PII-free content of the new log. **Fixed:** `pricing.service.spec.ts` "logs the reason and coarse location only, never the street or city".
2. Minor — the fundraiser page handlers have no page-level automated test, only the helper. **Not fixed here:** the web Jest setup runs in `node` without React Testing Library, and the full journey belongs to TTW-039 (`WEB-CHECKOUT` blocked). The journey was played in a browser (see evidence). Left for TTW-039.
3. Nit — `QuoteResult.shippingBreakdown` stays nullable although it is now always set. **Kept** by design (smaller contract diff).
4. Nit — the defence-in-depth message in `assertShippingResolved` differs from the canonical one. **Kept:** an existing unit test pins it, and clients read `code`.
5. Nit — the Playwright context was not closed in a `finally`. **Fixed.**

Out of scope, reported by the reviewer and found during the Playwright work: `address-normalization.service.ts:116-120` keeps the previous `stateCode` when a customer edits a state to a name that does not resolve. An address changed from Lagos to an unrecognised state is still priced at the Lagos rate instead of being refused. This is not a ₦0 fee, so it is outside this ticket's invariant, but it belongs to the same family of wrong shipping fees. To handle in TTW-087 (state and LGA lists) or a new ticket.

## Verification evidence

Run on 2026-11-08 in the worktree, against the isolated test database `tamiym_workshop_test_ttw086` (`REDIS_DB=14`).

**Tests written first, failing for the right reason.**

- `pricing.service.spec.ts`: the three refusal tests failed with `Received value: undefined` (the quote resolved at ₦0 instead of throwing). Every existing test still passed with the new shared mock, and no existing assertion was changed.
- `orders.service.spec.ts`: "gives the stable SHIPPING_ADDRESS_NOT_COVERED code…" failed (no `code` in the body).
- `shipping-zone-coverage.e2e-spec.ts`: 4 of 5 failed, including `Expected: 400, Received: 200` on the HTTP quote, which reproduces row 5.6 against real Postgres. The explicit ₦0 test passed before and after.
- `checkout-page.test.tsx`: the 3 new tests failed (no alert shown). `checkout-errors.test.ts` (web) failed with "Cannot find module".

**Gates after the change.**

| Command                                                         | Result                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                     | 6/6 tasks successful, 0 errors. The warnings in `pricing.service.ts` (lines 395–936, `no-unsafe-assignment`) are pre-existing and outside the changed lines.                                                                                                                                                            |
| `pnpm typecheck`                                                | 6/6 tasks successful                                                                                                                                                                                                                                                                                                    |
| `pnpm format:check`                                             | All matched files use Prettier code style                                                                                                                                                                                                                                                                               |
| `pnpm test`                                                     | api 1316 passed, app 45 passed, web 43 passed                                                                                                                                                                                                                                                                           |
| `pnpm --filter api test:e2e`                                    | 24 suites, 145 tests passed (including `shipping-zone-coverage.e2e-spec.ts`, 5/5)                                                                                                                                                                                                                                       |
| `pnpm openapi:check`                                            | OpenAPI contract drift check passed                                                                                                                                                                                                                                                                                     |
| `pnpm playwright:validate`                                      | Playwright manifest validation passed                                                                                                                                                                                                                                                                                   |
| `pnpm docs:validate`                                            | Documentation validation passed                                                                                                                                                                                                                                                                                         |
| `pnpm coverage:ratchet`                                         | passed (lines 82.88% ≥ 56.00%)                                                                                                                                                                                                                                                                                          |
| `pnpm coverage:diff`                                            | 12/12 changed lines covered (100%) vs `origin/main`                                                                                                                                                                                                                                                                     |
| Playwright `checkout-shipping-coverage.spec.ts`                 | passed, then 3/3 with `--repeat-each=3 --workers=1` (including runs that start from an existing Lagos address)                                                                                                                                                                                                          |
| Playwright `--project=chromium-app --project=chromium-journeys` | 64 passed, 3 skipped, 1 failed: `campaign-authoring.comprehensive.spec.ts` "fundraiser hub controls" gets a 500 from `GET /v1/organiser/applications/eligibility`. It fails the same way locally with `main`'s API rebuilt in place (checked), and passes in CI on `main` (run 42476342523). Not caused by this ticket. |

**Fundraiser checkout (web), played in a browser.** `WEB-CHECKOUT` stays blocked by TTW-039: the seed has no campaign product with a design, and the fundraiser cart requires one. For this check only, a temporary Playwright script attached an existing design to the seeded campaign product in the isolated database. It confirmed that an uncovered state shows the message, shows no quote and keeps the cart, and that Lagos then quotes ₦2,000. The script was deleted and the database recreated afterwards. Screenshots were kept outside the repository.

## Completion summary

**Done.**

- API: `PricingService.computeShipping` refuses an uncovered address (no zone, or a zone without an active rate) with 400 `SHIPPING_ADDRESS_NOT_COVERED` (`apps/api/src/shipping/shipping.errors.ts`), and logs a PII-free warning. The two quote routes and the two order-creation routes all refuse. Nothing is written, and a retry with the same key after the address is corrected works. An explicit ₦0 rate stays valid.
- Swagger: 400 descriptions on the four routes; contracts regenerated.
- Standard checkout (`apps/app`) and fundraiser checkout (`apps/web`): fixed English message in an `alert`, no total shown, cart kept.
- Docs: `docs/pricing-strategy.md` shipping step; admin handover note `docs/runbooks/shipping-zone-coverage.md` (client request, Q22).
- Tests: unit (pricing, orders, app checkout page, web helper), integration `shipping-zone-coverage.e2e-spec.ts`, Playwright `checkout-shipping-coverage.spec.ts` (manifest `APP-CHECKOUT`).

**Deviations from the plan.**

- `seed:e2e` now also seeds the FCT state (`FC`), so the Playwright journey uses a real state that no zone covers. Without it, the spec depended on the stale `stateCode` defect above.
- `tests/e2e/fixtures/test.ts`: `attachStrictPageGuards` gains an optional `allowConsoleError` for console errors the test provokes on purpose (the browser logs the expected 400). Existing callers are unchanged.
- The existing message of `assertShippingResolved` is kept, because a unit test pins it.

**Remaining.**

- Automated fundraiser checkout journey: TTW-039.
- Stale `stateCode` on address edit: TTW-087 or a new ticket.
- Pre-existing local failure of `campaign-authoring.comprehensive.spec.ts` (500 on `/v1/organiser/applications/eligibility`), which passes in CI: not investigated here.
- Backlog state in `docs/tickets/README.md`: set it when the ticket is closed on `main`. Changing it here would reformat the whole table and conflict with `main`.
- Merge into `main`, push and CI: only when the user asks.
