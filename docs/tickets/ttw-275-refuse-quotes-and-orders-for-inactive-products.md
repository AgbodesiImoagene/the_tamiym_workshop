# TTW-275 — Refuse quotes and orders for products that are not active

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Critical\
**Blocked by:** None\
**Blocks:** None

## Background

Noticed while analysing the public workshop route; reproduced on 2026-11-28 (see
Verification evidence).

- `apps/api/src/pricing/pricing.service.ts:447` checks only
  `variant.isAvailable`. The product status is never read when a line is priced.
- Standard and campaign quotes use that code, and order creation calls the quote
  (`apps/api/src/orders/orders.service.ts:159` and `:346`).
- The public campaign offers hide non-active products
  (`pricing.service.ts:727`), but the campaign quote and order accept them.

Effect: a `DRAFT` or `ARCHIVED` product can be quoted (200) and ordered (201).
The order is `PENDING_PAYMENT` and reserves stock. A customer needs the variant
id: the public product page answers 404 for a non-active product and a saved
design holds only the product id, so the realistic case is a product archived
after it was on sale.

Product owner decision, 2026-11-28 ("Oui, les refuser", in answer to "Faut-il
refuser les devis et commandes d'un produit qui n'est pas actif ?"): such quotes
and orders are refused.

## Proposal

One rule in a new `apps/api/src/pricing/product-orderability.ts`: only an
`ACTIVE` product can be quoted or ordered. Two places use it.

1. `PricingService.computeLineItem`: refuse the line when the product is not
   active. This covers the four paths. The status is already loaded by the
   existing query.
2. Order creation, standard and campaign: as the first statement of the order
   transaction, read the status of the ordered products again **with a row lock**
   (`SELECT ... FOR SHARE OF products`, ordered by product id) and refuse if one
   is not active. Without it, a product archived between the quote and the
   transaction would still be ordered.

Refusal: HTTP 400 `{ code: 'PRODUCT_NOT_AVAILABLE', message: 'Variant <id> is
not available' }`. The message is the one an unavailable variant already gets, so
the answer does not say whether the product is a draft or archived, nor its name.

Orders created before the product left `ACTIVE` are not changed: they stay
payable until they expire, and a retry with the same idempotency key returns the
original order. This was the recommendation put to the product owner with the
question.

Rejected:

- A database trigger on `order_items`: needs a migration and would also reject
  legitimate historical or fixture rows.
- A plain re-read inside the transaction, without a lock: leaves a window between
  the read and the commit.
- Checking in the controllers: order creation does not go through the quote
  controller.

No schema change, migration or data repair.

## Invariants

- A quote never contains a line of a product that is not `ACTIVE`.
- An order is only created if every product in it is `ACTIVE` at the moment the
  order commits.
- A refused order leaves no order, order item, discount use or stock
  reservation.
- A cart with one refused line is refused whole.
- Existing orders and idempotent retries behave as before.

## Concurrency analysis

- An admin status change updates the product row and so conflicts with
  `FOR SHARE`. If it commits first, the order transaction reads the new status
  and refuses. If the order locks first, the admin update waits until the order
  commits.
- Orders do not block each other: shared locks are compatible, and so is the key
  lock taken by inserting `order_items` or variants.
- The lock is held until the commit: it is taken by the order's own transaction,
  not by an earlier one.
- Deadlock: the order transaction locks products (in id order) before inventory.
  Product writes in `apps/api/src` are the create, update and delete of
  `apps/api/src/products/products.service.ts` (`:723`, `:774`, `:823`), single
  statements outside any explicit transaction. A delete takes the product row
  before cascading to variants and inventory, the same direction as an order. No
  reverse lock order was found.
- Cost: one query per order creation. A product write waits for a running order
  transaction, and an order waits for any uncommitted write on the product row,
  even a description change.
- Residual risk: PostgreSQL grants a new shared lock while an update is already
  waiting, so continuous orders of one product could delay its archiving. Order
  transactions last milliseconds; accepted at the current volume.
- A product row held for longer than the 5 second limit of the order transaction
  makes the order answer 500 and store nothing (observed by the reviewer with an
  8 second hold). Product writes are single statements, so this is not expected.

## Implementation plan

Approved by the product owner on 2026-11-28 ("J'approuve le plan"), including the
two test fixture additions. The approval covers no commit, push or merge.

1. Write the failing tests (below) on real Postgres, and the unit tests for the
   rule. **Done**: 16 e2e and 4 unit tests failed before the fix.
2. Add `product-orderability.ts` (rule, error, locked check). **Done.**
3. Call it from `computeLineItem` and from both order transactions. **Done.** In
   `computeLineItem` it runs before the variant availability check, so a product
   that is not active always answers `PRODUCT_NOT_AVAILABLE`.
4. Complete two existing test fixtures that do not describe what the new code
   reads, without changing or removing any assertion:
   `pricing.service.spec.ts` (`mockVariant.product.status`) and the transaction
   mock of `orders.service.spec.ts` (`$queryRaw`). **Done**; 19 order unit tests
   failed with `tx.$queryRaw is not a function` until the mock was added.
5. Update the Swagger 400 descriptions of the four routes, run
   `pnpm openapi:generate`, add a short section to `docs/pricing-strategy.md`
   and the index row in `docs/tickets/README.md`. **Done.**
6. Run the quality gates, then an independent implementation review.
   **Done**; review iteration 1 failed on a missing test.
7. Add the test that the lock is held until the order commits, fix the review's
   remarks on this ticket, rerun the gates and the review. **Done**; iteration 2
   passed.

Deviations: the ordering noted in step 3, and step 7.

## Test and observability plan

- Unit/component: `pricing.service.spec.ts`, refusal of `DRAFT` and `ARCHIVED`
  in standard and campaign quotes.
- Integration/e2e: new `apps/api/test/order-inactive-product.e2e-spec.ts`, over
  HTTP. `DRAFT` and `ARCHIVED` on the four paths (400 and code, no order, no
  reservation); `ACTIVE` controls; a cart mixing an active and an archived
  product.
- Failure, retry, and concurrency: retry with the same key after archiving
  returns the original order; product archived between the quote and the
  transaction (standard and campaign); an uncommitted archive held on a second
  connection makes the order wait, then refuses it after the commit; an order
  paused before its commit makes an archive wait.
- Database enforcement: the shared row lock. No constraint or trigger (see
  Proposal).
- Logs, metrics, traces, and alerts: none added; refusals are ordinary 400s.

## References

- `apps/api/src/pricing/pricing.service.ts:409` — line load; checks follow.
- `apps/api/src/orders/orders.service.ts:181` — standard order transaction.
- `apps/api/src/orders/orders.service.ts:377` — campaign order transaction.

## Acceptance criteria

- [x] Standard and campaign quotes refuse a `DRAFT` or `ARCHIVED` product with
      400 `PRODUCT_NOT_AVAILABLE`.
- [x] Standard and campaign order creation refuse it too, leaving no order and no
      reservation.
- [x] A product that leaves `ACTIVE` while an order is being created is not
      ordered.
- [x] Active products, existing orders and idempotent retries are unaffected.
- [x] Required quality gates pass with evidence recorded below.
- [x] Swagger, OpenAPI output and `docs/pricing-strategy.md` are updated; no
      migration applies.
- [x] Independent implementation review passes.

## Out of scope

- Blocking payment of an order created before the product left `ACTIVE`.
- A variant set unavailable between the quote and the order transaction: the same
  kind of window, for `isAvailable`. Read in code, not reproduced; no ticket yet.
- A friendlier front message. The customer checkout shows the API message, as it
  does today for an unavailable variant; no front change.
- Exposure of unpublished products on the public workshop route → TTW-273.

## Design review

2026-11-28, Claude (author's own review, not independent).

- Blast radius: standard and campaign quotes, order creation. No other order
  creation path found (`OrdersService.create`, `createCampaignOrder`).
- Duplication: one rule shared by pricing and order creation.
- Interfaces: new error code `PRODUCT_NOT_AVAILABLE`; no request or response
  shape change.
- Edge cases: mixed cart; archive during creation; idempotent replay; concurrent
  same-key requests (`createOrReplay` still returns the committed order).
- Security: narrows what can be bought; the message reveals no status or name.
- Risks: existing tests or seeds relying on ordering a non-active product (the
  e2e specs and `seed:e2e` create `ACTIVE` products); merge conflicts in
  `docs/openapi/openapi.json`, generated types and the ticket index with the
  parallel tickets — regenerate at merge.
- Test plan: above.
- Verdict: proceed once the user approves.

## Security review

2026-11-28, Claude (author's own) and the independent reviewer below. The change
narrows what can be bought: no new input, route, permission, write or external
call. The query is parameterised. The message gives neither the product name nor
its status; the code `PRODUCT_NOT_AVAILABLE` does distinguish a product that is
not active from an unavailable variant (400 without a code), to someone who
already knows the variant id. Accepted: it is the approved design.

## Implementation reviews

### Iteration 1 — 2026-11-28, independent review (separate agent)

Charter: financial, database and concurrency correctness, and security.
**Verdict: FAIL.** No defect found in production code.

- Blocking: no test proved the lock is held until the commit. With the lock taken
  in an earlier transaction of its own, the unit and e2e tests still passed.
  Fixed: `holds the lock until the order commits, so an archive waits for it`
  (standard and campaign).
- Non-blocking, fixed in this ticket: product create and delete missing from the
  concurrency analysis; cost in the other direction and writer delay not stated;
  line references.
- Non-blocking, recorded: 500 when a product row is held over 5 seconds
  (Concurrency analysis); the error code (Security review);
  `waits for an uncommitted archive` must commit within those 5 seconds, so it
  could fail on a saturated machine (not observed).
- Pre-existing, read only: a variant deleted between the check and the insert of
  the order lines would give a foreign key error (500). No ticket yet.

### Iteration 2 — 2026-11-28, same independent reviewer, full review repeated

**Verdict: PASS**, no blocking finding. It showed by mutation that the new test
fails when the lock is released before the commit (both paths together and each
alone, and when run on the plain Prisma client), that the shared `waitsOnLock`
helper does not weaken the earlier test, and ran the new spec 8 times in a row
(24/24). Production code was unchanged since iteration 1, whose concurrency
probes it did not replay. It read the `main` changes of TTW-266 and found no new
product row write; the two were not merged or tested together.

Non-blocking remarks, settled in this ticket: outdated mutation count, static
checks not recorded after iteration 1, steps and criteria not closed, one line
reference. Also: `holds the lock until the order commits` is bound by the same 5
second transaction limit as the test noted above.

## Verification evidence

Reproduction, 2026-11-28, local PostgreSQL 17, throwaway database
`tamiym_workshop_test_draftquote` (`migrate deploy`, dropped afterwards),
`REDIS_DB=11`, production code unchanged at `2fa96bb`. Temporary spec outside the
repository, HTTP requests against the real application:

```
Tests: 8 failed, 10 passed, 18 total
```

| Case                          | Standard quote | Standard order | Campaign quote | Campaign order |
| ----------------------------- | -------------- | -------------- | -------------- | -------------- |
| `ACTIVE` (control)            | 200            | 201            | 200            | 201            |
| Variant unavailable (control) | 400            | 400            | 400            | 400            |
| `DRAFT`                       | 200            | 201            | 200            | 201            |
| `ARCHIVED`                    | 200            | 201            | 200            | 201            |

The 8 failures are the `DRAFT` and `ARCHIVED` rows, where the test expected a
refusal. Each accepted order stored one line and reserved one unit. The public
product page answered 404 for both statuses.

After the fix, 2026-11-28, throwaway database `tamiym_workshop_test_ttw275`,
`REDIS_DB=11`, machine load average between 180 and 330 from parallel sessions.

Before the fix (new tests, production code unchanged):

```
pnpm exec jest src/pricing/pricing.service.spec.ts --ci -t TTW-275     (apps/api)
Tests: 4 failed, 51 skipped, 1 passed, 56 total

pnpm test:e2e -- order-inactive-product
Tests: 16 failed, 6 passed, 22 total     (expected 400, received 200 or 201)
```

After the fix:

```
pnpm test:e2e -- order-inactive-product
Tests: 22 passed, 22 total

pnpm exec jest src/pricing src/orders src/fundraising --ci --maxWorkers=2
Test Suites: 26 passed, 26 total
Tests: 500 passed, 500 total
```

Lock check on the first 22 tests: with only `FOR SHARE OF p` removed (the
re-read kept), `order-inactive-product` gives 2 failed, 20 passed; the two
failures are `waits for an uncommitted archive, then refuses the order` (standard
and campaign). The line was restored. With the 24 tests the reviewer's same
mutation gives 4 failed, 20 passed.

Related e2e suites:

```
pnpm test:e2e -- order- pricing-quote inventory-lifecycle shipping- address- campaign-authoring products.e2e paystack- site-settings reconciliation
Test Suites: 2 failed, 38 passed, 40 total
Tests: 14 failed, 230 passed, 244 total

pnpm test:e2e -- shipping-zone-admin-corrections address-one-default
Test Suites: 2 passed, 2 total
Tests: 23 passed, 23 total
```

The first run's failures were a Prisma transaction expiring while creating a
login session (5330 ms for a 5000 ms limit) in
`shipping-zone-admin-corrections`, and an HTTP parse error in
`address-one-default`. Neither suite's code path is changed here; both passed on
an immediate rerun.

Static checks: `tsc --noEmit` in `apps/api` and `packages/types` exit 0; ESLint
on the changed files 0 errors, 10 warnings, all in `pricing.service.ts`;
`pnpm openapi:check`, `pnpm docs:validate` and `git diff --check` pass.

After review iteration 1 (same day, database dropped and recreated before the
full runs, load average between 20 and 100). Production code unchanged since the
runs above.

```
pnpm test:e2e -- order-inactive-product
Tests: 24 passed, 24 total

pnpm test:e2e -- order-inactive-product    (lock taken in its own earlier transaction)
Tests: 2 failed, 22 passed, 24 total

pnpm exec jest --ci --maxWorkers=4         (apps/api, all unit tests)
Test Suites: 189 passed, 189 total
Tests: 2421 passed, 2421 total

pnpm test:e2e                              (all e2e suites)
Test Suites: 1 failed, 73 passed, 74 total
Tests: 1 failed, 535 passed, 536 total

pnpm test:e2e -- auth-session-renewal
Tests: 18 passed, 18 total
```

The two mutation failures are
`holds the lock until the order commits, so an archive waits for it` (standard
and campaign); the production file was restored. The one failure of the full run
is `never refuses a signed-out visitor with 429` in `auth-session-renewal`
(expected 401, received 404); this ticket changes nothing in authentication, the
cause was not established, and the suite passed on an immediate rerun.

Coverage gates and static checks, on the final code:

```
pnpm exec jest --coverage --ci --maxWorkers=4      (apps/api)
Tests: 2421 passed, 2421 total
pnpm coverage:ratchet      passed (lines 86.46%, floor 56%)
pnpm coverage:diff         passed (21/22 changed lines, 95.45%, floor 80%)
```

The new file was marked with `git add -N` for the diff gate, then unmarked.
`tsc --noEmit` in `apps/api` and `packages/types` exit 0; ESLint on the changed
files 0 errors, 10 warnings in `pricing.service.ts`; `pnpm openapi:check` and
`pnpm docs:validate` pass.

Not run: CI, any browser check (no front change), anything on the branch merged
with the current `main`.

## Completion summary

Quotes and order creation, standard and campaign, now refuse a product that is
not `ACTIVE` with 400 `PRODUCT_NOT_AVAILABLE`; order creation checks again under
a shared lock held until the commit. No schema change or migration.

Operations at merge: `main` moved after this branch started (TTW-266). It also
changes `docs/openapi/openapi.json`, the generated types and the ticket index:
resolve the index, run `pnpm openapi:generate`, and the `products.service.ts`
line references of this ticket shift.

Not committed, pushed or merged. Follow-ups without a ticket: the variant
availability window (Out of scope) and the variant deletion error (review
iteration 1).
