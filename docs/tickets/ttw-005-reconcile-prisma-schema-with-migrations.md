# TTW-005 — Reconcile the Prisma schema with the migration history

**Epic:** 0 — Trustworthy delivery system\
**Status:** In review\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None (but every new migration is at risk until this is done)

## Background

On 2026-11-02, generating the TTW-037 migration with `prisma migrate dev --create-only` also produced statements unrelated to that ticket, because `apps/api/prisma/schema.prisma` no longer describes the database built by `apps/api/prisma/migrations`:

```sql
ALTER TABLE "bulk_pricing" DROP COLUMN "quantityRange",
DROP COLUMN "variantKey";
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'PENDING';
```

They were removed by hand from the TTW-037 migration. Two different causes:

1. **`bulk_pricing` — intentional database-only objects.** Migration `20260820120000_ttw024_pricing_tax_snapshots/migration.sql:47-68` adds two generated columns (`variantKey`, `quantityRange int4range`) and the exclusion constraint `bulk_pricing_quantity_no_overlap`, which forbids overlapping bulk price tiers for the same product, variant and currency. Prisma cannot model generated columns or `EXCLUDE` constraints, so they are absent from `model BulkPricing` and **every future `prisma migrate dev` proposes to drop the columns**, which would also drop the overlap protection. Accepting that proposal by mistake breaks a pricing invariant.
2. **`payments.status` — a real mismatch.** The baseline migration sets `DEFAULT 'INITIATED'` (`20260819100000_baseline/migration.sql:681`); the schema says `@default(PENDING)` (`schema.prisma:1910`). Today `payments.service.ts:260` always sets `status` explicitly, so behaviour is not affected, but the two sources disagree.

The TTW-037 CHECK constraint `orders_idempotency_fingerprint_required` is also database-only; Prisma does not diff CHECK constraints, so it is not affected, but it belongs in the same inventory.

## Proposal

- Make `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma` produce **no statements**:
  - declare the two `bulk_pricing` generated columns in the schema in a way Prisma keeps (e.g. `Unsupported(...)` fields with `dbgenerated`), or, if Prisma cannot express them, document the exact statements every new migration must strip and add a guard for them;
  - choose the intended `payments.status` default (PENDING per the schema and current code) and align the database with a CLI-generated migration.
- Add a CI/quality check that fails when the diff is not empty (or contains anything outside a reviewed allowlist), so drift is caught when it is introduced.
- List every database-only object (generated columns, EXCLUDE/CHECK constraints, triggers) in `docs/` with the migration that owns it.

Rejected: accepting Prisma's proposed drops (loses the tier-overlap protection).

### Scope extended during the ticket (user decisions, 2026-11-06)

Two existing bugs surfaced, both blocking the same bulk pricing path. The user chose to fix them here instead of opening separate tickets:

1. **A tier with no maximum could not be saved.** `int4range(min, 2147483647, '[]')` overflows when Postgres normalises the bounds, so the generated `quantityRange` failed with `integer out of range` on every insert or update with an empty `maxQuantity`, although the API documents that case ("omit for open-ended"). `schema.prisma` was about to pin that expression, so it is corrected here: an empty `maxQuantity` now gives an unbounded range.
2. **The admin bulk pricing page crashed on load.** Its "All products" filter used `<SelectItem value="">`, which the select component rejects. Only this filter is changed. The same mistake remains in `apps/admin/components/admin-product-merchandising.tsx:1005` ("All variants"), which is another screen and is not fixed here.

## Invariants

- Bulk price tiers can never overlap for the same product, variant and currency (`bulk_pricing_quantity_no_overlap` stays).
- Migrations remain CLI-generated; any hand-added SQL is documented in the migration file and in `docs/`.
- No data loss on any existing table.

## Implementation plan

1. Reproduce: run the diff against a fresh database built from migrations and record its output.
2. Spike the Prisma representation of the generated columns; fall back to a documented strip list if unsupported.
3. Payments default migration.
4. Drift check script in `scripts/quality/` with its own `node --test`, wired into `pnpm verify` and CI.
5. Docs inventory.

## Test and observability plan

- Unit/component: the drift check script's tests (empty diff passes; unexpected statement fails).
- Integration/e2e: `pnpm --filter api test:e2e` (builds the test database from migrations); a bulk pricing test proving overlapping tiers are still rejected.
- Failure, retry, and concurrency: not applicable.
- Logs, metrics, traces, and alerts: none.

## References

- `apps/api/prisma/migrations/20260820120000_ttw024_pricing_tax_snapshots/migration.sql:47-68` — generated columns and exclusion constraint.
- `apps/api/prisma/migrations/20260819100000_baseline/migration.sql:681` — `payments.status` default `INITIATED`.
- `apps/api/prisma/schema.prisma:1910` — `@default(PENDING)`.
- `apps/api/src/orders/payments.service.ts:260` — status set explicitly.
- `docs/tickets/ttw-037-prevent-duplicate-standard-checkout-orders.md` — where the drift surfaced.

## Acceptance criteria

- [x] The schema-vs-migrations diff is empty (no allowlist was needed).
- [ ] A check fails CI when new drift appears. Implemented and proven locally; not yet run by CI, see below.
- [x] Overlapping bulk price tiers are still rejected by the database.
- [x] `payments.status` default is the same in schema and database.
- [x] Database-only objects are documented.
- [x] A bulk price tier with no maximum can be saved, updated and quoted (scope extension).
- [x] The admin bulk pricing page loads, and a tier with no maximum can be created there (scope extension).

## Out of scope

- Changing payment behaviour.
- Changing bulk pricing behaviour, apart from the tier with no maximum described above.

## Design review

**2026-11-06, independent reviewer (fresh agent, read-only).** Verdict: PASS with changes, applied before implementation.

- Blocking: `Unsupported` fields reject `@ignore`, so only `variantKey` carries it. Declaring the columns without `@default` cannot give an empty diff, so that option was removed.
- Blocking: `int4range(min, 2147483647, '[]')` was suspected to overflow. Confirmed with a read-only query (`ERROR: integer out of range`), which led to the scope extension.
- `node scripts/quality/*` runs without `DATABASE_URL`, so the check loads `apps/api/.env` itself.
- The check decides from Prisma's exit code and reads statements from `error.stdout`.
- Direct test writes use different `minQuantity` values, or `@@unique` could fire instead of the constraint. `mapBulkConstraintError` is tested on the real database error, because `adapter-pg` has no specific case for it.

## Implementation reviews

**Review 1, 2026-11-06, independent reviewer (fresh agent) covering implementation and security.** Verdict: PASS with changes. It tested on its own throwaway PostgreSQL 17.5, including 5 existing bounded tiers (identical ranges after the migration) and an injected failure (full rollback under `prisma migrate deploy`). Correctness: PASS with one change. Drift check: PASS. Security: PASS with changes. Tests: PASS with changes. Docs: PASS with changes.

1. **Medium, fixed.** The shadow guard tested the whole URL path while Prisma uses the first segment, so `.../victim/shadow` wiped `victim`, and a `localhost` / `127.0.0.1` alias bypassed the same-database check. It now requires one decoded database name and compares names on any host. New tests failed first.
2. **Medium, fixed.** `apps/api/scripts/inventory-pricing-conflicts.sql` kept the overflowing expression and would crash once open-ended tiers exist.
3. **Low, fixed.** The Playwright journey did not save an edit. It now sets a maximum and clears it through the admin page, and the evidence below no longer overclaims.
4. **Low, fixed.** A failed attempt could leave a tier that blocks a retry. The journey now deletes any leftover first.
5. **Low, not fixed.** `maxQuantity = 2147483647` still overflows, because the DTO has no upper limit. It predates this ticket and is out of scope.
6. **Low, fixed.** Run through a symlink, the script exited 0 without checking. It now resolves the real path.

**Review 2, 2026-11-06, same reviewer, after these fixes.** Correctness, drift check and tests: PASS. Security: FAIL. Docs: PASS with one change. It replayed findings 1, 2 and 6 on a throwaway database and all three were closed.

1. **Medium, fixed.** A URL ending in `//name_shadow` still passed the guard, because empty path segments were dropped, and Postgres then fell back to the database named after the user. Empty segments are now kept and refused. A new test failed first.
2. **Low, no change.** `docs/tickets/README.md` still shows `Scoped`. Its validator only allows `Complete`, `Scoped`, `Deferred` and `In progress`, and earlier tickets moved to `Complete` when closed after merge, so the table changes at closure.

**Review 3, 2026-11-06, same reviewer, attacking the shadow guard.** The `//name_shadow` case was closed. Database selection through `?database=`, `?dbname=`, `?db=` and `?host=`, and encoded slashes, gave no bypass on a throwaway database; `?schema=` was not run against a different schema.

1. **Low, fixed.** Postgres cuts names to 63 bytes, so a longer shadow name could reach the database it truncates to. With a 63-byte `DATABASE_URL` name, the derived `<name>_shadow` wiped the main database. Longer names are now refused, and the main name is compared after truncation. A new test failed first.

**Review 4, 2026-11-06, same reviewer, final check of that fix.** Overall verdict: **PASS**. The 63-byte case was replayed on a throwaway database and refused, with the sentinel table intact. Correctness, drift check, security, tests and docs: PASS. One non-blocking observation remains: the guard measures the decoded name, while Prisma sends it undecoded.

## Verification evidence

Environment: macOS, Node v24.22.1, PostgreSQL 17.5 native, Redis, disposable databases `tamiym_workshop_ttw005_*`.

**Reproduction.** `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script --exit-code` on the original schema exited 2 with the three statements from the Background. `pnpm migrations:check` on that same schema exited 1 and listed them, which proves the check detects real drift.

**Before the fix** (`schema-reconciliation` and `pricing-quote`, 2 suites): the tier-with-no-maximum tests failed with `integer out of range`, and the default test failed with `Received: 'INITIATED'`.

**After the fix:**

| Command                                                                                                                 | Result                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm migrations:check`                                                                                                 | exit 0, "Prisma schema matches the migrations."                                                                                                 |
| `pnpm migrations:check:test`                                                                                            | exit 0, 14 passed                                                                                                                               |
| `prisma migrate dev --create-only --name ...`                                                                           | "This is an empty migration.", so Prisma proposes nothing                                                                                       |
| `pnpm --filter api test:e2e`                                                                                            | exit 0, 18 suites, 105 tests                                                                                                                    |
| `pnpm release:verify-migrations` on a new database                                                                      | exit 0, "deploy + status + no drift"                                                                                                            |
| `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`                                                                | exit 0; API unit 143 suites, 1207 tests                                                                                                         |
| `pnpm --filter api test:coverage`, `coverage:ratchet`, `coverage:diff`                                                  | exit 0; no changed executable file under `apps/api/src`                                                                                         |
| `pnpm audit:prod`, `enums:check`, `openapi:check`                                                                       | exit 0                                                                                                                                          |
| `pnpm docs:validate`, `playwright:validate`, `workflows:validate`                                                       | exit 0                                                                                                                                          |
| `pnpm exec playwright test tests/e2e/admin/bulk-pricing.comprehensive.spec.ts --project=setup --project=chromium-admin` | exit 0, 4 passed. Plays create, list, filter, set then clear a maximum, and delete in the real admin; also passes with a leftover tier in place |

The inventory in `docs/database-only-objects.md` was checked against `pg_catalog` on a database built from migrations: 2 generated columns, 1 `EXCLUDE`, 1 `CHECK`, 13 partial unique indexes, 1 trigger and its function, `btree_gist`, no expression index.

**Deviations from the plan**

- The ticket expected a migration for the default only. It also recreates `quantityRange` and its constraint by hand, because of the scope extension. Prisma's generated `SET DEFAULT` on that column is invalid and was replaced.
- `prisma format` reformatted 251 unrelated lines of `schema.prisma`, and `prisma migrate dev` rewrote a comment in `migration_lock.toml`. Both were reverted, so `prisma format` will touch those lines again if someone runs it.
- A second currency cannot be tested: `CurrencyCode` only has `NGN`. Currency is still part of the constraint.

- Merged into `main` locally before CI ran, at the user's request and without a PR. `ci.yml` only runs on pushes to `main` or `develop` and on PRs, so pushing this branch alone starts no run. This departs from the `AGENTS.md` rule of green CI before merge.

**Not verified**

- CI has not run this branch. CI uses Postgres 16 and this was run on 17. `dbgenerated` must match the text Postgres stores, so the first CI run is the real proof for that.
- The Playwright journey is tagged `@comprehensive`, so CI only runs it nightly or on manual dispatch, not on each push.
- `pnpm verify` as a single command stops at `format:check` here, because of existing debt: `.prettierignore` does not exclude `apps/api/src/generated/`, so 84 generated files fail, and after a build the 3 ignored `next-env.d.ts` files fail too. Every stage was run separately instead, and Prettier passes on everything else.

## Completion summary

Schema and migrations are aligned, `pnpm migrations:check` guards them locally and in CI, and database-only objects are documented. Tiers with no maximum now save, update, quote and overlap correctly, and the admin bulk pricing page loads. Follow-ups, not fixed here: the empty `SelectItem` in `admin-product-merchandising.tsx:1005`, `apps/api/src/generated/` missing from `.prettierignore`, and the missing upper limit on `maxQuantity` (now TTW-163).

Left to do: the user pushes `main`, CI is confirmed green there on Postgres 16, then this ticket is marked Complete and the branch is deleted.
