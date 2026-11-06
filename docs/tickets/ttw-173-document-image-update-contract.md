# TTW-173 — Document the admin image update contract

**Epic:** 5 — Contracts, observability and release proof\
**Status:** Not started\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

Found during the independent review of TTW-165.

`PATCH /v1/admin/products/{productId}/images/{imageId}` accepts `variantId: null`, which removes the link between an image and a variant. That is what the admin sends for "All variants" (`apps/admin/lib/products.ts:488`), and the API stores it (`apps/api/src/products/products.service.ts:1128`).

The public contract says otherwise. `apps/api/src/products/dto/update-product-image.dto.ts:15-18` declares `variantId?: string` with no `nullable`, so `docs/openapi/openapi.json:4166` and `packages/types/src/openapi.generated.ts:4948` describe a string only. Anyone working from the contract cannot tell how to unlink an image.

The endpoint is also incomplete against the rule that every mounted endpoint has full Swagger annotations. `apps/api/src/admin/admin-products.controller.ts:284-295` has no path parameter, success schema or error responses, and `openapi.json` shows only a `200` with an empty description. Yet the service can answer 400 and 404.

## Proposal

Declare `variantId` as nullable in the DTO, with a description saying that `null` removes the link. Add the path parameters, the success schema and the 400, 401, 403 and 404 responses to the endpoint. Regenerate the contract with `pnpm openapi:generate`.

Runtime behaviour does not change: `@IsOptional()` already lets `null` through.

Rejected: a separate "unlink" endpoint. The current behaviour is correct and already used, and only its description is missing.

## Invariants

- `variantId: null` removes the link, and a missing `variantId` leaves the link unchanged.
- A variant from another product is refused with a 400.
- Requests and responses keep their current shape.
- Generated files are only changed through `pnpm openapi:generate`.

## Implementation plan

1. Add the API test below and confirm it passes on the current behaviour, which fixes that behaviour in place.
2. Update the DTO and the controller annotations.
3. Run `pnpm openapi:generate`, then the checks, and record the evidence.

## Test and observability plan

- Unit/component: none beyond the existing `updateProductImage` tests in `apps/api/src/products/products.service.spec.ts:934`.
- Integration/e2e: an API e2e test through the real validation pipe covering `variantId: null`, a missing `variantId`, and a variant from another product. Today only the Playwright journey of TTW-165 sends `null`.
- Failure, retry, and concurrency: the 400 and 404 paths above. No concurrency concern.
- Logs, metrics, traces, and alerts: no change.

## References

- `apps/api/src/products/dto/update-product-image.dto.ts:15-18`: the DTO field.
- `apps/api/src/admin/admin-products.controller.ts:284-295`: the endpoint.
- `apps/api/src/products/products.service.ts:1087-1132`: validation and storage.
- `apps/admin/lib/products.ts:482-493`: the admin client, whose hand-written type already allows `null`.
- `docs/openapi/openapi.json:4166`: the generated schema.

## Acceptance criteria

- [ ] The OpenAPI schema shows `variantId` as nullable and says what `null` does.
- [ ] The endpoint documents its path parameters, success schema and error responses.
- [ ] An API e2e test covers `null`, a missing value and a foreign variant.
- [ ] `pnpm openapi:check` passes and the generated files come from `pnpm openapi:generate`.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Other endpoints of `admin-products.controller.ts`, including the image role routes.
- Replacing the raw Prisma record this endpoint returns with an explicit response DTO. It would change the response shape, and needs its own ticket if wanted.
- Clearing `altText`: `apps/admin/components/admin-product-merchandising.tsx` sends `undefined` for an empty value, so it cannot be emptied.

## Design review

Not required: low-risk ticket, no runtime change.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not started.
