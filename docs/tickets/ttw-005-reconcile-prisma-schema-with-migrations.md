# TTW-005 — Reconcile the Prisma schema with the migration history

**Epic:** 0 — Trustworthy delivery system\
**Status:** Not started\
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

- [ ] The schema-vs-migrations diff is empty (or only reviewed allowlisted entries remain).
- [ ] A check fails CI when new drift appears.
- [ ] Overlapping bulk price tiers are still rejected by the database.
- [ ] `payments.status` default is the same in schema and database.
- [ ] Database-only objects are documented.

## Out of scope

- Changing bulk pricing or payment behaviour.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
