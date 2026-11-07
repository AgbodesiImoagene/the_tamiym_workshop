# TTW-081 — Enforce one local refund per Paystack refund id

**Epic:** 1 — Financial and inventory integrity\
**Status:** Complete\
**Risk:** Critical\
**Blocked by:** None\
**Blocks:** None

## Background

A Paystack refund id should map to exactly one local `Refund`, but nothing in the database enforces that:

- `Refund.providerRef` is `String?` with only a non-unique `@@index([provider, providerRef])` (`apps/api/prisma/schema.prisma:1974`, `:1995`).
- The refund webhook resolves the local refund with `findFirst({ provider, providerRef })` and no ordering (`apps/api/src/orders/refunds.service.ts:660`). If two rows share an id, it settles whichever Postgres returns first.
- `settleRefundProcessed` returns early when that row is already settled (`refunds.service.ts:802`). The settlement claim key includes the refund id (`refund.processed:${refund.id}:${providerRef}`, `:813`), so it does not prevent two rows from sharing a provider id either.
- TTW-079 showed the consequence in tests: a reused id made the webhook pick an old, settled refund, and the new refund was never applied (the order stayed `PAID`). In production, Paystack ids are unique, so this needs a provider bug, a replayed mock, or a manual data fix to happen. Still, money correctness should come from a database constraint, not from a provider's behaviour (`.cursor/rules/financial-integrity.mdc`: idempotency enforced by DB unique constraints).

Reconciliation also keys remote refunds by `providerRef` (`apps/api/src/reconciliation/reconciliation-runs.service.ts:962-1001`). A duplicate would make it compare the wrong local row.

## Proposal

- Replace `@@index([provider, providerRef])` with `@@unique([provider, providerRef])`. This needs a Prisma CLI-generated migration. Postgres treats NULLs as distinct, so refunds without a provider id stay allowed. The in-flight placeholder `driving:${refund.id}` (`refunds.service.ts:480`, `:523`) is already unique per row.
- Where the provider id is written (`refunds.service.ts:526`, `:555`), treat a unique violation (`P2002`) as a provider anomaly. The refund moves to `NEEDS_ATTENTION` with an audit entry and an error log. The code must neither overwrite nor settle the other row.
- Before the migration, add a check that lists duplicate `(provider, providerRef)` pairs. The migration must fail loudly if any exist; it must not silently drop rows. The project is not in production yet, so dev and test databases can be cleaned by hand if the check finds anything.
- Rejected: ordering `findFirst` by `createdAt desc`. That changes which row wins but keeps two rows for one provider refund.

## Invariants

- At most one `Refund` row per `(provider, providerRef)` when `providerRef` is not null.
- A refund webhook settles at most one local refund, and only the one that owns the provider id.
- Ledger entries stay immutable; no existing settled refund is rewritten.
- No database transaction is held open across the Paystack call.

## Implementation plan

1. Read `docs/orders/ttw-041-interim-policy.md` and `docs/tickets/ttw-013-correct-refund-lifecycle.md`, and record the design review (critical: invariants, threat and concurrency analysis).
2. Write the failing integration tests first (see below).
3. Schema change and CLI-generated migration (`pnpm --filter api exec prisma migrate dev --name ttw081_unique_refund_provider_ref`), with the duplicate pre-check.
4. Handle `P2002` on provider-id writes → `NEEDS_ATTENTION` + audit + log.
5. Update the interim policy doc, OpenAPI/enums if anything changes (`pnpm openapi:check`, `pnpm enums:check`), and the coverage ratchet.

### Deviations from the plan (2026-11-07)

- **Migration generation.** `prisma migrate dev --create-only` stops with "Prisma Migrate has detected that the environment is non-interactive" because it asks to confirm the unique-constraint warning. Answering that prompt automatically was refused by the agent's permission check. The SQL comes from the same CLI instead: `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script` printed exactly `DROP INDEX "refunds_provider_providerRef_idx"` and `CREATE UNIQUE INDEX "refunds_provider_providerRef_key" …`. That output went into `20261107164930_ttw081_unique_refund_provider_ref/migration.sql`, after the hand-written pre-check block. `pnpm migrations:check` confirms there is no drift.
- **Local Prisma env.** `apps/api/.env` points at port 5433, where nothing listens. The Prisma CLI commands were run with `DATABASE_URL` taken from `apps/api/.env.test` (`tamiym_workshop_test`) and `SHADOW_DATABASE_URL` from `apps/api/.env`.
- **Policy doc.** `docs/06-payments-and-payouts-paystack.md` (§ Refunds) was updated, not `docs/orders/ttw-041-interim-policy.md` (see Design review).
- **Wider scope inside the ticket.** Six provider-id writes are handled, not one (see Design review).
- **Test DB cleanup (owner-approved).** The test DB had 11 duplicate pairs: 5 from runs before TTW-079, and 6 written by the new e2e spec while it was still failing. With the owner's approval, `providerRef` was set to NULL on the newer row of each pair (11 rows, none deleted).
- **Fixes to the new unit tests themselves.** Two of the new unit tests first made the stale-claim sweep fail instead of the provider-id write. One of them passed for that wrong reason. Both mocks now fail only the provider-id write; no assertion was removed, and the rethrow test gained two assertions.

## Test and observability plan

- Unit/component: `refunds.service.spec.ts`, P2002 on the provider-id write → `NEEDS_ATTENTION`, no settlement.
- Integration/e2e (real Postgres): inserting two refunds with the same `(PAYSTACK, providerRef)` is rejected by the database. A provider returning an id already owned by another refund leaves the new refund in `NEEDS_ATTENTION`, does not touch the other refund, and writes no ledger entry.
- Failure, retry, and concurrency: two concurrent initiations whose provider calls return the same id. Exactly one row gets the id, and the other goes to `NEEDS_ATTENTION`. Sequential and concurrent duplicate webhooks still settle exactly once (existing TTW-013 tests stay green).
- Logs, metrics, traces, and alerts: an error log with the refund ids (no PII) and an audit entry for the anomaly; reconciliation surfaces it.

## References

- `apps/api/prisma/schema.prisma:1974`, `:1995`: nullable `providerRef`, non-unique index.
- `apps/api/src/orders/refunds.service.ts:660`: `findFirst` by `providerRef`.
- `apps/api/src/orders/refunds.service.ts:802`, `:813`: early return; claim key includes the refund id.
- `apps/api/src/orders/refunds.service.ts:480`, `:523`, `:526`, `:555`: placeholder and provider-id writes.
- `apps/api/src/reconciliation/reconciliation-runs.service.ts:962-1001`: reconciliation keyed by `providerRef`.
- `docs/tickets/ttw-079-unique-refund-e2e-provider-ids.md`: how the collision showed up.

## Acceptance criteria

- [x] The database rejects a second refund with the same non-null `(provider, providerRef)`, proven by an integration test that fails before the change.
- [x] A duplicate provider id from Paystack leaves the new refund in `NEEDS_ATTENTION`, with no settlement and no ledger entry.
- [x] Sequential and concurrent duplicate tests pass against real Postgres. TTW-013 refund tests stay green.
- [x] Migration SQL generated by the Prisma CLI (`migrate diff`, see deviations), with a duplicate pre-check; the refund lifecycle doc (`docs/06`) is updated.
- [x] All quality gates pass locally (evidence below). CI green on `main` at `e338157` (runs 42405101038 and 42405101037).

## Out of scope

- The same question for payouts (`Payout` transfer references) and charges. Check their constraints separately if needed.
- Emptying the e2e database between runs.

## Design review

**Reviewer:** implementing agent (TTW-081)\
**Date:** 2026-11-07\
**Verdict:** Proceed, with the scope corrections below

### Corrections to the proposal

- `refunds.service.ts:555` is an audit log, not a write. The provider id is written in six places, not one: the initiation write (`:526`) and five webhook writes, `markRefundInFlight` (`:737`), `markRefundFailed` (`:779`), the amount and currency mismatch paths (`:829`, `:853`) and the settlement transaction (`:894`). All six must handle the new constraint.
- Without handling, `:737`, `:779`, `:829` and `:853` would throw a raw `P2002`. The webhook would answer 500 and Paystack would retry it forever.
- `:894` runs inside the settlement transaction, whose `catch` (`:994`) reads every `P2002` as "settlement claim already exists". A provider-id conflict there would roll back (no ledger entry, which is safe) but leave the refund in its old status with only an error log. It must be told apart from a real duplicate.
- The refund lifecycle is described in `docs/06-payments-and-payouts-paystack.md` (§ Refunds), not in `docs/orders/ttw-041-interim-policy.md`, which covers eligibility only. That section also gives the claim key as `refund.processed:{providerRef}`, while the code uses `refund.processed:{refundId}:{providerRef}` (`:813`). Both are fixed in this ticket.

### Algorithm

1. Schema: `@@index([provider, providerRef])` becomes `@@unique([provider, providerRef])`. NULLs stay distinct in Postgres, so refunds without a provider id are unaffected. The placeholder `driving:{refundId}` is unique per row.
2. Migration: SQL generated by the Prisma CLI (see the deviation below on why `migrate diff` replaced `migrate dev`). A `DO $$ … RAISE EXCEPTION $$` block placed before the index change lists the duplicate pairs and stops the migration. Rows are never deleted by the migration.
3. Initiation (`:519`): a `P2002` on the provider-id write moves the row from `INITIATED`/`driving:{id}` to `NEEDS_ATTENTION` with `providerRef = null`. This is the same shape the existing re-drive path expects (`:258-268`). The reservation still counts toward the captured-value cap (`NEEDS_ATTENTION` is in `IN_FLIGHT`). The conflicting provider id goes into an audit entry and an error log (refund ids only, no PII). Metric `refund_settlement_total{outcome="rejected"}`. No settlement, even when Paystack answered `processed`.
4. Webhook status writes (`:737`, `:779`, `:829`, `:853`): on `P2002`, the matched refund moves to `NEEDS_ATTENTION` without taking the provider id (only from an in-flight or failed status, never from `SUCCEEDED`), with the same audit, log and metric. The webhook answers normally.
5. Settlement (`:894`): after a `P2002`, the service checks first for its own settlement claim (duplicate, as today), then whether another refund owns the provider id. In that case the transaction has already rolled back, and the refund moves to `NEEDS_ATTENTION` outside the transaction, with audit, log and metric. The check does not rely on the shape of Prisma's error metadata, which differs with the pg driver adapter.

### Invariants

- At most one `Refund` per non-null `(provider, providerRef)`, enforced by Postgres.
- A webhook settles at most one refund, the one that owns the provider id. A conflict never settles, never writes a ledger entry and never rewrites the other refund.
- No transaction is open across the Paystack call (unchanged: the conflict is handled after the call, in short writes).
- Ledger entries stay immutable.

### Threat and concurrency analysis

- **Provider bug or replayed mock returning a used id:** the database refuses the second owner; the new refund goes to `NEEDS_ATTENTION` for an operator.
- **Two concurrent initiations receiving the same id:** both `updateMany` calls race on the unique index; Postgres lets exactly one commit, the other gets `P2002` and goes to `NEEDS_ATTENTION`.
- **Webhook racing an initiation for the same id:** the webhook looks the id up first, so it only writes an id nobody owned at lookup time. If an initiation takes the id in between, the webhook write fails with `P2002` and follows step 4 or 5.
- **Retry after a conflict:** the same idempotency key re-drives a `NEEDS_ATTENTION` row (`:254-275`). Paystack returns the same id, the conflict repeats and the row returns to `NEEDS_ATTENTION`. No money moves, so this is bounded and safe.
- **Reconciliation** (`reconciliation-runs.service.ts:962-1001`) keys refunds by `providerRef`; the constraint makes that key sound. No code change is needed there.
- **Existing data:** the project is not in production. Dev and test databases are checked with the same duplicate query before the migration and cleaned by hand, with the owner's approval, if needed.

### Migration forward / rollback

**Forward:** `pnpm --filter api exec prisma migrate deploy`.\
**If the pre-check fails:** Postgres makes no change, but Prisma records the migration as failed in `_prisma_migrations` (P3018) and blocks every later migration. Fix the duplicates, run `pnpm --filter api exec prisma migrate resolve --rolled-back 20261107164930_ttw081_unique_refund_provider_ref`, then deploy again.\
**Rollback (manual):** `DROP INDEX "refunds_provider_providerRef_key"; CREATE INDEX "refunds_provider_providerRef_idx" ON "refunds"("provider", "providerRef");`, then remove or resolve the migration's row in `_prisma_migrations`. No refund data changes either way.

### Known limits, accepted

- Each delivery of a conflicting webhook writes another audit entry and touches `updatedAt`, because the flag guard includes `NEEDS_ATTENTION`. Noisy but harmless.
- A conflict can move a `FAILED` refund (reservation released) back to `NEEDS_ATTENTION`, so it counts toward the cap again until an operator resolves it. The pre-existing amount and currency mismatch paths already did this. Documented in `docs/06`.
- If an initiation's `driving:` claim was cleared before the flag runs (needs a Paystack call longer than 45 s, while the client times out at 20 s), the conflict leaves only an error log; the row is later escalated by `failStaleInitiatedRefunds`.
- Settlement: on a unique error with no own claim and no other owner, the webhook still answers `true` with an error log, as before this ticket. Not changed here.

## Implementation reviews

### Iteration 1: PASS with should-fix items (2026-11-07)

Independent read-only reviewer (fresh agent). Charter: financial integrity, database constraints, concurrency, tests, logs, and accuracy of the docs.

- Invariants hold. The only unique key these refund writes can break is `(provider, providerRef)`: `id` and `idempotencyKey` are never written, and there are no DB-only objects on `refunds`. The settlement catch tells a real duplicate (own claim, committed before the `P2002` surfaces) from a provider-id conflict (only possible through a race). Metrics are counted once. The pre-check raises before any DDL, and the index names match Prisma's. The e2e spy really reaches the production paths.
- **S1** the ticket said `migrate dev`, but the SQL came from `migrate diff` → fixed (deviation below).
- **S2** the rollback notes left out the failed-migration state in `_prisma_migrations` → fixed (above).
- **S3** retry with the same idempotency key after a conflict was not tested → added the e2e test `stays in NEEDS_ATTENTION when the same idempotency key retries into the same conflict`.
- Nits: N1, N2, N4 and the N3 edge case are accepted and documented (Known limits, `docs/06`). N6 is fixed in `docs/06`. N5: the "concurrent initiations" test resolves both mocks in the same tick, but the two writes may run one after the other; the result is the same either way.

### Iteration 2: PASS (2026-11-07)

The same reviewer, read-only, checked the fixes. S1, S2 and S3 are resolved, and the nits are documented. No blocking or should-fix finding is left. Code and migration were unchanged since iteration 1.

The reviewer also noted, without blocking: `main` has moved on by 6 commits (docs and Playwright CI only: TTW-170, TTW-176; nothing under `apps/api`). `docs/tickets/README.md` will likely conflict at merge, because the TTW-170/176 rows sit close to the TTW-081 row. Keep both sides.

## Verification evidence

All commands were run on 2026-11-07 in the ticket worktree, against local Postgres 17 (`tamiym_workshop_test`) and Redis.

**Tests first, failing for the right reason (before the schema and service change):** `pnpm --filter api test:e2e -- test/refund-provider-ref-uniqueness.e2e-spec.ts` gave 6 failed, 1 passed:

- the second insert resolved instead of being rejected;
- the initiation that reused an id ended `SUCCEEDED` instead of `NEEDS_ATTENTION`;
- 2 rows shared one id after the concurrent initiations;
- the race tests ended `SUCCEEDED`, `PROCESSING` and `FAILED` instead of `NEEDS_ATTENTION`.

The "several NULL ids" test passed, as expected. In the unit spec, 8 new tests failed. The 2 that passed pin behaviour that does not change: a non-unique error is rethrown, and settlement with no claim and no owner keeps the old rejection.

**Migration pre-check:** `prisma migrate deploy` on the test DB, which held 11 duplicate pairs, failed with `P0001 TTW-081: refunds share a provider refund id; fix them before migrating: PAYSTACK/… (2 rows), …`. Nothing changed in the schema. Then `migrate resolve --rolled-back`, the owner-approved cleanup (11 rows set to NULL, duplicate query → 0 pairs) and `migrate deploy` gave "All migrations have been successfully applied".

**After the change:**

| Command                                                                                                                    | Result                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm --filter api test -- src/orders/refunds.service.spec.ts`                                                             | 38 passed                                                             |
| `pnpm --filter api test:e2e -- test/refund-provider-ref-uniqueness.e2e-spec.ts test/paystack-refund-lifecycle.e2e-spec.ts` | 13 passed (8 new + 5 TTW-013)                                         |
| `pnpm --filter api test:e2e` (full suite)                                                                                  | 21 suites, 126 tests passed                                           |
| `pnpm --filter api test` / `pnpm --filter api test:coverage`                                                               | 145 suites, 1227 tests passed                                         |
| `pnpm coverage:ratchet`                                                                                                    | passed (lines 82.33 % vs floor 56.00 %, functions 71.78 % vs 54.64 %) |
| `pnpm coverage:diff` (vs `origin/main` 7077aef)                                                                            | 31/31 changed lines covered (100 %), floor 80 %                       |
| `pnpm --filter api lint`                                                                                                   | 0 errors, 14 warnings, all pre-existing and none in changed files     |
| `pnpm typecheck`                                                                                                           | 6/6 tasks successful                                                  |
| `pnpm migrations:check`                                                                                                    | "Prisma schema matches the migrations."                               |
| `pnpm enums:check` / `pnpm openapi:check`                                                                                  | passed, no drift (no contract change)                                 |
| `pnpm docs:validate` / `pnpm format:check`                                                                                 | passed                                                                |

Not run: Playwright, which covers no UI change in this ticket. CI, because nothing is pushed.

## Completion summary

**State: Verified.** Merged into `main` at the owner's request (`e338157`, merge of `6d2e708`) and pushed. CI is green on `e338157`: run 42405101038 (CI) and run 42405101037 (Playwright Comprehensive) both succeeded.

- Postgres now enforces one refund per `(provider, providerRef)`. The migration refuses to run while duplicates exist.
- Every write of a provider refund id handles a conflict: the refund goes to `NEEDS_ATTENTION`, nothing settles, the owner is untouched, and the service writes an audit entry, an error log and a metric.
- After the merge, `main` was checked again: the API typecheck, the refund unit spec (38 passed), both refund e2e specs (13 passed), `pnpm migrations:check`, `pnpm docs:validate` and `pnpm format:check` all passed.
- Before running the migration on any other database: run the duplicate query from the pre-check; if it fails, follow "Migration forward / rollback".
