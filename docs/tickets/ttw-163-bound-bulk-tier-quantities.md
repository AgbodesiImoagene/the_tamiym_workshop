# TTW-163 — Reject bulk tier quantities the database cannot store

**Epic:** 2 — Security and trust boundaries  
**Status:** In review  
**Risk:** Low  
**Blocked by:** None  
**Blocks:** None

## Background

TTW-005 defined `bulk_pricing.quantityRange` as `int4range("minQuantity", "maxQuantity", '[]')`. Postgres stores that range with an exclusive upper bound, so it adds 1 to `maxQuantity`. A `maxQuantity` of 2147483647, the largest `integer`, therefore overflows with `integer out of range`.

The admin API does not stop this value. `CreateBulkPricingDto` only has `@Min(1)` on `minQuantity` and `maxQuantity` (`apps/api/src/admin/dto/create-bulk-pricing.dto.ts:21-35`), `UpdateBulkPricingDto` inherits the same rules, and `mapBulkConstraintError` only translates overlap errors (`apps/api/src/bulk-pricing/bulk-pricing.service.ts:23-34`). The database error therefore reaches the admin as a 500 instead of a validation message, which the failing run below confirmed on create and update.

The independent review of TTW-005 reported this as finding 5 and left it out of scope.

## Proposal

Reject `minQuantity` and `maxQuantity` above 2147483646 with a 400 at the API boundary, on both create and update. That is the largest value `quantityRange` can hold. The limit lives in one exported constant, is shown in Swagger as `maximum`, and has an error message that tells the admin what to do.

Deliberate decisions:

- The limit is technical, not commercial. A lower "realistic order size" would be a business rule nobody has asked for.
- `minQuantity` gets the same limit. Without it, a value above the `integer` range still reaches Prisma, and a minimum of 2147483647 could never have a maximum.

Rejected alternatives:

- Translating the database error in `mapBulkConstraintError`: the request would still reach the database, and matching on an error's text is more fragile than validating input.
- Storing the range as `[min, max + 1)`: it changes a column TTW-005 just reconciled and still overflows.

## Invariants

- A tier that passes validation can always be stored: `quantityRange` never overflows.
- A rejected request writes nothing.
- A tier with an empty `maxQuantity` stays open-ended.
- 2147483646 stays accepted. The only value that used to save and no longer does is a `minQuantity` of exactly 2147483647 with no maximum.

## Implementation plan

1. Write the failing e2e test against real Postgres through the HTTP API.
2. Add the constant and `@Max` rules to `CreateBulkPricingDto`, which `UpdateBulkPricingDto` inherits.
3. Add `maximum` to the Swagger properties and describe the 400 on the controller.
4. Run `pnpm openapi:generate`.
5. Update `docs/pricing-strategy.md`.

## Test and observability plan

- Unit/component: DTO boundary values, on create and update.
- Integration/e2e: `apps/api/test/bulk-pricing-quantity-limits.e2e-spec.ts` covers create and update over HTTP with an admin session, including the boundary value and the absence of any stored row after a rejection.
- Failure, retry, and concurrency: not applicable. Validation runs before any write.
- Logs, metrics, traces, and alerts: none needed. The change turns a server error into a validation error.
- Browser: the admin bulk pricing journey shows the message.

## References

- `apps/api/src/admin/dto/create-bulk-pricing.dto.ts:21-35` — no upper limit.
- `apps/api/src/admin/dto/update-bulk-pricing.dto.ts:4` — inherits the create rules.
- `apps/api/src/bulk-pricing/bulk-pricing.service.ts:23-34` — only overlap errors are translated.
- `apps/api/prisma/migrations/20261106103430_ttw005_reconcile_schema/migration.sql:16-17` — the range definition.
- `docs/tickets/ttw-005-reconcile-prisma-schema-with-migrations.md` — review 1, finding 5.

## Acceptance criteria

- [x] `POST /v1/admin/bulk-pricing` and `PATCH /v1/admin/bulk-pricing/:id` return 400 with a clear message for a `maxQuantity` of 2147483647 or more.
- [x] The same requests return 400 for a `minQuantity` above the limit.
- [x] A `maxQuantity` of 2147483646 is saved.
- [x] A rejected request leaves the stored tiers unchanged.
- [x] Swagger and the generated OpenAPI artefacts show the limit.
- [x] The admin page shows the message.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- A commercial limit on tier quantities.
- Any change to `quantityRange` or its constraint.

## Design review

Not required for a low-risk ticket.

## Implementation reviews

**Review 1, 2026-11-06, `/code-review` at high effort.** This ran inside the implementing session, so it is **not** the independent review `AGENTS.md` requires. Overall verdict: no blocking defect in the change.

1. **Fixed.** This ticket's invariant wrongly said the limit only removes values that could never be saved. A `minQuantity` of 2147483647 with no maximum used to save. It no longer does.
2. **Not fixed, out of scope.** `pricePerUnit` has no upper limit although the column is `Decimal(10,2)`, so a very large price probably still returns a 500. Not run. Follow-up.
3. **Not fixed, out of scope.** `currency` is only checked as a string and `productId` is not checked, so an unknown value probably still returns a 500. Not run. Follow-up.
4. **Not fixed, existing.** `apps/admin/lib/api.ts:137` stores the validation `message` array in a string field, so two errors at once render with no separator.
5. **Accepted.** The limit is in the DTO, not in `BulkPricingService`. The admin controller is the only caller, and direct writes are still refused by Postgres.
6. **Accepted.** The new browser test uses the plain Playwright page, because the strict `adminPage` guard fails on any 400 in the console. It therefore does not detect an unhandled page error. Changing the shared guard is a separate decision.

**Review 2, 2026-11-06, independent reviewer (fresh session, read-only).** Overall verdict: **PASS**. Correctness, tests, contracts, docs and ticket: PASS. No blocking finding and nothing to change.

- It reran `pnpm --filter api test:e2e -- test/bulk-pricing-quantity-limits.e2e-spec.ts` (exit 0, 12 of 12) and `pnpm openapi:check` (no drift).
- It confirmed that only `BulkPricingService.create` and `update` write to `bulk_pricing`, through the admin controller.
- It did not rerun the full e2e suite, Playwright, the build or coverage, and did not reproduce the failure without the fix. For those it relied on the evidence below.
- Two minor notes, no change: `expectQuantityRejected` matches the response text rather than the `message` array, and the limit lives in the DTO rather than the service (see review 1, point 5).

## Verification evidence

Environment: macOS, Node v24.22.1, PostgreSQL 17.5 native, Redis, disposable databases `tamiym_workshop_ttw163_*`, branch built on TTW-005 commit `3419fe6`.

**Before the fix** (`apps/api/test/bulk-pricing-quantity-limits.e2e-spec.ts`): 8 failed, 4 passed. A `maxQuantity` of 2147483647 or 2147483648 and a `minQuantity` of 2147483648 gave `Expected: 400, Received: 500` on create, with `DriverAdapterError: ValueOutOfRange` in the logs. The same `maxQuantity` values gave 500 on update. A `minQuantity` of 2147483647 gave 201 on create. On update, both `minQuantity` cases gave a 400 with the unrelated message "maxQuantity must be >= minQuantity when set." The 4 passing tests cover values that must keep working.

**After the fix:**

| Command                                                                                                                 | Result                                                                               |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm --filter api test:e2e`                                                                                            | exit 0, 19 suites, 117 tests                                                         |
| `pnpm --filter api test -- src/admin/dto/create-bulk-pricing.dto.spec.ts`                                               | exit 0, 6 passed                                                                     |
| `pnpm exec playwright test tests/e2e/admin/bulk-pricing.comprehensive.spec.ts --project=setup --project=chromium-admin` | exit 0, 5 passed, including "explains why a quantity is too large and saves nothing" |
| `pnpm lint`, `pnpm typecheck`                                                                                           | exit 0                                                                               |
| `pnpm test`                                                                                                             | exit 0; API 144 suites, 1213 tests; web 40 tests; app 42 tests                       |
| `pnpm build`                                                                                                            | exit 0                                                                               |
| `pnpm --filter api test:coverage`, `pnpm coverage:ratchet`                                                              | exit 0; lines 82.15%, floor 56%                                                      |
| `pnpm audit:prod`, `enums:check`, `openapi:check`, `migrations:check`                                                   | exit 0                                                                               |
| `pnpm docs:validate`, `playwright:validate`                                                                             | exit 0                                                                               |
| `prettier --check` on the changed files                                                                                 | exit 0                                                                               |

`pnpm coverage:diff` also exits 0 on the commit, but it says "no added executable lines" and skips the check, so it proves nothing here. The new lines are covered by the DTO spec and the e2e suite.

**Deviations from the plan**

- The branch starts from `codex/ttw-005-reconcile-prisma-schema`, not `main`, on request, because TTW-005 changed `quantityRange` and is not merged yet. It must merge after TTW-005.
- `minQuantity` also gets the limit, which rejects one value that used to save. See the invariants.
- Prettier realigned the Epic 2 table in `docs/tickets/README.md`, because `In progress` is wider than the old column.
- `docs/tickets/ROADMAP.md` is unchanged. It tracks the client order, and this is a small follow-up to TTW-005.

- Merged into `main` locally before CI ran, at the user's request and without a PR. `ci.yml` only runs on pushes to `main` or `develop` and on PRs, so pushing this branch alone would start no run. This departs from the `AGENTS.md` rule of green CI before merge.

**Not verified**

- CI has not run this branch. CI uses Postgres 16 and this was run on 17.
- The new browser test is tagged `@comprehensive`, so CI only runs it nightly or on manual dispatch.
- `pnpm format:check` and `pnpm verify` were not run as one command. They stop on the generated-file debt that TTW-164 addresses.
- `pnpm test`, `pnpm build` and Playwright ran before a one-line lint fix in the new DTO spec. That spec, `pnpm lint` and the full e2e suite were rerun after it.

## Completion summary

Bulk tier quantities above 2147483646 now get a 400 with a clear message on create and update, instead of a 500. The admin page shows that message, and Swagger and the OpenAPI artefacts show the limit. No migration. The independent implementation review passed. Left to do: the user pushes `main`, CI is confirmed green there, then this ticket is marked Complete and the branch is deleted. Follow-ups: TTW-171 for `pricePerUnit`, TTW-172 for `currency`, `productId` and `variantId`. Not ticketed: the admin display of several errors at once.
