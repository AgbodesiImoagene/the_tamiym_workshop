# TTW-172 — Reject unknown currencies, products and variants on bulk tiers

**Epic:** 2 — Security and trust boundaries  
**Status:** Not started  
**Risk:** Low  
**Blocked by:** None  
**Blocks:** None

## Background

`CreateBulkPricingDto` only checks that `currency`, `productId` and `variantId` are strings (`apps/api/src/admin/dto/create-bulk-pricing.dto.ts`). The service casts `currency` to `'NGN'` without checking it (`apps/api/src/bulk-pricing/bulk-pricing.service.ts`), and `mapBulkConstraintError` only translates overlap errors.

A temporary e2e probe on 2026-11-06, on real Postgres through `POST /v1/admin/bulk-pricing`, gave a 500 Internal server error for each of these:

- `currency: 'USD'`
- `productId` that does not exist
- `variantId` that does not exist

Not tested: a real variant that belongs to a different product. The admin page only offers valid choices, so these requests come from direct API calls or a stale page.

Found while reviewing TTW-163.

## Proposal

- `currency`: validate it against `CurrencyCode` in the DTO, with `enum` in Swagger.
- `productId` and `variantId`: answer with a clear 4xx. Check them in the service, because a DTO cannot look at the database, and map the foreign key error too, so that a product deleted between the check and the write cannot bring back a 500.
- Check that a variant belongs to the product, and reject it if not.

The exact status for an unknown product (400 or 404) is decided in implementation, following the admin endpoints around it.

## Invariants

- A rejected request writes nothing.
- A tier never points at a variant of a different product.
- Valid tiers save as they do today.

## Implementation plan

1. Write the failing e2e tests, including the variant of a different product.
2. Add the currency rule to the DTO.
3. Add the checks and the error mapping to `BulkPricingService.create`.
4. Run `pnpm openapi:generate` and update the 400 and 404 responses in Swagger.
5. Update `docs/pricing-strategy.md`.

## Test and observability plan

- Unit/component: the DTO currency rule and the service error mapping.
- Integration/e2e: each invalid value over HTTP on real Postgres, with nothing stored.
- Failure, retry, and concurrency: a product deleted between the check and the write gives a 4xx.
- Logs, metrics, traces, and alerts: none needed.

## References

- `apps/api/src/admin/dto/create-bulk-pricing.dto.ts` — string-only checks.
- `apps/api/src/bulk-pricing/bulk-pricing.service.ts:23-34` — only overlap errors are translated.
- `docs/tickets/ttw-163-bound-bulk-tier-quantities.md` — review 1, point 3.

## Acceptance criteria

- [ ] An unknown `currency` returns 400 with a clear message.
- [ ] An unknown `productId` or `variantId` returns a clear 4xx, not a 500.
- [ ] A variant of a different product is rejected.
- [ ] A rejected request stores nothing.
- [ ] Swagger and the generated OpenAPI artefacts match.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Adding new currencies.
- Price limits → TTW-171.

## Design review

Not required for a low-risk ticket.

## Implementation reviews

Not done yet.

## Verification evidence

Not run yet.

## Completion summary

Not complete.
