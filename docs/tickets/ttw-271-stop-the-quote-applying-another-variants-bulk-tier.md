# TTW-271 — Stop the quote applying another variant's bulk pricing tier

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Critical\
**Blocked by:** None\
**Blocks:** None

## Background

Reported while planning TTW-269; reproduced on 2026-11-25 (see Verification
evidence). Line numbers in this section are those before the fix.

- `apps/api/src/pricing/pricing.service.ts:411` loads `product.bulkPricingTiers`
  filtered by currency only. Every `BulkPricing` row carries a `productId`, so
  this relation also returns the tiers of every variant of the product.
- `apps/api/src/pricing/pricing.service.ts:654` falls back to that list when the
  quoted variant has no tier of its own.

Effect: a variant with no tier is priced with a sibling variant's tier, in the
quote and in the stored order. It goes both ways: a cheaper sibling tier
undercharges (5000 → 1000 per unit), a dearer one overcharges (order total
12000 → 20000). A sibling tier with a lower minimum also wins over the correct
product-level tier. Only standard orders are affected: campaign quotes ignore
bulk tiers (`pricing.service.ts:513`). The product list card already filters
`variantId: null` (`apps/api/src/products/products.service.ts:286`).

## Proposal

Load only product-level tiers for the fallback: add `variantId: null` to the
`where` of `product.bulkPricingTiers` at `pricing.service.ts:411`.

Unchanged: a variant that has tiers of its own uses only those, even when the
quantity matches none of them (no fallback to the product tiers). This is the
current behaviour and the contract proposed in TTW-269.

Rejected: filtering inside `getBulkTier` (loads rows only to drop them and needs
`variantId` added to its type).

No schema change, migration, API contract change or data repair (not in
production).

## Invariants

- A quoted line only ever uses a tier of its own variant, or a product-level
  tier (`variantId` null) of its own product.
- A variant's own tiers still take precedence over the product tiers.

## Implementation plan

1. Reproduce with failing tests on real Postgres. **Done.**
2. Present the fix plan to the user. **Done**: approved on 2026-11-25 ("Oui,
   j'approuve 271", typed in the parent session and read there). The approval
   covers the fix only: no commit, push or merge.
3. Pin the unchanged behaviour with tests that pass before the fix: a variant's
   own tier beats the product tier; a variant whose tiers do not cover the
   quantity is charged the base price. **Done.**
4. Apply the one-line filter, without editing the tests. **Done.**
5. Run the quote e2e suite, the pricing unit tests, API typecheck and lint.
   **Done**, plus the order, bulk pricing, shipping, surcharge and product e2e
   suites.
6. Independent implementation review. **Done**: PASS.
7. Settle the review's non-blocking remarks: two more tests, the pricing
   document, the security and database notes, this ticket. **Done.**

Deviation: a full API unit run was started and stopped before the end (machine
load average 151 from parallel sessions); only the pricing, orders, bulk pricing
and fundraising unit tests were run.

## Test and observability plan

- Unit/component: existing `apps/api/src/pricing/pricing.service.spec.ts`.
- Integration/e2e: `apps/api/test/pricing-quote.e2e-spec.ts`, describe
  `bulk tier scope (TTW-271)`: quote with only a sibling tier, quote with a
  sibling and a product tier, stored order total, two lines of one order with
  their stored unit prices and breakdown, product tier quantity bounds (1, 2, 4,
  5).
- Failure, retry, and concurrency: not applicable, the change narrows a read
  filter and touches no write, lock or state transition.
- Database enforcement: none added. The invariant is about which rows a read
  selects, which a constraint cannot express. Which rows may be written is
  TTW-272.
- Logs, metrics, traces, and alerts: none.

## References

- `apps/api/src/pricing/pricing.service.ts:413` — product tier load (filter).
- `apps/api/src/pricing/pricing.service.ts:639` — tier selection.

## Acceptance criteria

- [x] A variant with no tier of its own is never priced with a sibling's tier.
- [x] A product-level tier still applies to a variant with no tier of its own.
- [x] Tests, typecheck and lint pass, with evidence below.
- [x] `docs/pricing-strategy.md` states which tier a quote applies; no contract,
      migration or observability change applies.
- [x] Independent implementation review passes.

## Out of scope

- Likes and bulk tiers in the public product API → TTW-269.
- A tier whose `variantId` belongs to another product than its `productId` is
  accepted (`apps/api/src/bulk-pricing/bulk-pricing.service.ts:89`) and prices
  that variant → TTW-272 (also an acceptance criterion of TTW-172). Not
  reproduced here; TTW-272 reports a reproduction.
- Tier quantities are counted per order line, not per product → TTW-095.
- A tier price replaces the base price even when it is higher, so a product tier
  can raise the unit price of a variant that is cheaper than the tier
  (`apps/api/src/pricing/pricing.service.ts:519`). Pre-existing, read in code,
  not reproduced; needs a product decision, no ticket yet.

## Design review

2026-11-25, Claude (author's own review, not independent).

- Blast radius: standard quotes and the orders created from them.
- Duplication: `getBulkTier` is the only tier selection used for charging.
- Interfaces: none change.
- Edge cases: sibling tier only; sibling and product tier; variant tier and
  product tier; variant tiers not covering the quantity.
- Risks: a price that relied on the leak changes to the base or product price,
  which is the intended correction.
- Test plan: above.
- Verdict: proceed once the user approves.

## Security review

2026-11-25, Claude (author's own, not an independent security review). The change
narrows a database read: no new input, route, permission, data exposure, write or
external call. The price is still computed by the server. The write-side gap on
tier ownership is TTW-272.

## Implementation reviews

### Iteration 1 — 2026-11-25, author's own review (not independent)

`/code-review` ran inline in the implementing session. No finding against this
change; two pre-existing findings, listed under Out of scope. It does not satisfy
the independent review required for a critical ticket.

### Iteration 2 — 2026-11-25, independent review (separate agent)

Charter: financial, database and concurrency correctness. **Verdict: PASS**, no
blocking finding. It reran the quote suite (10/10), the same suite with the
filter removed (3 failed, 7 passed), the related e2e suites (87/87), the related
unit tests (500/500), `tsc`, `eslint`, `prettier` and `git diff --check`, on its
own throwaway database.

Non-blocking remarks and what was done:

- Out of scope said "no ticket yet" for the admin gap: TTW-172 and TTW-272 now
  cited.
- Security review and database enforcement not recorded: recorded above.
- Pricing document silent on the tier chosen: section added.
- Missing tests (two lines, stored breakdown, bounds): added.
- ESLint evidence wording: corrected below.
- Ticket index rows missing: `README.md` row added.

The tests, document and ticket text changed after this review were not
independently reviewed; production code did not change.

## Verification evidence

Reproduction, 2026-11-25, local PostgreSQL 17, throwaway database
`tamiym_workshop_test_ttw271` (`migrate deploy`), `REDIS_DB=7`, production code
unchanged:

```
pnpm test:e2e -- pricing-quote.e2e-spec     (in apps/api)
Tests: 3 failed, 5 passed, 8 total
```

- `does not give a variant without tiers a sibling variant's tier`: expected
  unit price 5000, line 30000; received 1000, 6000.
- `applies the product tier, not a sibling variant's tier with a lower minimum`:
  expected 4000, 24000; received 1000, 6000.
- `does not store an order priced with a sibling variant's tier`: expected total
  12000; received 20000.

Pinning tests, before the fix (`apps/api/src` unchanged):

```
pnpm --filter api test:e2e -- pricing-quote.e2e-spec
Tests: 3 failed, 7 passed, 10 total
```

The two new passing tests are `applies a variant's own tier ahead of the product
tier` and `charges the base price when a variant's own tiers do not cover the
quantity`; the three failures are the reproduction tests.

After the fix, tests unedited:

```
pnpm --filter api test:e2e -- pricing-quote.e2e-spec
Tests: 10 passed, 10 total

pnpm --filter api test:e2e -- pricing-quote bulk-pricing-quantity-limits order- shipping-rate-brackets view-surcharge products.e2e
Test Suites: 12 passed, 12 total
Tests: 87 passed, 87 total

pnpm --filter api exec jest src/pricing src/orders src/bulk-pricing src/fundraising --maxWorkers=2 --ci
Test Suites: 27 passed, 27 total
Tests: 500 passed, 500 total

pnpm exec tsc --noEmit                                       (in apps/api) exit 0
pnpm exec eslint --no-warn-ignored src/pricing/pricing.service.ts test/pricing-quote.e2e-spec.ts
0 errors, 10 warnings (`no-unsafe-assignment` on existing `any` casts, one of
them on the changed line; no new cast)                       exit 0
pnpm exec prettier --check <the two files and this ticket>   exit 0
```

Not run: full API unit and e2e suites, coverage gates, CI.

After the review, with the added tests (2026-11-28, same database name
recreated):

```
pnpm --filter api test:e2e -- pricing-quote.e2e-spec   (filter removed)
Tests: 5 failed, 10 passed, 15 total

pnpm --filter api test:e2e -- pricing-quote.e2e-spec   (with the fix)
Tests: 15 passed, 15 total

pnpm exec tsc --noEmit                                 (in apps/api) exit 0
eslint on the two files: 0 errors, 10 warnings; prettier --check on the two
files and docs/pricing-strategy.md: pass
```

The extra failures without the fix are `prices each line of an order with the
tiers of its own variant` and `quotes 5 units at 5000 when the product tier
covers 2 to 4`.

The throwaway databases were dropped and this worktree's `apps/api/.env.test`
removed after the runs.

## Completion summary

The quote now loads only product-level tiers as the fallback
(`variantId: null`), so a variant never receives a sibling's tier. One-line
change, tests and a short section in `docs/pricing-strategy.md`; no schema,
migration, contract or data change.

Committed on `claude/ttw-271-variant-bulk-tier-leak`; not merged or pushed. The
local `ROADMAP.md` (main checkout) has no TTW-271 row yet.
