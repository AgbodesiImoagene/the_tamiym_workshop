# TTW-098 — Make shipping rates configurable by weight or quantity

**Epic:** 8 — Client review delivery\
**Status:** Implemented, green CI on branch `codex/ttw-098-make-shipping-rates-weight-or-quantity-b`; not merged into `main` yet\
**Risk:** High\
**Blocked by:** TTW-097, TTW-086\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 5.7, Same shipping fee for 1 or 100 items** (High, P1, 6–10 h, status "To do"): Flat fee per zone; total weight is computed but never used.

Client answers:

- **Q21, Shipping rates: flat per zone, or by weight or quantity? Free shipping above an amount?** Answer: "Isn’t this configurable today? If not it should be."

## Proposal

- Per Q21, shipping rates must be configurable: keep the flat fee and add optional weight or quantity brackets per rate, configurable by admins.
- Use the total weight that `pricing.service.ts` already computes.

## Invariants

- Existing flat rates give the same fee.
- The shipping breakdown stays frozen on each order.

## Implementation plan

1. Start `codex/ttw-098-make-shipping-rates-weight-or-quantity-b` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Generate the migration with `pnpm --filter api exec prisma migrate dev --name <name>`, after checking that no other open ticket has one in flight.
8. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: flat rate, brackets, boundaries and missing product weight.
- Playwright: an admin sets a bracket and a large order pays more.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/pricing/pricing.service.ts:1005` — row 5.7
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] One item and 100 items can have different shipping fees when an admin configures it.
- [x] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [x] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below. (Local gates pass; GitHub CI has not run, nothing is pushed.)

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Finding confirmed on `main` (9b3d063): `InternalZoneRateProvider.quote` returned `rate.flatFee` whatever the shipment. `buildShipmentSummary` (`pricing.service.ts`) already computed `totalQuantity` and `totalWeightGrams`, passed to the provider in `ShippingQuoteRequest.shipment`, and nothing read them. The logic therefore lives in the provider, not in `pricing.service.ts`.

Decisions (approved with the plan):

1. A rate has one basis: none (flat, as today), `QUANTITY` or `WEIGHT_GRAMS`. Brackets are "from N (inclusive) → fee". The highest bracket reached wins; below the first bracket the flat fee applies.
2. Storage: enum `ShippingRateBracketBasis`, nullable `ShippingRate.bracketBasis`, table `shipping_rate_brackets` (`rateId`+`minValue` unique, cascade delete, `Decimal(10,2)` fee). Additive migration, existing rows keep `bracketBasis = NULL`, so existing flat rates give the same fee.
3. A weight rate with a product that has no weight refuses the quote (400 `SHIPPING_WEIGHT_UNKNOWN`) instead of guessing.
4. Frozen breakdown: `rateSource: ZONE_BRACKET_RATE` plus `bracket {basis, minValue, measuredValue}` are written to `Order.shippingBreakdown`. **Deviation from the plan:** the breakdown stays `version: 2` (additive optional field and one new `rateSource` value) instead of moving to version 3. Old orders are unchanged. Revisit if a strict reader appears.
5. Admin API: `bracketBasis` and `brackets` on create/update. Sending `brackets` replaces the list; sending `bracketBasis: null` clears it; changing the basis without new brackets is refused (the old minimums are in another unit). Minimums are whole numbers ≥ 1, unique per rate. Audited through the existing `shipping.rate.updated` before/after snapshot.
6. Money risk: fees stay `Decimal`, no network call inside a transaction, a zone without a rate is still refused (TTW-086).
7. Out of scope, flagged: "free shipping above an amount" (Q21 asked, the ticket proposal does not include it) needs a separate ticket and probably a client decision.
8. Not done: no warning when an admin saves a weight rate while some products have no weight (the quote then fails at checkout with a shopper-readable message). The admin screen and the runbook say so.

## Implementation reviews

Single independent review (`/code-review`, high). Fixed: unrelated `migration_lock.toml` churn from `prisma migrate dev` reverted; DTO upper bounds (`@Max`) so overflow gives 400, not 500; the admin editor resets brackets when the basis changes; a flat-rate edit no longer sends `bracketBasis: null` unless the rate had brackets. Judged fine: checkout shows the API message for `SHIPPING_WEIGHT_UNKNOWN` (generic fallback in `apps/app` checkout). Left as is: redundant bracket-selection loop (kept, simple and tested), weight-rate warning, the breakdown version (see Design review 4), Playwright spec depending on the re-seeded Yobe state.

## Verification evidence

Run from the worktree, against a throwaway database `tamiym_workshop_test_ttw098` (migrated, then `seed:e2e`; `REDIS_DB=14`). The shared `tamiym_workshop_test` was not touched.

- Tests first (provider): 6 new tests failed before the change ("6 failed, 2 passed"), 8 passed after. Admin bracket tests: 12 failed before, all passed after.
- `pnpm --filter api test`: 164 suites, 1869 tests passed.
- `pnpm --filter api test:e2e -- test/shipping test/pricing-quote test/order-create-idempotency test/address`: 20 suites, 106 tests passed. `test/shipping-rate-brackets.e2e-spec.ts`: 5 passed (1 vs 12 items, flat unchanged, weight rate, missing weight refused with no order, bracket replace, frozen breakdown).
- Playwright (`chromium-admin`, `chromium-app`): `shipping-rate-brackets.comprehensive.spec.ts` 2 passed (admin sets a bracket on items; quote goes from ₦1,500 to ₦4,000 at 5 items; flat again gives ₦1,500; incomplete bracket refused). Neighbours `shipping-zone-corrections` (3) and `checkout-shipping-coverage` (1) still pass.
- `pnpm lint` 0 errors (warnings pre-existing); `pnpm typecheck` 6/6; `pnpm format:check` clean; `pnpm migrations:check`, `pnpm openapi:check`, `pnpm docs:validate`, `pnpm playwright:validate` pass.
- `pnpm --filter api test:coverage` then `pnpm coverage:ratchet` passed (lines 84.79 % vs floor 56 %); `pnpm coverage:diff` passed (51/63, 80.95 %, floor 80 %). `pnpm build` passed.

- GitHub CI on the branch, run [44797701063](https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/44797701063) (commit a49f7d7): all 19 jobs succeeded (lint, type check, format, unit tests, production audit, coverage, documentation, migration baseline, OpenAPI, API integration, Playwright smoke, production build, container builds). The CI smoke tier does not run the new `comprehensive` spec, which was only run locally.
- Shared test database `tamiym_workshop_test`: migration `20261120182351_ttw098_shipping_rate_brackets` applied with `migrate deploy`. State Yobe was already there, so no re-seed was needed.

Not verified: a manual run of the real customer checkout page (the quote was exercised through the API as the shopper's app does, not through the checkout UI), the new Playwright spec in CI. The run on `main` (final proof) does not exist yet: nothing is merged.

## Completion summary

Admins can edit a shipping rate in the zone screen to charge by number of items or by total weight, with brackets on top of the flat fee. Rates without brackets behave exactly as before. The bracket applied is frozen on each order. New: migration `20261120182351_ttw098_shipping_rate_brackets`, `ShippingRateBracketDto`, `SHIPPING_WEIGHT_UNKNOWN`, seed state Yobe, docs (`pricing-strategy.md`, shipping runbook). Remaining: push and read CI when asked, re-seed the shared test DB, client decision on "free shipping above an amount".
