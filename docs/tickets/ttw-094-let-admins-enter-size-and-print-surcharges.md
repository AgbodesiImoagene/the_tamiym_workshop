# TTW-094 — Let admins enter size and print-side surcharges

**Epic:** 8 — Client review delivery\
**Status:** In review\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-095

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 2.7, Size surcharges and per-side print surcharges cannot be entered** (High, P1, 8–14 h, status "To do"): Pricing applies them, but no route or screen lets admins set them (e.g. XXL +₦500, back print +₦1,000).

## Proposal

- Add admin routes and catalogue screens to write `OptionValueUpcharge` and `ProductViewPricing`.
- Audit the changes like other admin catalogue writes.

## Invariants

- Pricing already reads these values. It must return the same result for existing data.
- Surcharges never apply retroactively to frozen orders.

## Implementation plan

1. Start `codex/ttw-094-let-admins-enter-size-and-print-surcharg` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit and integration: create, update, delete, validation and authorization.
- Playwright: an admin sets XXL +₦500, and the customer quote shows it.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- OptionValueUpcharge / ProductViewPricing never written — row 2.7
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An admin can set a size surcharge and a back-print surcharge, and quotes reflect them.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Recorded 2026-11-14, before implementation. Risk is High (money-affecting writes, admin privileges, schema change), so the review covers security and integration.

### Finding confirmed on current `main`

- `apps/api/src/admin/admin-products.controller.ts` has routes for options, option values, views, images, prices and variants. None writes `OptionValueUpcharge` or `ProductViewPricing`. `apps/admin` never mentions an upcharge.
- Pricing reads both: `sumOptionValueUpcharges` (sum of one upcharge per option value, for the requested currency) and `computeViewSurchargeForDesign` in `apps/api/src/pricing/pricing.service.ts`.

### Facts that change the proposal

1. **"Audit like other admin catalogue writes" has no precedent.** `ProductsService` and the other catalogue controllers (shipping, discounts, bulk pricing) do not call `AuditService`. The new routes will call it (`AuditService.log`, as `admin-site-settings.controller.ts` does) because they change prices. Existing catalogue writes stay unaudited: out of scope, to be reported.
2. **The unique index on `product_view_pricing` does not protect product-level rows.** It is a plain index on `(productId, variantId, productViewId, currency)`, and Postgres treats NULLs as distinct, so two rows with `variantId = NULL` can coexist (a race, or a double click). Prisma cannot `upsert` on a null `variantId` either. Fix: one migration adding a partial unique index on `(productId, productViewId, currency) WHERE "variantId" IS NULL`, generated with `prisma migrate dev --create-only` (Prisma cannot express partial indexes, so the SQL is completed by hand inside that generated migration). The write path is an insert with `ON CONFLICT` against that index, not a read-then-write.
3. **Variant-level view surcharges are ambiguous today.** The pricing read uses `OR [variantId null, variantId]` with `take: 1` and no `orderBy`, so when both exist the winner is undefined. Changing that would change prices. Decision: this ticket writes **product-level** view surcharges only (`variantId = NULL`). Existing variant-level rows keep being read as before. Variant overrides need their own ticket once the client defines the rule.
4. **The first design view is free.** `computeViewSurchargeForDesign` skips the first `DesignView` (ordered by id) and charges the others. So "back +₦1,000" is charged when a design uses the back view as a second view. This is existing behaviour and is not changed. The admin screen must say so in plain English.

### Design

- Routes (admin only, `JwtAuthGuard` + `RolesGuard`, `@Roles(ADMIN)`, global CSRF), under `admin/products/:productId`:
  - `PUT options/:optionId/values/:valueId/upcharges/:currency` body `{ amount }`: create or replace, idempotent.
  - `DELETE options/:optionId/values/:valueId/upcharges/:currency`: 204, also when absent.
  - `PUT views/:viewId/surcharges/:currency` body `{ amount }` and the matching `DELETE`.
  - Reads: the option and view responses already served to the admin screen gain the current surcharges, as explicit response DTOs (no raw Prisma rows).
- Ownership: the value must belong to the option, the option to the product, the view to the product. Otherwise 404, never a cross-product write.
- Validation: amount is a decimal string or number, `>= 0`, at most 2 decimals, at most `Decimal(10,2)`; currency from the `CurrencyCode` enum. Money is handled as `Decimal`, never a float.
- Writes are one DB statement each. No transaction is held across a network call (there is none).
- Not retroactive: orders store their own price snapshot. A test creates an order, changes the surcharge, and checks the order totals are unchanged.
- Observability: audit log entry per write (`before`/`after` amounts, actor, request id). No new metrics. No secrets or PII in logs.

### Threats considered

- Privilege escalation: customer or organiser token on the new routes must get 403 (tested).
- IDOR across products: covered by the ownership checks (tested).
- Concurrent duplicate writes: covered by the unique indexes, tested against real Postgres (sequential and concurrent).
- Negative or absurd amounts: rejected by validation.

## Implementation reviews

Independent security and integration review, 2026-11-15, by a fresh reviewer with read-only access: **PASS**, no blocking or important finding. Five minor findings:

1. **Fixed.** `amount: 1e-7` made class-validator throw inside `IsNumber({ maxDecimalPlaces })`, so the API answered 500 instead of 400. Reproduced first with a failing test (`set-surcharge.dto.spec.ts`), then replaced by a validator that accepts only a number equal to its own 2-decimal form (it also refuses float drift such as 0.1 + 0.2).
2. **Follow-up: TTW-220.** A product-level row and a variant-level row for the same view make the read in `computeViewSurchargeForDesign` ambiguous. Not a regression (documented as undefined) and no screen writes variant rows, but the new route can create the state next to an existing variant row. The rule needs a decision, so it has its own ticket.
3. **Accepted compromise.** The audit entry is written after the price change, outside its transaction, and `AuditService.log` swallows its own errors. That is the repository-wide audit policy; two concurrent writes can also record the same `before` value. Not changed here.
4. **Fixed.** Save and Remove buttons now have an accessible name that names the value (`Save surcharge for size large`).
5. **Fixed.** Added a test that an admin cookie session without a CSRF token gets 403 on the new PUT and DELETE routes and writes nothing, and the concurrency tests now also check that the surviving amount is one of the amounts sent and that every write left an audit entry.

## Verification evidence

Run on 2026-11-15 in the worktree, on a dedicated database (`tamiym_workshop_test_ttw094`), Redis db 14.

- Tests written first and shown failing: unit specs failed with "Cannot find module", the API e2e failed 18 of 21 (routes missing).
- `pnpm --filter api test`: 153 suites, 1501 tests pass (includes `product-surcharges.service.spec.ts` and `set-surcharge.dto.spec.ts`).
- `pnpm --filter api test:e2e -- test/admin-product-surcharges.e2e-spec.ts`: 21 of 21 pass on real Postgres (set, replace, delete twice, 10 concurrent writes, cross-product 404, invalid amounts 400, 401, 403, audit entries, unchanged quote, frozen order).
- Mutation check: with the partial index dropped, the concurrent-write test and the database-uniqueness test fail. The index was restored afterwards.
- `pnpm exec playwright test tests/e2e/admin/product-surcharges.comprehensive.spec.ts --project=setup --project=chromium-admin`: 6 of 6 pass (admin sets Large +₦500, reload keeps it, the customer quote rises by 500, Remove restores the quote; Front print surcharge; invalid amounts).
- `pnpm --filter api typecheck`, `pnpm --filter admin typecheck`: pass. `pnpm --filter api lint`, `pnpm --filter admin lint`: 0 errors, warnings only in files not touched here.
- `pnpm format:check`, `pnpm docs:validate`, `pnpm openapi:check`, `pnpm playwright:validate`, `pnpm migrations:check`: pass.
- `pnpm build`: pass.

After the review fixes (2026-11-15):

- `set-surcharge.dto.spec.ts`: the `1e-7` case failed first with `TypeError: Cannot read properties of undefined (reading 'length')`, then 13 of 13 pass.
- API e2e `admin-product-surcharges.e2e-spec.ts`: 22 of 22 pass (new CSRF test, stronger concurrency assertions).
- Playwright `product-surcharges.comprehensive.spec.ts`: 6 of 6 pass, run against an API on port 3101 because another session's API held port 3001. The spec now runs serially: its tests share one amount field and failed when run in parallel.
- admin and api typecheck, lint (0 errors), `pnpm format:check`, `pnpm docs:validate`, `pnpm openapi:check`, `pnpm playwright:validate`, api and admin build: pass.

Not run: `pnpm coverage:ratchet` and `pnpm coverage:diff` (need a coverage run and `origin/main`), CI on GitHub (nothing pushed).

## Deviations from the plan

- Read route is `GET admin/products/:productId/surcharges` with its own response DTO, instead of adding fields to the existing option and view responses.
- Product-level view surcharges only (see Design review, fact 3). Variant-level overrides are not editable.
- Existing catalogue writes are not audited, so audit is added for the new routes only.
- The amount rule is a custom validator (number equal to its 2-decimal form) instead of `IsNumber({ maxDecimalPlaces: 2 })`, which throws on exponent notation.
- The migration has no de-duplication: it fails loudly if duplicate product-level rows exist.

## Completion summary

Implemented, locally verified and independently reviewed (PASS, minor findings handled above). `pnpm coverage:ratchet` and `pnpm coverage:diff` are still to run, and nothing has been pushed, so CI has not run. Follow-up: TTW-220.
