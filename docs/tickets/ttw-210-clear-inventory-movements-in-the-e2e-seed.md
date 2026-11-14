# TTW-210 — Clear inventory movements before the e2e seed deletes variants

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
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

- [ ] `seed:e2e` succeeds twice in a row on a database that holds inventory movements for fixture variants.
- [ ] A test fails without the fix and passes with it.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Changing the data the seed creates.

## Design review

Low risk: test script only. Implementation review is enough.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
