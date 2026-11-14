# TTW-212 — Clear rows that block fixture users and products in the e2e seed

**Epic:** 8 — Client review delivery\
**Status:** Implemented, awaiting independent review\
**Risk:** Low\
**Blocked by:** TTW-210 (same function, not yet merged; this branch starts from the TTW-210 branch)\
**Blocks:** None

## Background

Found by the independent review of TTW-210. `clearFixtureData` (`apps/api/scripts/seed-e2e-clear-fixtures.ts`) deletes only rows whose id starts with `e2e-`, plus (TTW-210) the orders and stock movements tied to `e2e-` users, variants and products. Other rows keep a Restrict foreign key to a fixture user or product, even though their own id is generated:

| Row                             | Blocks deleting     |
| ------------------------------- | ------------------- |
| `campaigns.organizerId`         | the fixture user    |
| `payouts.recipientUserId`       | the fixture user    |
| `organizer_applications.userId` | the fixture user    |
| `privacy_requests.userId`       | the fixture user    |
| `campaign_products.productId`   | the fixture product |
| `designs.productId`             | the fixture product |

The list comes from the foreign keys of the migrated test database (`pg_constraint`, delete rule NO ACTION or RESTRICT). A test or manual run that creates one of these rows for a fixture user or product makes the next `pnpm --filter api seed:e2e` fail with P2003 on a reused database. The full API e2e suite did not create such rows when run for TTW-210, so this is a latent failure.

## Proposal

Delete these rows in `clearFixtureData`, before the fixture users and products, where they are tied to an `e2e-` user or product. Test-only script; no schema or production change. Cascades already remove their children (payouts, campaign products and prices of a deleted campaign; views of a deleted design).

## Invariants

- Only rows tied to an `e2e-` user or product are deleted.
- Rows tied to non-fixture users and products survive.
- The seed still refuses to run on a non-test database; two runs in a row both succeed.

## Implementation plan

1. Test first: an API e2e-spec next to `seed-e2e-reused-database.e2e-spec.ts` creates one row of each kind on fixture users and products, plus controls on non-fixture parents, and runs the seed twice. It must fail with P2003.
2. Add the deletions in foreign-key order; the test passes.
3. Record evidence.

## Test and observability plan

- Integration: the new e2e-spec on a dedicated database.
- Logs, metrics, traces, and alerts: none.

## References

- `apps/api/scripts/seed-e2e-clear-fixtures.ts` — `clearFixtureData`.
- `docs/tickets/ttw-210-clear-inventory-movements-in-the-e2e-seed.md` — origin, "Known limit".

## Acceptance criteria

- [x] `seed:e2e` succeeds twice in a row on a database holding the six kinds of rows above on fixture users and products.
- [x] A test fails without the fix and passes with it.
- [x] Rows on non-fixture parents are untouched.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- Non-fixture products placed in a fixture category (`products.categoryId`).
- Changing the data the seed creates.

## Design review

Low risk: test script only. Implementation review is enough.

## Implementation reviews

Pending (independent review not yet run).

## Verification evidence

Dedicated database `tamiym_workshop_test_210` (the shared test database was not touched). Machine load was high; the new spec uses a 400 s jest timeout and a 150 s limit per seed run.

- Test red before the fix: `pnpm test:e2e -- test/seed-e2e-fixture-owned-rows.e2e-spec.ts` → `✕ deletes them with the fixture user or product and keeps the controls`, `Foreign key constraint violated on the constraint: designs_productId_fkey`, `code: 'P2003'`; `Tests: 1 failed`. (Postgres reports the first blocking key; the other five kinds are asserted by the same test.)
- Test green after the fix: same command → `✓ ... (8408 ms)`, `Tests: 1 passed`. The test creates a campaign, a payout, an organiser application, a privacy request, a campaign product and a design on fixture users or products, plus a control user with a campaign and a payout, then runs the seed again. The six fixture rows are gone; the control campaign, payout and user remain.
- `pnpm test:e2e -- test/seed-e2e` (the three seed specs: site settings, reused database from TTW-210, this one) → `Test Suites: 3 passed, 3 total`, `Tests: 5 passed, 5 total`.
- `pnpm seed:e2e` run twice in a row on the database → `exit=0` both times.
- `pnpm exec tsc --noEmit` (api) → exit 0. `eslint` on the touched files → exit 0. `prettier --check` → clean.
- Full API e2e suite not re-run: the change adds deletions to a script used only by `seed:e2e` and one spec; the full suite was run for TTW-210 on the same function.
- `coverage:ratchet` / `coverage:diff`: not run, same reason as TTW-210 (seed script and e2e spec).

## Completion summary

`clearFixtureData` now also deletes campaigns organised by fixture users, payouts addressed to them, organiser applications and privacy requests of fixture users, and campaign products and designs on fixture products, before the fixture users and products. No schema, production code or seed data change. Branch started from the TTW-210 branch because both change `clearFixtureData`; merge TTW-210 first.
