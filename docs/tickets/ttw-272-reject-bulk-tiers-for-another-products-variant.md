# TTW-272 — Reject bulk tiers for another product's variant

**Epic:** 2 — Security and trust boundaries  
**Status:** Complete (committed on the ticket branch; not merged or pushed)  
**Risk:** Critical  
**Blocked by:** None  
**Blocks:** None

## Background

`POST /v1/admin/bulk-pricing` accepts a tier whose `variantId` belongs to another product than its `productId`. Nothing checks the pair: not the DTO (`apps/api/src/admin/dto/create-bulk-pricing.dto.ts`, strings only), not `BulkPricingService.create`, and not the database, which holds two independent foreign keys (`productId → products`, `variantId → product_variants`).

Before the fix (`ecdbd71`), the quote read a variant's own tiers by `variantId` only (`apps/api/src/pricing/pricing.service.ts:418`), and those replace the product tiers (`:654`). A tier filed under product B for a variant of product A therefore set the price of A's variant, while the admin list showed it under B. The overlap constraint is keyed by `(productId, variant, currency, range)`, so it did not see that this tier overlapped A's own tiers.

Reproduced on 2026-11-25 on real Postgres (`apps/api/test/bulk-pricing-variant-owner.e2e-spec.ts`): the request answers **201** instead of 400, and the quoted unit price of the variant goes from **5000 to 100**.

Found while reading the code for TTW-271. TTW-271 does not fix it: it filters the product-level tiers, and this row is loaded as a variant tier. TTW-172 (not started) already lists "a variant of a different product is rejected"; this ticket delivers that one criterion.

### Write paths

| Path                                     | Can store a foreign pair?                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/admin/bulk-pricing`            | **Yes** (reproduced).                                                                                                |
| `PATCH /v1/admin/bulk-pricing/:id`       | No. The service writes quantities and price only; `productId` and `variantId` in the body are ignored (pinned test). |
| Bulk, import, seed or script path        | None writes bulk tiers.                                                                                              |
| `PATCH` of a variant (`updateVariant`)   | No. No code changes `ProductVariant.productId`.                                                                      |
| Direct Prisma or SQL write               | **Yes**, the database accepts it.                                                                                    |
| Admin page `/admin/pricing/bulk-pricing` | Not in normal use: choosing a product clears the variant and lists that product's variants only.                     |

The admin page shows the API `message` under the form (`apps/admin/lib/api.ts:139`, `bulk-pricing/page.tsx` `onError`), so a clear 400 needs no front-end change.

## Proposal

Approved by the user on 2026-11-25 (database and API).

1. **Database:** replace the `variantId` foreign key with a composite one, `bulk_pricing(variantId, productId) → product_variants(id, productId)`, plus the unique index `product_variants(id, productId)` it needs. Prisma expresses both, so `schema.prisma` stays the source and `migrations:check` guards it. A `NULL` `variantId` (product tier) is not checked by Postgres, as wanted. `ON DELETE CASCADE` is unchanged.
2. **API:** `BulkPricingService.create` checks that the variant belongs to the product and answers 400 `Variant does not belong to this product.` The foreign-key violation maps to the same 400, for a variant removed between the check and the write.
3. **No automatic cleanup:** the migration fails if a foreign pair already exists. A read-only query that lists such rows is added to `apps/api/scripts/inventory-pricing-conflicts.sql`.

Rejected alternatives:

- Application check alone: the critical-risk rule requires database enforcement, and a direct write would still pass.
- Trigger: needs a second trigger on `product_variants`, careful locking against concurrent writes, and is invisible to Prisma.
- Filtering the quote by product instead of refusing the row: hides it, and edits `pricing.service.ts`, owned by TTW-271. The composite relation does filter that read as a side effect (see Design review), on top of the refusal.

## Invariants

- A bulk tier with a variant always names that variant's own product.
- A rejected request writes nothing.
- A tier filed under one product never changes another product's price.
- Valid product-level and variant tiers save and price as they do today.
- Deleting a variant or a product still deletes its tiers.

## Implementation plan

1. Done: reproducing e2e tests, failing for the right reason.
2. Done: failing tests for the database rule and the service unit before the fix.
3. Done: `schema.prisma` changed; migration `20261125163210_ttw272_bulk_tier_variant_owner` generated by `prisma migrate dev --create-only`, unedited.
4. Done: check and error mapping in `bulk-pricing.service.ts`; 400 description; `pnpm openapi:generate`.
5. Done: preflight query, `docs/pricing-strategy.md`, TTW-172, `docs/tickets/README.md`.
6. Done: quality gates and independent implementation review; its findings addressed.

Deviations:

- `migrate dev` asks for a confirmation (new unique index), so it was answered through `expect`. Its comment-only change to `migration_lock.toml` was reverted.
- The race test removes the variant during the overlap read, on real Postgres, on top of the unit test of the mapping.
- After the review: tests added for a repeated request, foreign requests sent at once, and a variant deleted while its tier is written. The first version of that last test never reached the race (review 2, R1); it now holds the delete open until PostgreSQL shows the insert waiting.

## Test and observability plan

- Unit/component: `bulk-pricing.service.spec.ts` — foreign variant, unknown variant, foreign-key mapping, nothing written.
- Integration/e2e: `bulk-pricing-variant-owner.e2e-spec.ts` (HTTP, quote, database), plus `bulk-pricing-quantity-limits`, `schema-reconciliation` and `pricing-quote`.
- Failure, retry, and concurrency (e2e): a foreign pair sent twice, then several copies at once beside a valid tier (refused by the ownership read); a variant deleted while the tier is written (the insert waits on the foreign key, then answers 400); and the removal forced between check and write (400).
- Logs, metrics, traces, and alerts: none added; the request log records the 400.

## References

- At `ecdbd71`: `apps/api/src/bulk-pricing/bulk-pricing.service.ts`, `create`, no ownership check.
- At `ecdbd71`: `apps/api/src/pricing/pricing.service.ts:418` and `:654`, variant tiers loaded by variant only.
- `apps/api/prisma/schema.prisma`, models `BulkPricing` and `ProductVariant`.
- `docs/tickets/ttw-172-reject-unknown-bulk-tier-references.md`.

## Acceptance criteria

- [x] Creating a tier with another product's variant answers 400 with a clear message and stores nothing.
- [x] The quoted price of that variant does not change.
- [x] The database refuses a foreign pair on direct insert and update.
- [x] Valid product-level and variant tiers behave as before; cascades are kept.
- [x] The migration is CLI-generated and `pnpm migrations:check` passes.
- [x] Swagger and generated OpenAPI artefacts match.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- Unknown `currency` or `productId` answering 500 → TTW-172.
- `UpdateBulkPricingDto` advertises `productId`, `variantId` and `currency`, which `PATCH` ignores → not ticketed.
- Price limits → TTW-171.
- Product tiers loaded without `variantId: null` in the quote → TTW-271 (merged into local `main`).
- Two identical variant tiers created at once: the unique index violation is not translated, so a 500 is likely (read in code and SQL by the reviewer, not played over HTTP) → not ticketed.
- Product deleted between the check and the write: the product foreign key answers 500 → TTW-172.
- No audit log on bulk tier changes → not ticketed.

## Design review

2026-11-25, by the implementing session (not independent). Verdict: **approved** by the user on 2026-11-25.

- Blast radius: admin tier creation, one constraint and one index. No quote, order or front-end source file changes, and stored orders are untouched. The quote's **query** does change: Prisma now reads `ProductVariant.bulkPricing` by `productId` and `variantId` (found by the review, confirmed in the query log). Valid rows give the same result.
- Prisma write caveats, with no caller today: connecting product B and a variant of A silently stores product A; `variant: { disconnect: true }` fails (`P2011`); connecting another variant also changes `productId`.
- `ON UPDATE CASCADE`: changing `ProductVariant.productId` would move its tiers. No code does.
- Duplication: overlaps one criterion of TTW-172.
- Interfaces: same endpoint and shape; one more cause of 400. An unknown `variantId` now gets that 400 instead of a 500.
- Threat: admin-only endpoint, so the exposure is a mistake, a stale or direct call, or a compromised admin session. The effect is a wrong price on a real order, shown under another product.
- Concurrency: the foreign key is enforced by Postgres, independent of the application check.
- Database check: the exact statements Prisma proposes (`migrate diff`) were run in a rolled-back transaction on the throwaway database. Valid rows accepted; foreign insert and foreign update refused; deleting a variant removed its tier and kept the product tier.
- Existing data: on 2026-11-25 the local database held 8 tiers, none with a variant. On 2026-11-28 the development database, now `tamiym_workshop_dev` (TTW-268), holds 48 tiers, none with a variant (read-only query), so the migration applies there. The project is not in production.
- Merge risk: TTW-267 and TTW-269 also add migrations and change `schema.prisma`; TTW-266, TTW-267 and TTW-269 may regenerate the OpenAPI files. After merging, the development and shared test databases need `prisma migrate deploy`.

## Implementation reviews

### Review 1 — 2026-11-28, independent reviewer (separate agent, did not write the change)

Verdict: **PASS**, no blocking finding. Financial correctness, database and migration, concurrency, security, write paths and error contract pass. With reservations: Prisma client (S1, N3), test quality (S2), ticket and docs (S1, S2, N1, N4).

| Finding                                                                                      | Action                                                                  |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| S1: the composite relation also filters the quote query; comments, docs and ticket said less | Confirmed with the reviewer's query probe; comments, docs, ticket fixed |
| S2: test plan claimed a repeated request; no truly concurrent test                           | Three e2e tests added                                                   |
| N1: recovery after a failed migration only in the evidence                                   | Added to the SQL comment and `pricing-strategy.md`                      |
| N2: update cascade undocumented                                                              | Documented                                                              |
| N3: Prisma relation write caveats                                                            | Recorded in Design review                                               |
| N4: stale line references                                                                    | Fixed                                                                   |
| N5: an uncommitted development seed (another worktree) writes product tiers                  | Compatible with the key; reported to the parent session                 |

Reviewer's own runs: 11 e2e suites 86/86; `bulk-pricing|pricing.service|admin` unit 260/260; removing the check, the mapping or the whole fix makes tests fail; `migrations:check` and `openapi:check` pass. Pre-existing problems it found are under Out of scope.

### Review 2 — 2026-11-28, same reviewer, targeted pass on the fixes

Verdict: **PASS**. No production logic or migration change since review 1 (checked by file hashes).

| Finding                                                                                       | Action                                                                                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| R1: the "deleted at the same time" test always lost the race to the delete, so proved nothing | Replaced by a deterministic test; with the error mapping removed it fails (500). Not re-reviewed. |
| R2: the review 1 summary omitted its reservations                                             | Summary corrected                                                                                 |

S1 and N1 to N4 confirmed addressed. No rollback SQL for the migration is written (minor, left as is).

## Verification evidence

Throwaway database `tamiym_workshop_test_ttw272`, `REDIS_DB=12`.

### Before the fix (2026-11-25)

- `jest --config ./test/jest-e2e.json bulk-pricing-variant-owner`, no source change: 2 failed, 3 passed (expected 400, received **201**; quoted price expected 5000, received **100**).
- Same file completed, still no source change: 7 failed, 5 passed (unknown or removed variant answered **500**; the database accepted a foreign insert and two foreign updates).
- `jest bulk-pricing.service`: 4 new tests failed, 6 passed.

### After the fix

2026-11-25:

- `pnpm migrations:check`: `Prisma schema matches the migrations.`
- `pnpm --filter api typecheck`: pass. `pnpm --filter api lint`: 0 errors, 14 warnings; ESLint on the changed files reports nothing (2026-11-28).
- `pnpm --filter @tamiym/types typecheck` and `lint`: pass.
- `pnpm --filter api test`: 189 suites, 2421 tests passed.
- `pnpm openapi:generate`: only the 400 description changed.
- Prettier on changed `.ts`, `.md`, `.json` files: pass.
- `inventory-pricing-conflicts.sql`: runs; the new query lists a foreign row.

Migration rehearsal on a second throwaway database holding a foreign row: `migrate deploy` failed with `P3018` / `23503`, the old foreign key stayed and no new index was left. After deleting the row, `prisma migrate resolve --rolled-back 20261125163210_ttw272_bulk_tier_variant_owner` then `migrate deploy` succeeded.

2026-11-28:

- API e2e `bulk-pricing|schema-reconciliation|pricing-quote|products.e2e|admin-product-surcharges|view-surcharge-precedence|order-quote-design-check`: 8 suites, 78 tests passed.
- Temporary detached copy of `main` (`2fa96bb`, with TTW-268 and TTW-271) plus this change: code applied cleanly, typecheck pass, e2e `bulk-pricing|schema-reconciliation|pricing-quote` 50/50, unit `bulk-pricing|pricing.service` 67/67. The copy was removed.
- `git merge-tree` against `main`: one text conflict, `docs/tickets/README.md` (keep both rows); `docs/pricing-strategy.md` merges automatically.

After the review fixes (comments, docs, tests only), 2026-11-28:

- `tsc --noEmit` and ESLint on the changed API files: pass.
- `jest bulk-pricing pricing.service`: 67/67.
- The same e2e pattern as above: 8 suites, 81 tests passed. `bulk-pricing-variant-owner` then repeated three times: 15/15 each.
- `pnpm openapi:check` and `pnpm migrations:check`: pass. Prettier: pass.

After the race test fix, 2026-11-28:

- `tsc --noEmit` and ESLint on the changed API files: pass.
- `bulk-pricing-variant-owner`: 15/15, three runs. With the foreign-key mapping temporarily removed: 2 failed (expected 400, received 500); the source was restored and its hash checked.
- Temporary detached copy of `main` (`6d683e7`, with TTW-266, TTW-268 and TTW-271) plus this change: `migrations:check` pass; e2e `bulk-pricing|schema-reconciliation|pricing-quote|products.e2e|product-colour-options|admin-product-surcharges|view-surcharge-precedence|order-quote-design-check|seed-e2e` 12 suites, 119 tests passed; unit `bulk-pricing|pricing.service|products` 12 suites, 293 tests passed. Earlier on the same copy: typecheck and `openapi:check` pass. The copy was removed.

Not run: Playwright (no front-end change; CI runs it on push), the full API e2e suite, `coverage:diff` and `coverage:ratchet`. The full API unit suite and full lint ran on 2026-11-25, before comment and test edits.

## Completion summary

A bulk tier naming another product's variant is refused: 400 `Variant does not belong to this product.` from the admin API, and a composite foreign key in PostgreSQL. An unknown or just-deleted variant gets the same 400 instead of a 500. No front-end change. Pull request: none.

Operations:

- Migration `20261125163210_ttw272_bulk_tier_variant_owner`: run `prisma migrate deploy` on the development and shared test databases after the merge. It fails if a foreign row exists; recovery is in `docs/pricing-strategy.md`.
- Merging with `main`: one text conflict in `docs/tickets/README.md` (keep both rows). Run `pnpm openapi:check` after the merge.
- Remaining: merge (parent session), push and CI, and a row in the local `ROADMAP.md`.

Follow-ups are listed under Out of scope.
