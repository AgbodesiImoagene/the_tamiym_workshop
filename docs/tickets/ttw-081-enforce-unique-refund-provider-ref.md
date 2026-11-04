# TTW-081 — Enforce one local refund per Paystack refund id

**Epic:** 1 — Financial and inventory integrity\
**Status:** Scoped\
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

- [ ] The database rejects a second refund with the same non-null `(provider, providerRef)`, proven by an integration test that fails before the change.
- [ ] A duplicate provider id from Paystack leaves the new refund in `NEEDS_ATTENTION`, with no settlement and no ledger entry.
- [ ] Sequential and concurrent duplicate tests pass against real Postgres. TTW-013 refund tests stay green.
- [ ] Migration generated by the Prisma CLI, with a duplicate pre-check; interim policy doc updated.
- [ ] All quality gates pass (unit, API e2e, coverage ratchet and diff, OpenAPI/enums checks), with evidence recorded below; CI green.

## Out of scope

- The same question for payouts (`Payout` transfer references) and charges. Check their constraints separately if needed.
- Emptying the e2e database between runs.

## Design review

Pending (required: critical).

## Implementation reviews

Pending.

## Verification evidence

Pending.

## Completion summary

Pending.
