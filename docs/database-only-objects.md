# Database-only objects

Some rules live in PostgreSQL because Prisma cannot express them. They exist only in the SQL of `apps/api/prisma/migrations`, so a reader of `schema.prisma` will not see them. This page lists every one, with the migration that owns it. Check the list against a database built from migrations when you add or remove such an object.

## Keeping the schema and the migrations aligned

`pnpm migrations:check` (TTW-005) fails when `schema.prisma` and the migrations disagree. It runs `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` and also runs in CI, in the `migration-baseline` job.

It needs PostgreSQL and a dedicated shadow database, which Prisma resets on every run. Set `SHADOW_DATABASE_URL`, or create `<your database>_shadow`, which is the default. The check refuses a URL that does not name exactly one database, a name over 63 bytes (Postgres would truncate it), a name that does not contain `shadow`, and a name equal to the one in `DATABASE_URL`, on any host. That protects against mistakes only: a real database whose name contains `shadow` would still be reset.

`pnpm release:verify-migrations` is a different check: it compares the migrations with a live database and never reads `schema.prisma`.

## How Prisma sees each kind of object

| Kind                   | What `migrate diff` does                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generated columns      | Reads them as columns with a default. They must be declared in `schema.prisma`, or Prisma proposes to drop them. The `dbgenerated` text must match what Postgres stores. |
| `EXCLUDE` constraints  | Ignores them.                                                                                                                                                            |
| `CHECK` constraints    | Ignores them.                                                                                                                                                            |
| Partial indexes        | Ignores them.                                                                                                                                                            |
| Functions and triggers | Ignores them.                                                                                                                                                            |
| Extensions             | Ignores them, because the `postgresqlExtensions` preview feature is not enabled.                                                                                         |

Nothing warns you when an ignored object goes missing, so a migration that removes one looks clean. Tests are the only protection: keep a test on real Postgres for each rule that matters.

## Inventory

### Generated columns and the bulk tier constraint

| Object                                                    | Table          | Owner                                                                                                | Purpose                                                                                                                        |
| --------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `variantKey` (stored generated)                           | `bulk_pricing` | `20260820120000_ttw024_pricing_tax_snapshots`                                                        | `COALESCE("variantId", '')`, so that `EXCLUDE` can compare product-wide tiers, whose `variantId` is `NULL`.                    |
| `quantityRange` (stored generated)                        | `bulk_pricing` | `20260820120000_ttw024_pricing_tax_snapshots`, redefined by `20261106103430_ttw005_reconcile_schema` | `int4range("minQuantity", "maxQuantity", '[]')`. An empty `maxQuantity` gives an unbounded range.                              |
| `bulk_pricing_quantity_no_overlap` (`EXCLUDE USING gist`) | `bulk_pricing` | `20260820120000_ttw024_pricing_tax_snapshots`, recreated by `20261106103430_ttw005_reconcile_schema` | Tiers cannot overlap for the same product, variant and currency. Covered by `apps/api/test/schema-reconciliation.e2e-spec.ts`. |
| `btree_gist` (extension)                                  | —              | `20260820120000_ttw024_pricing_tax_snapshots`                                                        | Lets the `EXCLUDE` constraint compare plain columns with `=`.                                                                  |

Both columns are read-only and `variantKey` carries `@ignore`, so neither appears in Prisma Client. `Unsupported` fields never appear there, and Prisma rejects `@ignore` on them.

**Changing an expression.** Prisma generates `ALTER COLUMN ... SET DEFAULT`, which Postgres rejects on a generated column. Replace that statement by hand: drop the constraint, drop the column, add it back with the new expression, and add the constraint back. Then update the `dbgenerated` text to the form Postgres stores, which you can read with `pg_get_expr`.

### Discount lock trigger

| Object                                                                                          | Table                   | Owner                                         | Purpose                                                                   |
| ----------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| `enforce_discount_lock_pct_fixed_compat()` and trigger `discount_active_locks_pct_fixed_compat` | `discount_active_locks` | `20260820120000_ttw024_pricing_tax_snapshots` | Rejects percentage and fixed discounts that conflict on the same subject. |

### `CHECK` constraints

| Object                                    | Table    | Owner                                                 | Purpose                                                              |
| ----------------------------------------- | -------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| `orders_idempotency_fingerprint_required` | `orders` | `20261102220724_ttw037_order_idempotency_fingerprint` | An order with an idempotency key must store its request fingerprint. |

### Partial unique indexes

| Index                                                  | Table                             | Owner migration           | At most one row per…                                 |
| ------------------------------------------------------ | --------------------------------- | ------------------------- | ---------------------------------------------------- |
| `campaign_ledger_one_payment_settled_per_order`        | `campaign_balance_ledger_entries` | `20260819120000_ttw010_*` | order, for `PAYMENT_SETTLED` entries                 |
| `campaign_ledger_one_payout_reserved_per_payout`       | `campaign_balance_ledger_entries` | `20260819130000_ttw011_*` | payout, for `PAYOUT_RESERVED` entries                |
| `campaign_ledger_one_payout_succeeded_per_payout`      | `campaign_balance_ledger_entries` | `20260819130000_ttw011_*` | payout, for `PAYOUT_SUCCEEDED` entries               |
| `campaign_ledger_one_payout_failed_release_per_payout` | `campaign_balance_ledger_entries` | `20260819130000_ttw011_*` | payout, for `PAYOUT_FAILED` entries                  |
| `campaign_ledger_one_refund_applied_per_refund`        | `campaign_balance_ledger_entries` | `20260820010000_ttw013_*` | refund, for `REFUND_APPLIED` entries                 |
| `payments_one_active_attempt_per_order`                | `payments`                        | `20260819140000_ttw012_*` | order, while the payment is `PENDING` or `INITIATED` |
| `reconciliation_findings_open_fingerprint_key`         | `reconciliation_findings`         | `20260820030000_ttw015_*` | fingerprint, while the finding is `OPEN`             |
| `privacy_requests_one_active_erasure_per_user`         | `privacy_requests`                | `20260820201000_ttw025_*` | user, for active erasure requests                    |
| `moderation_appeals_one_pending_per_decision`          | `moderation_appeals`              | `20260820220000_ttw027_*` | decision, while the appeal is `PENDING`              |
| `organizer_applications_one_pending_per_user`          | `organizer_applications`          | `20260821010000_ttw030_*` | user, while the application is `PENDING`             |
| `shipments_one_active_outbound_per_order`              | `shipments`                       | `20260821100000_ttw040_*` | order, for outbound shipments that are not cancelled |
| `shipments_carrier_tracking_unique`                    | `shipments`                       | `20260821100000_ttw040_*` | carrier tracking key, when one is set                |
| `user_payout_profiles_one_default_per_user`            | `user_payout_profiles`            | `20260821110000_ttw042_*` | user, for the default payout profile                 |

Each `*` stands for the rest of the migration folder name.

## `prisma db push`

`prisma db push` no longer works on this schema: it treats the two `dbgenerated` values as ordinary defaults and stops with `cannot use column reference in DEFAULT expression`. It would also skip every other object on this page. Always build a database with `prisma migrate deploy`. Nothing in this repository uses `db push`.
