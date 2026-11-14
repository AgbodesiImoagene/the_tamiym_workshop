# TTW-210 — Clear inventory movements before the e2e seed deletes variants

**Epic:** 8 — Client review delivery\
**Status:** Implemented, independent review done (PASS with reservations, addressed below)\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

Found while running TTW-209. `pnpm --filter api seed:e2e` fails on a test database that already holds data from earlier runs:

```
Invalid `prisma.productVariant.deleteMany()` invocation
Foreign key constraint violated on the constraint: `inventory_movements_variantId_fkey` (P2003)
```

`clearFixtureData` in `apps/api/scripts/seed-e2e-dummy-data.ts` deletes the fixture variants, but inventory movements written by earlier checkout/order runs still point to them. On a freshly migrated database the seed passes, so the script cannot be re-run on a reused database.

## Proposal

Delete the movements that reference fixture variants (and anything else that blocks the variant delete) in `clearFixtureData`, before the variants, in foreign-key order. Test-only script; no schema or production change.

## Invariants

- Only rows tied to `e2e-` fixture variants are deleted; no other data is touched.
- The seed still refuses to run on a non-test database (`assertTestDatabase`).
- The seed stays idempotent: two runs in a row both succeed.

## Implementation plan

1. Reproduce: create movements for a fixture variant (an order through the checkout, or a direct insert), run `seed:e2e`, see the P2003.
2. Add the deletion in the right order; re-run twice on the same database.
3. Add a test (API e2e-spec next to `seed-e2e-site-settings.e2e-spec.ts`) that seeds, adds a movement on a fixture variant, and seeds again.

## Test and observability plan

- Integration: the new e2e-spec above, on `tamiym_workshop_test`.
- Logs, metrics, traces, and alerts: none.

## References

- `apps/api/scripts/seed-e2e-dummy-data.ts` — `clearFixtureData`.
- `docs/tickets/ttw-209-replace-first-party-api-mocks-in-playwright.md` — where it was found.

## Acceptance criteria

- [x] `seed:e2e` succeeds twice in a row on a database that holds inventory movements for fixture variants.
- [x] A test fails without the fix and passes with it.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- Changing the data the seed creates.

## Design review

Low risk: test script only. Implementation review is enough.

## Implementation reviews

Independent review (fresh agent, read-only) of the first commit: **PASS with reservations**.

1. Orders left by a real checkout (generated ids, not `e2e-`) on fixture users or variants still block the seed → fixed in this ticket (see below), with a test.
2. Ticket wording "other foreign keys already deleted in order" was too broad → corrected under "Deviations".
3. The new spec ran the real seed twice on the shared database without restoring `SiteSettings`, and the full suite was not run → the spec now restores the row; full API e2e suite run on the dedicated database (see evidence).
4. Minor: the spec relied on `pnpm` in the PATH → it now starts `node -r ts-node/register` with `process.execPath`.
5. `coverage:ratchet` / `coverage:diff` not recorded → see evidence.

## Verification evidence

Dedicated database `tamiym_workshop_test_210` (migrated with `prisma migrate deploy`); the shared test database was not touched.

- Reproduction (before any change): `pnpm seed:e2e`, one `inventory_movements` row inserted on an `e2e-` variant, `pnpm seed:e2e` again → `Foreign key constraint violated on the constraint: inventory_movements_variantId_fkey`, `code: 'P2003'`, at `productVariant.deleteMany`.
- Test red before the fix: `pnpm test:e2e -- test/seed-e2e-reused-database.e2e-spec.ts` → `✕ clears movements on fixture variants and leaves other movements alone`, same P2003; `Tests: 1 failed`.
- Test green after the fix: same command → `✓ ... (18694 ms)`, `Tests: 1 passed`. It also proves a movement on a non-`e2e-` variant survives.
- Manual: movement re-inserted on an `e2e-` variant, then `pnpm seed:e2e` twice → both `exit=0`; the movement row count is 0 afterwards.
- `pnpm test:e2e -- test/seed-e2e-site-settings.e2e-spec.ts` → `Tests: 2 passed`.
- Review fix, test red first: second test (an order with a generated id for `e2e-user-customer`, one item on an `e2e-` variant) → `✕ ... Foreign key constraint violated on the constraint: order_items_variantId_fkey`, `code: 'P2003'`. After adding the order deletion to `clearFixtureData`: `✓ clears movements ...`, `✓ clears orders a real checkout left ...`, `Tests: 2 passed`.
- `pnpm exec tsc --noEmit` (api) → exit 0. `eslint` on the 3 touched files → exit 0. `prettier --check` → clean.
- Full API suite on `tamiym_workshop_test_210`: `pnpm test:e2e` → `Test Suites: 1 failed, 41 passed, 42 total`, `Tests: 1 failed, 195 passed, 196 total`. The failure was `auth-link-retention.e2e-spec.ts` ("jobs never failed": a 30 s wait on a BullMQ/Redis queue), seen twice (full run, then alone), at machine load average ~200.
- Cause of that failure: machine load, not this change. Re-run later at load average ~26, same command, spec alone: **without** the change (`seed-e2e-dummy-data.ts` restored from `f63ab46~1`, the two new files removed) → `✓ ... (685 ms)`; **with** the change → `✓ ... (503 ms)` and `✓ ... (546 ms)` in two runs. The spec imports neither the seed nor any file of this ticket.
- `pnpm coverage:ratchet` and `coverage:diff`: not run. The change is a test-only seed script plus an e2e spec, outside the unit-coverage scope; the behaviour is covered by the e2e spec above.

## Deviations from the plan

- `clearFixtureData` moved to `apps/api/scripts/seed-e2e-clear-fixtures.ts` (takes a `PrismaClient`; `FIXTURE_PREFIX` exported from there). Reason: `seed-e2e-dummy-data.ts` runs `main()` on import, same pattern as `seed-e2e-site-settings.ts`. The new spec nevertheless runs the real script as a child process, as `pnpm seed:e2e` does.
- `InventoryMovement` was the failing foreign key, but not the only possible one: a real checkout also leaves `orders` (generated ids) that block variants, products, users and addresses. `clearFixtureData` now also deletes orders whose user, item variant or item product is an `e2e-` fixture (items, payments and refunds cascade).
- Known limit, not fixed and not tested: other Restrict links from non-`e2e-` rows to fixture users or products (`campaigns.organizerId`, `payouts.recipientUserId`, `organizer_applications.userId`, `privacy_requests.userId`, `campaign_products.productId`, `designs.productId`). They only appear if a test creates such rows on fixture users; if it happens, add them to `clearFixtureData` with a test.

## Completion summary

`clearFixtureData` now deletes orders tied to `e2e-` users, variants or products, and `inventory_movements` whose `variantId` starts with `e2e-`, before the variants. No schema, production code or seed data change.
