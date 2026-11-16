# TTW-222 — Guarantee one default address per customer

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

TTW-219 made the address create and edit paths take a per-user lock (`SELECT ... FOR NO KEY UPDATE` on the `users` row) and write the new address and clear the old default in one transaction. Its reviews and its own design left three related weaknesses, recorded as proposals (2026-11-15). Confirm each against current `main` with a failing test before designing.

1. **No database guarantee.** Only the lock keeps a single default; a partial unique index (`addresses (user_id) WHERE is_default`) was not added because the table may already hold duplicates and an index needs a migration. Any other writer, or a bug, can still leave two defaults. Before TTW-219, six parallel saves left five defaults.
2. **`remove()` is not transactional** (`apps/api/src/addresses/addresses.service.ts`, `remove`). It deletes the address, then looks for the most recent address and promotes it to default, as separate statements. A failure or a parallel save between them can leave the customer with no default or two.
3. **A parallel delete during an edit gives a 500.** `update` reads the saved address, then writes it inside the transaction; if the address is deleted in between, `tx.address.update` raises Prisma `P2025` and the customer gets a 500 instead of a 404 (the case was already true before TTW-219).

## Proposal

- **Index:** add a partial unique index so a user has at most one default address. First measure duplicates with a read-only query on the available databases and record the count; the migration must clean duplicates deterministically before the index exists (keep the most recently updated default, clear the others), or fail with a clear message if cleaning is not safe. Create the migration with `pnpm --filter api exec prisma migrate dev --name <name>` (CLI-generated, never hand-written) and add the raw SQL for the partial index only if Prisma cannot express it, as the generated migration file. A migration that rewrites data needs the owner's approval before it is applied: ask once, with your recommendation.
- **`remove()`:** run the delete and the promotion in one transaction under the same per-user lock as create and edit; keep "the most recent address becomes the default".
- **P2025:** turn a vanished address during an edit into a 404 (`NotFoundException`), not a 500.
- Update DTO docs, Swagger and `pnpm openapi:generate` if the contract changes. No screen changes expected.

## Invariants

- A customer has zero or one default address; the first address becomes the default; an explicit `isDefault: false` still wins as today.
- A refused or failed save changes nothing (TTW-219).
- Ownership and the TTW-194, TTW-216, TTW-217, TTW-219 rules are unchanged.
- Never hand-edit an already committed migration.

## Implementation plan

1. Start `codex/ttw-222-guarantee-one-default-address-per-customer` from current `main`, in its own worktree. Copy this ticket into `docs/tickets/` of that worktree and add the ticket rows to `docs/tickets/README.md` and `docs/tickets/ROADMAP.md`.
2. Reproduce points 2 and 3 with failing tests on real Postgres; measure point 1 and record it.
3. Record the design review (High risk, schema change, concurrency). Ask the owner once about cleaning existing duplicates.
4. Implement in small steps. Record any deviation.
5. Run the gates, record exact results, and obtain an independent implementation review and an independent security review (database enforcement and concurrency charter).

## Test and observability plan

- Integration on real Postgres: a second default insert is rejected by the index; parallel `isDefault: true` saves leave one default; delete of the default promotes exactly one other address and a failure in the middle rolls the delete back; an edit of an address deleted in parallel returns 404.
- The migration applied twice on a database that holds duplicates, and on an empty one (`prisma migrate deploy`), with the result recorded.
- Logs, metrics, traces, and alerts: nothing new. No PII in logs.

## References

- `apps/api/src/addresses/addresses.service.ts` — `create`, `update`, `remove`, `lockUserAddresses`.
- `apps/api/prisma/schema.prisma` — `Address`.
- `docs/tickets/ttw-219-keep-the-default-address-and-the-country-code-safe.md` — origin (design decision 2, proposals a to c).

## Acceptance criteria

- [x] The database refuses a second default address for the same user.
- [x] Deleting the default address is atomic and leaves exactly one default when other addresses remain.
- [x] An edit of an address deleted in parallel returns 404.
- [x] The migration is CLI-generated, handles existing duplicates (keep the most recently updated default; **owner approved this rule on 2026-11-16; nothing was applied to a shared database**), and is proven on a database with duplicates.
- [x] Required quality gates pass, with evidence recorded below, including an independent implementation review and an independent security review.
- [x] Contracts and docs are updated where applicable.

## Out of scope

- LGA gaps in the delivery refusal → TTW-221.
- Country-code and field-limit hardening → TTW-226.

## Design review

Recorded before the implementation (2026-11-15, High risk: schema change and concurrency).

**Measurement (point 1, read-only, 2026-11-15).** Query on `addresses`: users with more than one `isDefault = true` row, on every Postgres database of this machine that holds the table (13 databases, the largest `tamiym_workshop_test` with 767 addresses and 116 defaults). Result: **0 users with duplicates in all 13**. No production database was reachable from here (the project is not in production), so the migration still carries the clean-up for any database that has them.

**Failing tests first (points 2 and 3).** `apps/api/test/address-one-default.e2e-spec.ts`, real Postgres, run before any production change: the index test (a second default accepted), "a failure while promoting rolls the delete back" (the address was gone after a 500) and "an edit of an address deleted in parallel returns 404" (got 500) failed for the right reasons; the other tests (parallel saves, delete promotion, parallel deletes) passed and stay as regression guards.

**Decisions.**

1. **Index.** `CREATE UNIQUE INDEX "addresses_one_default_per_user" ON "addresses" ("userId") WHERE "isDefault" = true`. Prisma cannot express a partial index, so the migration is created empty by the CLI (`prisma migrate dev --create-only`) and the SQL is the file's content, as TTW-010 and TTW-012 did. `prisma migrate diff` shows no drift afterwards. The schema file does not change.
2. **Clean-up inside the same migration.** `SET LOCAL lock_timeout = '10s'` (added after the security review: the deploy gives up rather than queueing every address write), then `LOCK TABLE addresses IN SHARE ROW EXCLUSIVE MODE` (no save can slip in between clean-up and index; the migration is one transaction), then, per user, keep the default with the latest `updatedAt` (ties: latest `createdAt`, then highest `id`) and set `isDefault = false` on the others. `updatedAt` is not touched. It is deterministic and idempotent (second run changes nothing; `IF NOT EXISTS`). It never deletes a row. The owner approved this rule on 2026-11-16; nothing was applied to a shared database.
3. **Write order with the index.** Every write that sets a default clears the other defaults first, inside the per-user lock (already the case in `create` and `update`), so the index never fires in normal use. A violation can only come from a writer that bypasses the service; it then fails loudly (the unwanted state is refused, not stored).
4. **`remove()`.** Same per-user lock, one transaction: re-read the address under the lock, delete, promote the most recent remaining address (`createdAt` desc, then `id` desc, so the choice is deterministic) only if the deleted one was the default. The `isDefault` value comes from the re-read, not from the first read.
5. **Vanished address.** `update` and `remove` re-read the address inside the locked transaction (`findFirst` on id and userId) and throw `NotFoundException` if it is gone. The first read outside the transaction stays so that "not found" and "belongs to someone else" (404 / 403) answer as before. Because the lock serialises every service writer, the re-read is exact; no `P2025` catch is needed.
6. **Deadlocks / lock order.** One lock only (the user row), taken first in each transaction; no nested locks. A waiter simply waits for the holder.
7. **Contract.** No request or response shape changes, so no Swagger or shared-types change is expected (checked with `openapi:check`). The delete route can already answer 404.

**Rollback.** `DROP INDEX "addresses_one_default_per_user"`. The clean-up only clears flags on surplus rows and cannot be undone, which is acceptable because the application never wanted two defaults.

**Risks.** (a) A hidden second writer of `isDefault` would now fail instead of silently storing a duplicate: checked, only `AddressesService` and the e2e seed (one default per user) write it. (b) The migration locks `addresses` for writes for the duration of the clean-up and index build: milliseconds on this table size.

## Implementation reviews

Two independent, read-only reviewers with fresh context (2026-11-15).

- **Implementation review: PASS**, no blocking finding. Fixed after it: the stale comment above `model Address` in `schema.prisma` (documentation only, no migration change; `prisma migrate diff` reports no difference); the e2e index test now asserts Prisma code `P2002`; the first unit `remove` test asserts nothing is promoted. Not fixed, on purpose: the 800 ms wait in the "edit of an address deleted in parallel" e2e (on a very slow machine the edit could meet the delete earlier and answer 404 from the first read, a false pass that never breaks anything).
- **Security review (database and concurrency charter): PASS**, no critical or high finding. Lock order checked against create/update/remove, the privacy erasure and account deletion (always `users` row first, then `addresses`): no deadlock. READ COMMITTED: the re-read under the lock sees what the previous holder committed. IDOR: the re-read filters on `{ id, userId }`. Medium finding fixed: `SET LOCAL lock_timeout = '10s'` in the migration (it was not committed yet, so it was edited in place, then re-proved on a fresh database). The reviewer could not finish `prisma migrate diff` (it hung under load); it was run afterwards by the author: "No difference detected".

## Verification evidence

All on this machine, own databases `tamiym_workshop_test_222` and `tamiym_workshop_shadow_222` (the shared `tamiym_workshop_test` was not touched).

- **Point 1, measured:** 0 users with several defaults on 13 databases (see Design review).
- **Red first:** before the production change, `address-one-default.e2e-spec.ts` failed 3 of 9 tests (index accepted a second default; a failed promotion left the address deleted and the customer without default; an edit of a parallel-deleted address answered 500). After: 10 of 10 pass.
- **Migration proof** on a scratch database (dropped afterwards) rebuilt to the state before the migration, holding users with 3, 2 and 1 defaults: after `prisma migrate deploy` the 3-default user kept the most recently updated row, the 2-default tie went to the highest `id`, the 1-default user was untouched, `updatedAt` unchanged, no row deleted; the SQL run a second time by hand: no change, no error; a direct insert of a second default then failed with `duplicate key value violates unique constraint "addresses_one_default_per_user"`. On an empty database `migrate deploy` created the index. The final `lock_timeout` version was applied again to a fresh database (index present). `prisma migrate diff` against the schema: no difference.
- `pnpm --filter api typecheck`: pass. ESLint on the touched files: clean (existing warnings elsewhere not touched). Prettier: clean.
- `pnpm --filter api test`: 153 suites, 1574 tests pass (also with `--coverage`). `addresses.service.spec.ts`: 61 pass.
- e2e run one by one on the own database: `address-one-default` 10/10, `address-default-and-country-code` 13/13, `address-clear-lga`, `address-deactivated-lga`, `address-deactivated-state`, `address-edit-state`, `address-lga-state` pass, `address-state-mismatch` and `address-state-not-deliverable` pass (6/6) after a rerun. In the first batch these two failed: the first because the fresh database had no geo reference data (fixed with `prisma db seed`), the second with 172 s and 30 s timings under machine load.
- `pnpm openapi:check`: passed (no contract change). `pnpm docs:validate`: passed. `pnpm coverage:diff`: 14/14 changed lines covered (100 %, floor 80 %).

## Completion summary

The database now refuses a second default address for one customer (`addresses_one_default_per_user`, partial unique index created by a CLI-generated migration holding raw SQL, with a deterministic clean-up first). `remove()` deletes and promotes in one transaction under the per-user lock. `update()` and `remove()` re-read the address under the lock and answer 404 when it vanished. No request or response shape changed.

**Deviations from the plan.** Existing unit tests in `addresses.service.spec.ts` got one extra mock (the re-read under the lock) and the promotion `orderBy` now has an `id` tie-break; nothing was weakened or skipped. The `lock_timeout` line was added after review.

**Not verified / open.** (1) The owner approved the duplicate clean-up rule (2026-11-16); the migration is committed locally but applied to no shared database (0 duplicates were found anyway). (2) Running `migrate deploy` on the shared `tamiym_workshop_test` (e2e global setup does it) will add the index there: no duplicates, so no data change. (3) Not tested end to end: createdAt ties in `remove` (unit-level only).

**Out of scope, noticed.** `update()` merges derived fields from the address read before the lock, so two parallel edits of the same address can overwrite each other with stale values (does not affect the single default). Deleting an address used by an order answers 500 (foreign key `RESTRICT`) instead of 409; now atomic, so nothing is lost.
