# TTW-212 — Clear rows that block fixture users and products in the e2e seed

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Low\
**Blocked by:** None (TTW-210 is merged in `main`)\
**Blocks:** None

## Background

Found by the independent review of TTW-210. `clearFixtureData` (`apps/api/scripts/seed-e2e-clear-fixtures.ts`) deletes only rows whose id starts with `e2e-`, plus (TTW-210) the orders and stock movements tied to `e2e-` users, variants and products. Other rows keep a Restrict foreign key to a fixture parent, even though their own id is generated or they belong to another user:

| Row                                                                                                  | Blocks deleting         |
| ---------------------------------------------------------------------------------------------------- | ----------------------- |
| `campaigns.organizerId`                                                                              | the fixture user        |
| `payouts.recipientUserId`                                                                            | the fixture user        |
| `organizer_applications.userId`                                                                      | the fixture user        |
| `privacy_requests.userId`                                                                            | the fixture user        |
| `campaign_products.productId`                                                                        | the fixture product     |
| `designs.productId`                                                                                  | the fixture product     |
| `products.categoryId` (product of any id in a fixture category)                                      | the fixture category    |
| `orders.shippingAddressId` (fixture address, or an address of a fixture user)                        | the fixture address     |
| `order_items.designId`, `campaign_products.designId` (design of a fixture user or with an `e2e-` id) | the fixture design      |
| `product_images.mediaAssetId` (image of any product)                                                 | the fixture media asset |
| `inventory_movements.variantId` (variant of any id under a fixture product)                          | the fixture product     |

The list comes from the foreign keys of the migrated test database (`pg_constraint`, delete rule NO ACTION or RESTRICT) and from two independent reviews. A test or manual run that creates one of these rows makes the next `pnpm --filter api seed:e2e` fail with P2003 on a reused database. The full API e2e suite did not create such rows when run for TTW-210, so this is a latent failure.

## Proposal

Delete these rows in `clearFixtureData`, before the fixture users, products, categories, addresses, designs and media assets they block: the rows of the table above, plus the orders holding such a product, design or address (an order is deleted whole; its items, payments and refunds cascade). Test-only script; no schema or production change. Cascades already remove the other children (payouts, campaign products and prices of a deleted campaign; views of a deleted design; variants of a deleted product).

## Invariants

- Only rows tied to an `e2e-` user, product, variant, category, address, design or media asset are deleted.
- Rows tied to non-fixture parents survive.
- The seed still refuses to run on a non-test database; two runs in a row both succeed.

## Implementation plan

1. Test first: an API e2e-spec next to `seed-e2e-reused-database.e2e-spec.ts` creates rows of each kind on fixture parents, plus controls on non-fixture parents, and runs the seed twice. It must fail with P2003.
2. Add the deletions in foreign-key order; the tests pass.
3. Follow the two independent reviews: cover the links they found (category, address, design, media asset, generated variant) with tests that fail when each branch is removed.
4. Record evidence.

## Test and observability plan

- Unit/component: none (script and e2e-spec only).
- Integration/e2e: `apps/api/test/seed-e2e-fixture-owned-rows.e2e-spec.ts`, 4 tests, on a dedicated database.
- Failure, retry, and concurrency: each test runs the real seed twice on the same database (retry on a reused database).
- Logs, metrics, traces, and alerts: none.

## References

- `apps/api/scripts/seed-e2e-clear-fixtures.ts` — `clearFixtureData`.
- `docs/tickets/ttw-210-clear-inventory-movements-in-the-e2e-seed.md` — origin, "Known limit".

## Acceptance criteria

- [x] `seed:e2e` succeeds twice in a row on a database holding every kind of row in the table above.
- [x] A test fails without the fix and passes with it, and the main added branches of `clearFixtureData` are proven by a test that fails when the branch is removed (six clauses checked, see the evidence).
- [x] Rows on non-fixture parents are untouched.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- Any Restrict link not listed in the Background table.
- Changing the data the seed creates.

## Design review

Low risk: test script only. Implementation review is enough.

## Implementation reviews

Independent review (fresh agent, read-only) of commit `97824cc` plus the fixture-category change: **PASS** (level Low). Findings:

- Scope of deletions and foreign-key order: OK. An order is deleted whole as soon as one item points at a fixture variant, product or category; the reviewer finds this unavoidable (`OrderItem.product` and `.variant` have no `onDelete`) and harmless on a test-only database behind `assertTestDatabase`.
- Tests: solid, cleanup complete. Gaps (low): the order-by-category branch of `clearFixtureData` has no test of its own; the category test has no non-fixture control.
- Remaining Restrict links (shipping address, fixture design, media asset): fixed afterwards in this ticket, see the evidence.
- Second independent review of both commits: **PASS**. Follow-up requested by it, all done: ticket brought up to date; the order-by-category branch and the category branches of campaign products and designs are now tested; a variant of any id under a fixture product with a stock movement is handled; a design of a fixture user used by a third party and an order shipped to a generated address of a fixture user are handled; fixture lookups in the spec are ordered (`orderBy id asc`).

## Known limits

None known. Postgres reports only the first blocking key of a failed delete, so a new Restrict link added to the schema later may need its own deletion and test.

## Verification evidence

Dedicated database `tamiym_workshop_test_210` (the shared test database was not touched). Machine load was high; the new spec uses a 400 s jest timeout and a 150 s limit per seed run.

- Test red before the fix: `pnpm test:e2e -- test/seed-e2e-fixture-owned-rows.e2e-spec.ts` → `✕ deletes them with the fixture user or product and keeps the controls`, `Foreign key constraint violated on the constraint: designs_productId_fkey`, `code: 'P2003'`; `Tests: 1 failed`. (Postgres reports the first blocking key; the other five kinds are asserted by the same test.)
- Test green after the fix: same command → `✓ ... (8408 ms)`, `Tests: 1 passed`. The test creates a campaign, a payout, an organiser application, a privacy request, a campaign product and a design on fixture users or products, plus a control user with a campaign and a payout, then runs the seed again. The six fixture rows are gone; the control campaign, payout and user remain.
- `pnpm test:e2e -- test/seed-e2e` (the three seed specs: site settings, reused database from TTW-210, this one) → `Test Suites: 3 passed, 3 total`, `Tests: 5 passed, 5 total`.
- `pnpm seed:e2e` run twice in a row on the database → `exit=0` both times.
- `pnpm exec tsc --noEmit` (api) → exit 0. `eslint` on the touched files → exit 0. `prettier --check` → clean.
- Fixture-category case, test red first: second test of the same spec (a product `ttw212-product-in-fixture-category` with a variant and a stock movement in the fixture product's category) → `✕ ... Foreign key constraint violated on the constraint: products_categoryId_fkey`, `code: 'P2003'`; `Tests: 1 failed, 1 passed`. After the fix: `pnpm test:e2e -- test/seed-e2e` → `Test Suites: 3 passed, 3 total`, `Tests: 6 passed, 6 total`.
- Review follow-up (the three remaining links), test red first: third test of the same spec (orders of a non-fixture user shipping to a fixture address and holding a fixture design, a campaign product on a fixture design, a product image on a fixture media asset, plus an unrelated order of the same user) → `✕`, `Foreign key constraint violated on the constraint: product_images_mediaAssetId_fkey`, `code: 'P2003'`; `Tests: 1 failed, 2 passed`. After the fix: `pnpm test:e2e -- test/seed-e2e` → `Test Suites: 3 passed, 3 total`, `Tests: 7 passed, 7 total`; the unrelated order survives.
- Full API suite on `tamiym_workshop_test_210`, with the TTW-210 and TTW-212 changes including the follow-up: `pnpm test:e2e` → `Test Suites: 43 passed, 43 total`, `Tests: 199 passed, 199 total`. (Before the follow-up: 43 suites, 198 tests, also green.)
- `pnpm seed:e2e` twice in a row after the follow-up → `exit=0` both times.
- Second review follow-up, test red first: fourth test (an order on a product in a fixture category, a variant of generated id under an `e2e-` product with a movement, a design of a fixture user used by an order and a campaign product, an order shipped to a generated address of a fixture user, and an unrelated order) → `✕ ... orders_shippingAddressId_fkey`, `Tests: 1 failed, 3 passed`. After the fix: `pnpm test:e2e -- test/seed-e2e` → `Test Suites: 3 passed, 3 total`, `Tests: 8 passed, 8 total`; the unrelated order survives.
- Branch-by-branch proof (the six clauses listed here were each removed in turn, fourth test run; the other added clauses were not removed one by one, they are covered by the same tests and their failure is deduced from the code): `order.product.categoryId` → `order_items_productId_fkey`; `order.shippingAddress.userId` → `orders_shippingAddressId_fkey`; `orderItem.design.userId` → ✕; `campaignProduct.design.userId` → ✕; `movement.variant.productId` → `inventory_movements_variantId_fkey` (after moving the generated variant under an `e2e-` product in a control category; before that the category clause covered it, so the first attempt did not prove the branch); `onFixtureProduct` category clause → `designs_productId_fkey`. Each of these six clauses makes the test fail when removed; the file was restored and checked identical.
- Full API suite after the second follow-up: first run `Test Suites: 1 failed, 42 passed, 43 total` (`auth-surface.e2e-spec.ts` › "fails with a mismatched X-CSRF-Token header", got 401 instead of 403; the spec imports nothing of this ticket, passes alone twice with `Tests: 34 passed, 34 total`, and load was ~5; not a repeat of the TTW-210 failure; not explained, likely shared Redis/rate-limit state). Re-run: `Test Suites: 43 passed, 43 total`, `Tests: 200 passed, 200 total`.
- `pnpm exec tsc --noEmit` (api) after the last change → exit 0; `eslint` on the two touched files → exit 0; `prettier --check` → clean.
- `coverage:ratchet` / `coverage:diff`: not run, same reason as TTW-210 (seed script and e2e spec).

## Completion summary

`clearFixtureData` now also deletes campaigns organised by fixture users, payouts addressed to them, organiser applications and privacy requests of fixture users, and campaign products and designs on fixture products, products of any id placed in a fixture category (with their stock movements and orders), orders shipping to a fixture address or holding a fixture design, campaign products on a fixture design or on a design of a fixture user, product images on a fixture media asset, orders shipped to an address of a fixture user, and stock movements of any variant under a fixture product, before the fixture users, products and categories. No schema, production code or seed data change. Branch started from the TTW-210 branch because both change `clearFixtureData`; merge TTW-210 first.
