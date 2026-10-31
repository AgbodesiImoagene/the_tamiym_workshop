# TTW-038 — Fix the invalid pricing query that breaks every quote and order

**Epic:** 3 — Complete customer and fundraiser revenue journeys\
**Status:** Implemented-unverified (awaiting commit, PR and CI)\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-037 (its API e2e red phase cannot run until quotes work)

## Background

`PricingService.computeLineItem` (`apps/api/src/pricing/pricing.service.ts:384-417`) loads the variant with a nested query that puts `select` and `include` side by side on `optionValue` (`pricing.service.ts:404-409`):

```ts
optionValue: {
  select: { displayName: true, valueCode: true },
  include: { upcharges: { where: { currency }, take: 1 } },
},
```

Prisma rejects this query shape before reaching the database, whatever the data: `PrismaClientValidationError: Please either use include or select, but not both at the same time.` Every call to `quoteStandard` and `quoteCampaign` goes through `computeLineItem`, so every quote and every order creation (standard `POST /v1/orders`, campaign orders, and the quote endpoints used by `apps/app` checkout and `apps/web` fundraiser checkout) fails.

Evidence (2026-10-29, local PostgreSQL 17.5, `tamiym_workshop_test`): `pnpm --filter api test:e2e -- test/order-create-idempotency.e2e-spec.ts` (written for TTW-037) failed 4/4 with this exact error at `pricing.service.ts:384`, on standard and campaign orders alike. See the TTW-037 verification evidence.

Origin: commit `d3aff87` (2026-04-11, "A lot of changes"), present on `main`. It went unnoticed because `pricing.service.spec.ts` and `orders.service.spec.ts` mock Prisma, and no API e2e test computed a quote or created an order through the service until TTW-037. A scan of `apps/api/src` found no other `select` + `include` pair at the same level.

The fields read later are `optionValue.displayName`, `optionValue.valueCode` (variant snapshots, `pricing.service.ts:430-435`) and `optionValue.upcharges[0].amount` (`sumOptionValueUpcharges`, `pricing.service.ts:601`).

## Proposal

Express the nested selection with a single `select` that lists the scalar fields and the relation: `select: { displayName: true, valueCode: true, upcharges: { where: { currency }, take: 1 } }`. No change to prices, rounding, VAT, shipping or the API contract. Add an e2e test against real Postgres so a broken query shape cannot reach `main` again.

Rejected: switching to `include` only (loads every `optionValue` column for no reason); adding a mocked unit test (a mock cannot detect a query-shape error).

## Invariants

- Quote results for existing data are unchanged: same unit prices, option upcharges, bulk tiers, view surcharges, VAT, rounding and shipping.
- Variant snapshots keep `option`, `optionCode`, `value`, `valueCode`.
- No schema, migration, DTO or OpenAPI change.

## Implementation plan

1. Write `apps/api/test/pricing-quote.e2e-spec.ts` first and show it fails with the validation error.
2. Fix the selection in `computeLineItem`.
3. Re-run the new e2e, the pricing and orders unit suites, and the TTW-037 e2e (`test/order-create-idempotency.e2e-spec.ts`), which should then fail for its own reason (idempotency), not on pricing.

## Test and observability plan

- Unit/component: existing `src/pricing/*.spec.ts` and `src/orders/orders.service.spec.ts` stay green.
- Integration/e2e (real Postgres, `apps/api/test/pricing-quote.e2e-spec.ts`):
  - `quoteStandard` for a variant without options returns the product price, the zone shipping fee and the expected total;
  - `quoteStandard` for a variant with an option value that has an NGN upcharge adds that upcharge and returns the `variantSnapshot` labels;
  - `quoteCampaign` for an active campaign product returns the campaign price;
  - `OrdersService.create` creates a `PENDING_PAYMENT` order with one reservation (smoke for the full path).
  - Fixture pattern: reuse the seeding helpers of `apps/api/test/order-create-idempotency.e2e-spec.ts` (verified user, product price, Lagos zone rule and rate, address with `stateCode: 'LA'`, `countryCode: 'NG'`).
- Failure, retry, and concurrency: not applicable (read-only query fix).
- Logs, metrics, traces, and alerts: none.

## References

- `apps/api/src/pricing/pricing.service.ts:384-417` — variant load with the invalid nested selection (`404-409`).
- `apps/api/src/pricing/pricing.service.ts:430-435`, `601` — fields consumed afterwards.
- `docs/tickets/ttw-037-prevent-duplicate-standard-checkout-orders.md` — verification evidence showing the failure.
- Commit `d3aff87` — origin.

## Acceptance criteria

- [x] The new e2e fails before the fix with `PrismaClientValidationError` and passes after it.
- [x] Quotes for variants with and without option upcharges, and campaign quotes, return the expected amounts.
- [x] `pnpm --filter api test`, `pnpm --filter api test:e2e`, `pnpm --filter api typecheck`, `pnpm --filter api lint` and `pnpm coverage:diff` pass, with output recorded below.
- [x] Independent implementation review passes.

## Out of scope

- Duplicate orders on retry and cart changes → TTW-037.
- Any change to pricing rules, discounts or shipping rates.

## Design review

2026-10-31, independent read-only reviewer (subagent, fresh context). Verdict: **PASS WITH NOTES**.

- Prisma 7.3.0 runtime rejects mutually exclusive `select`/`include`; TypeScript does not, because `ProductOptionValueDefaultArgs` types both as optional siblings (which is why `tsc` stayed green).
- The proposed single `select` type-checks and returns exactly what is read later (`displayName`, `valueCode`, `upcharges[].amount`). `variant` never leaves `computeLineItem`.
- A TypeScript-AST scan of `apps/api/src`, `test` and `prisma` found no other `select` + `include` pair in the same object.
- No risk to prices, API contract or security: the fix only narrows loaded columns. `@@unique([optionValueId, currency])` makes `take: 1` redundant but harmless.
- Notes applied to the test plan: the TTW-037 seeding helpers are not on `main`, so they are copied into the new spec; assert exact values including `vatAmount === 0`; use a non-integer upcharge (50.50) and two option values to cover the Decimal conversion and summing; add an upcharge to the campaign case to exercise `resolveCampaignLinePrice`. A wrong-currency upcharge cannot be seeded (`CurrencyCode` only has NGN).

## Implementation reviews

2026-10-31, independent reviewer (subagent, fresh context, charter: correctness, test quality, security, style). It re-ran the new e2e (4/4). Verdict: **PASS WITH NOTES**.

- Correctness OK: only the `optionValue` selection changed, and every field read later is still loaded. Amounts in the spec checked by hand, including NGN display rounding (7550.50 → 7600, adjustment 49.50).
- Security: no new input surface, data exposure or logging. The change loads fewer columns.
- Finding 1 (medium), **fixed**: the spec assumed no `SiteSettings` row, but `seed:e2e` (needed for local Playwright) upserts one into the same database, which would break the `vatAmount === 0` checks. The spec now pins the tax settings (VAT 0, inclusive) in `beforeAll` and restores the previous row, or deletes it if there was none, in `afterAll`. Verified by running `pnpm --filter api seed:e2e` first, then the spec (4/4), then reading `site_settings` back (row restored).
- Finding 2 (low), accepted: the expected shipping fee relies on the oldest Lagos rule winning (`priority asc, createdAt asc`). Every Lagos rate seeded today charges 2000.
- Finding 3 (low), accepted: no HTTP-level quote request and no campaign-order smoke through `OrdersService`. The campaign order path is exercised by the TTW-037 e2e.

## Verification evidence

Environment: 2026-10-31, worktree `codex/ttw-038-fix-invalid-pricing-quote-query` from `main` (`4d2244a`), Node 24.22.1, local PostgreSQL on 5432 (`tamiym_workshop_test`), Redis `REDIS_DB=15`.

### Red phase (before the fix)

`pnpm --filter api test:e2e -- test/pricing-quote.e2e-spec.ts` → `Tests: 4 failed, 4 total`. All four with `PrismaClientValidationError` at `src/pricing/pricing.service.ts:384:54`, message ``Please either use `include` or `select`, but not both at the same time.`` `pnpm --filter api typecheck` was green on the broken code (see design review).

### Green phase (after the fix)

- `pnpm --filter api test:e2e -- test/pricing-quote.e2e-spec.ts` → `Tests: 4 passed, 4 total`:
  - `quotes a standard variant without options at the product price plus zone shipping`
  - `sums the NGN upcharges of every option value and snapshots their labels`
  - `quotes an active campaign product at the campaign price plus option upcharge`
  - `creates a pending-payment standard order with one stock reservation`
- `pnpm --filter api test:e2e` (full suite, run alone) → `Test Suites: 16 passed, 16 total`, `Tests: 83 passed, 83 total`, exit 0.
  - A first full run, done while the unit suite ran in parallel, failed one test: `payment-initiation.e2e-spec.ts › fifty concurrent initiates produce one payment and one provider session`, with `ConflictException: Payment initialization is in progress`. That spec seeds orders with `prisma.order.create` and does not go through pricing. Run alone, it passed 3/3, and the full suite passed when re-run alone. This looks like timing sensitivity under CPU load. It is not caused by this change, but it should be watched (not ticketed here).
- `pnpm --filter api test` → `Test Suites: 142 passed, 142 total`, `Tests: 1180 passed, 1180 total`.
- `pnpm --filter api typecheck` → exit 0, no output.
- `pnpm --filter api lint` → `0 errors, 14 warnings`, all pre-existing. `pricing.service.ts` has 10 `no-unsafe-assignment` warnings on `currency as any`, the same count of `as any` as on `main`. The new spec has 0 warnings.
- `pnpm --filter api exec jest --coverage --ci --silent` then `pnpm coverage:ratchet` → passed (statements 81.78%, branches 65.15%, functions 71.04%, lines 82.00%, all above floors).
- `pnpm coverage:diff` (after `git fetch origin main`) → `Changed files had no added executable lines; diff coverage skipped.` (the change is inside a Prisma argument object literal).
- `pnpm format:check` → the only flagged files are the 84 gitignored generated Prisma Client files under `apps/api/src/generated/`. The touched files were formatted with Prettier.
- TTW-037 unblock check: `apps/api/test/order-create-idempotency.e2e-spec.ts` was temporarily copied from the TTW-037 checkout, run, then removed (`git status` clean of it). Result: `Tests: 3 failed, 1 passed, 4 total`, with no pricing error. The failures are TTW-037's own subject (`Unique constraint failed on the fields: ("userId", "idempotencyKey")` on concurrent creates, plus the kind-mismatch expectation).

### After the review fix

- `pnpm --filter api seed:e2e` then `pnpm --filter api test:e2e -- test/pricing-quote.e2e-spec.ts` → `Tests: 4 passed, 4 total`. `site_settings` read back afterwards shows the seeded row unchanged.
- `pnpm --filter api test:e2e` (full suite) → `Test Suites: 16 passed, 16 total`, `Tests: 83 passed, 83 total`, exit 0.
- `tsc --noEmit` (api, includes `test/**`) and `eslint test/pricing-quote.e2e-spec.ts` → exit 0.

## Completion summary

- Fix: `apps/api/src/pricing/pricing.service.ts:404-410`. The `optionValue` selection is now a single `select` (`displayName`, `valueCode`, `upcharges`). Prices, API contract, schema and OpenAPI are unchanged.
- Regression guard: `apps/api/test/pricing-quote.e2e-spec.ts` (4 cases against real Postgres) covers a standard quote with and without option upcharges, a campaign quote with an upcharge, and standard order creation with a reservation.
- Deviations from plan:
  - The TTW-037 seeding helpers are not on `main`, so they were copied into the new spec instead of being reused.
  - Test cases were strengthened after the design review: two option values, a non-integer upcharge, and a campaign upcharge.
  - Tax settings are pinned after the implementation review.
- Noticed, not fixed (out of scope):
  - `apps/api/scripts/seed-e2e-dummy-data.ts:209` `toAmount` uses `toFixed(2)`, so the seeded VAT rate of 0.075 is stored as `0.0700` (7% instead of 7.5%).
  - `payment-initiation.e2e-spec.ts` concurrency test failed once under CPU load and passed when re-run (see evidence).
- Left: push to GitHub by the user (no PR, by decision of 2026-10-31); CI runs on push to `main`. TTW-037 can then rebase on `main` and run its e2e red phase.
