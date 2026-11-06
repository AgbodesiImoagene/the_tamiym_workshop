# TTW-171 — Reject bulk tier prices the database cannot store

**Epic:** 2 — Security and trust boundaries  
**Status:** Not started  
**Risk:** Low  
**Blocked by:** None  
**Blocks:** None

## Background

`bulk_pricing.pricePerUnit` is `Decimal(10,2)`, so its largest value is 99999999.99. `CreateBulkPricingDto` only has `@Min(0)` on that field (`apps/api/src/admin/dto/create-bulk-pricing.dto.ts`), and `mapBulkConstraintError` only translates overlap errors (`apps/api/src/bulk-pricing/bulk-pricing.service.ts:23-34`).

A temporary e2e probe on 2026-11-06, on real Postgres through `POST /v1/admin/bulk-pricing`, gave:

- `pricePerUnit: 100000000`: 500 Internal server error.
- `pricePerUnit: 99999999.99`: 201.

`PATCH` uses the same rule, so it should fail the same way. That was not run. Prices with more than 2 decimals were not tested either.

Found while reviewing TTW-163.

## Proposal

Add an upper limit of 99999999.99 to `pricePerUnit`, with a clear 400 message and `maximum` in Swagger. `UpdateBulkPricingDto` inherits it. The limit comes from the column and is not a commercial rule.

Decide during implementation what to do with more than 2 decimals, after checking what happens today. Rejected: translating the database error, for the reasons in TTW-163.

## Invariants

- A price that passes validation can always be stored.
- A rejected request writes nothing.
- 99999999.99 stays accepted.

## Implementation plan

1. Write the failing e2e test on create and update.
2. Add the limit and the Swagger property.
3. Run `pnpm openapi:generate`.
4. Update `docs/pricing-strategy.md`.

## Test and observability plan

- Unit/component: DTO boundary values.
- Integration/e2e: create and update over HTTP, at the limit and just above, with no stored change after a rejection.
- Failure, retry, and concurrency: not applicable. Validation runs before any write.
- Logs, metrics, traces, and alerts: none needed.

## References

- `apps/api/prisma/schema.prisma` — `pricePerUnit Decimal @db.Decimal(10, 2)`.
- `apps/api/src/admin/dto/create-bulk-pricing.dto.ts` — no upper limit.
- `docs/tickets/ttw-163-bound-bulk-tier-quantities.md` — review 1, point 2.

## Acceptance criteria

- [ ] `POST` and `PATCH` return 400 with a clear message for a price above 99999999.99.
- [ ] A price of 99999999.99 is saved.
- [ ] A rejected request leaves the stored tiers unchanged.
- [ ] Swagger and the generated OpenAPI artefacts show the limit.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- A commercial price limit.
- Price limits on other tables.
- Unknown currency, product or variant → TTW-172.

## Design review

Not required for a low-risk ticket.

## Implementation reviews

Not done yet.

## Verification evidence

Not run yet.

## Completion summary

Not complete.
