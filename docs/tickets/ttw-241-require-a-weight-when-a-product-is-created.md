# TTW-241 — Require a weight when a product is created

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

Decision by the user, 2026-11-21, while explaining shipping rates (TTW-098) to the client: **every product must have a weight from the moment it is created**, so a weight-based shipping rate can never refuse an order because one product has none.

Today the weight is optional:

- `Product.weightGrams Int?` and `ProductVariant.weightGrams Int?` (`apps/api/prisma/schema.prisma`, around lines 966 and 1062).
- `weightGrams?: number` in `create-product.dto.ts:47`, `update-product.dto.ts:45` and `update-variant.dto.ts:33`.
- The shipment summary uses `variant.weightGrams ?? product.weightGrams ?? null` (`pricing.service.ts:601`) and the total weight is `null` as soon as one line has none (`pricing.service.ts:1034`).
- A weight-based rate then refuses the quote with 400 `SHIPPING_WEIGHT_UNKNOWN` (TTW-098, `docs/pricing-strategy.md`, shipping step).

Confirm each point against current `main` before designing: the code may have moved.

## Proposal

- **The product weight is required** at creation: `weightGrams` is mandatory in `CreateProductDto`, a positive whole number of grams with an upper bound (design review to set it; the admin form shows the unit).
- **It cannot be cleared afterwards:** `UpdateProductDto` accepts a new positive value but never removes it.
- **Variants keep an optional weight** that overrides the product's, as today (`variant ?? product`). With a required product weight, the total is never unknown.
- **Database:** make `products.weight_grams` `NOT NULL` with a `CHECK (weight_grams > 0)`, through `prisma migrate dev` (never hand-written). The project is not in production, so existing rows are fixed in the seeds and in the migration (design review decides the value given to a row with no weight, for example refuse the migration if any product has none outside the dev seeds).
- **Admin product form:** a required "Weight (g)" field on product creation, with a Zod message in English, and visible on the product page.
- **Seeds and tests:** the e2e seed and every factory that creates a product give it a weight.
- Update `docs/pricing-strategy.md` and `docs/runbooks/shipping-zone-coverage.md` (the weight line becomes "always known for products created after this change").
- The `SHIPPING_WEIGHT_UNKNOWN` guard stays as a safety net for variants or legacy data; it must remain reachable only in that case.

Rejected alternatives:

- API validation without a database constraint: another writer (a script, a future import) could create a product with no weight.
- Making the variant weight required too: it is an override, and forcing one per variant multiplies admin entry for nothing.
- Defaulting a missing weight to a guess: shipping fees would be wrong without anyone noticing.

## Invariants

- A product always has a positive weight in grams.
- A shipment's total weight is known whenever every line comes from a product created after this change.
- Orders already placed keep the shipping fee they were created with.

## Implementation plan

1. Start `codex/ttw-241-require-a-weight-when-a-product-is-created` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing (schema change, risk High).
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps: DTOs, service, migration through the Prisma CLI, admin form, seeds. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` and `pnpm --filter @tamiym/types generate:enums` if needed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: creating a product without a weight, with 0, a negative number, a decimal, or a value above the bound is refused; an update cannot clear it; a variant weight overrides the product's.
- Integration/e2e: against real Postgres, the database refuses a product row with no weight or with 0; a weight-based quote for a cart of new products never answers `SHIPPING_WEIGHT_UNKNOWN`.
- Admin: the product form blocks submission without a weight and shows the error; a Playwright journey creates a product with a weight.
- Logs, metrics, traces, and alerts: nothing new. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/prisma/schema.prisma` — `Product.weightGrams`, `ProductVariant.weightGrams`.
- `apps/api/src/products/dto/create-product.dto.ts:47`, `update-product.dto.ts:45`, `update-variant.dto.ts:33`.
- `apps/api/src/products/products.service.ts:730` — product creation.
- `apps/api/src/pricing/pricing.service.ts:601`, `:1034` — weight used for shipping.
- `docs/tickets/ttw-098-make-shipping-rates-weight-or-quantity-based.md` — weight brackets.
- `docs/runbooks/shipping-zone-coverage.md` — admin handover.
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A product cannot be created without a positive weight, from the API and from the admin form.
- [ ] A weight cannot be removed from an existing product.
- [ ] The database refuses a product with no weight or a weight of 0 or less.
- [ ] A weight-based quote for products created after this change never refuses for a missing weight.
- [ ] Seeds, factories, Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Package dimensions (length, width, height): still optional.
- Entering weights for the real catalogue → done by the client's team with the handover guide.
- Weight on the variant form (TTW-174, TTW-166 touch that screen).

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
