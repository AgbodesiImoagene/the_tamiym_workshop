# TTW-166 — Stop variant changes silently deleting linked images

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-174\
**Blocks:** None

## Background

An admin can link a product image to one variant. Any action that removes that variant also removes the image, without warning. Nothing in the admin says so.

TTW-165 made this reachable. Before it merged, the admin product page crashed as soon as a product had an image, so an admin could not set the link from that screen.

The rule is `ProductImage.variant` with `onDelete: Cascade` (`apps/api/prisma/schema.prisma:1184`, and the same in the baseline migration, `migration.sql:1531`). Variants are removed in two places: `removeVariant` (`apps/api/src/products/products.service.ts:869`) and the `deleteMany` in `cleanupStaleVariants` (`:1699`), which runs after every option or value change.

### Measured behaviour

Measured on 2026-11-06 with the real `ProductsService` on a disposable PostgreSQL 17 database with all migrations applied. The probe script and the database were then deleted. No variant had an order.

| Admin action                                     | Variants before → after     | Images | Other losses                              |
| ------------------------------------------------ | --------------------------- | ------ | ----------------------------------------- |
| Delete a variant                                 | `M, S` → `M`                | 1 → 0  | Thumbnail role 1 → 0, variant price 1 → 0 |
| Delete a variant whose image is a workshop layer | `M, S` → `M`                | 1 → 0  | Template layer 1 → 0                      |
| Delete an option value                           | `M, S` → `M`                | 1 → 0  | Variant price 1 → 0                       |
| Delete the last value of an option               | `Blue / S, Red / S` → none  | 2 → 0  | Variant prices 2 → 0                      |
| Delete an option (Size × Colour becomes Size)    | `Blue / S, Red / S` → `S`   | 2 → 1  | Variant prices 2 → 1                      |
| **Add a new option**, before it has any value    | `M, S` → none               | 1 → 0  | Thumbnail role 1 → 0, variant price 1 → 0 |
| Then add the first value of that option          | none → `Red / M`, `Red / S` | 0      | New variants have no image and no price   |
| Control: add a value to an existing option       | `M, S` → `L, M, S`          | 1 → 1  | None                                      |

**Adding a new option has the same effect, and it is the worst case.** It removes every variant of the product that has no order, in one step:

- `createOption` (`:888`) creates the option with no values, then regenerates the variants.
- `indexExistingVariants` (`:1657-1660`) marks every existing variant as stale, because none has an entry for the new option.
- `cartesianProduct` (`:130`) returns no combination while one option is empty, and the guard at `:1789` only rejects too many combinations, not zero.

Adding the first value does not bring anything back. It creates new rows with new ids. The "Add option" button (`apps/admin/components/admin-product-merchandising.tsx:604`) has no confirmation at all.

Deleting an option also loses images unpredictably: when variants collide, the first one read is kept (`:1664-1666`), and the query that reads them has no `orderBy`, so the surviving image is not chosen by anyone.

### Why the image loss goes further than the photo

- The cascade continues to the image's roles (`schema.prisma:1213`) and workshop template layers (`:1339`), and from the layers to their option effects (`:1378`). So the product can lose its thumbnail, or part of its workshop template, for every variant. Roles and layers were measured, effects were not.
- The cascade skips the cleanup in `deleteProductImage` (`products.service.ts:1142`), so the `MediaAsset` row stays behind, unreferenced. The measurement confirms it. The file is therefore not gone from storage, but no screen can reach it.
- The dialogs do not mention images. They say "Variants will regenerate after deletion." (`admin-product-merchandising.tsx:361`), "This will delete the entire option and all its values." (`:519`) and "Only safe when the variant has no order lines or dependent records." (`:1324`).

### What already protects data

Read in the code, not measured:

- A variant with orders is never deleted. `removeVariant` refuses it (`products.service.ts:877`, tested at `products.service.spec.ts:551`), and regeneration only sets `isAvailable: false` (`products.service.ts:1706`), so its image stays linked.
- The existing unit tests mock Prisma and none asserts anything about images, so they cannot see this cascade.

### Who reads the link today

Only the admin screen reads `ProductImage.variantId` (`admin-product-merchandising.tsx:956`). Customers see images through `productImageRoles` (`apps/app/app/dashboard/products/page.tsx:159`). That changes with TTW-092, which plans a gallery per colour.

## Proposal

### Decision

**When a variant disappears, its linked images stay on the product and move to "All variants".** The user chose this on 2026-11-06.

Each image keeps its roles and template layers, with `variantId: null`. It adds to any image already on "All variants" and replaces none. The admin can then relink it or delete it.

The change is `onDelete: SetNull` on `ProductImage.variant`, so the database applies the rule on every path, including `deleteMany` and any future caller.

Accepted drawback: a photo of a withdrawn variant stays on the product. If it has a role, customers still see it until an admin removes it. Once TTW-092 ships a gallery per colour, it may appear under every colour, depending on how that gallery treats "All variants".

### Rejected

- Keeping the deletion behind a warning. A mistaken click would lose the image, its roles and its layers, and it would need an impact preview and a confirmation enforced by the API (8–12 h against 3–5 h).
- Refusing the action while images are linked. Regeneration runs inside other edits, so an admin could no longer remove a value without first unlinking each image.

## Invariants

- A variant with order lines is never deleted, and its images stay linked to it.
- Deleting a product still deletes its images (`schema.prisma:1181`, unchanged).
- A non-null `ProductImage.variantId` always points to a variant of the same product.
- A variant change never deletes a `ProductImage`, `ProductImageRole` or `WorkshopTemplateLayer`.

## Implementation plan

1. Start after TTW-174 is merged, as both touch the admin product dialogs. Refresh the measured table then: its "Add a new option" rows should no longer lose anything.
2. Write the failing integration spec for every row of the measured table that still loses an image.
3. Change `schema.prisma:1184` to `onDelete: SetNull` and generate the migration with `prisma migrate dev`. It only replaces the foreign key and changes no data.
4. Update the three dialog texts to say linked images move to "All variants".
5. Extend the TTW-165 Playwright journey.

Update this plan and record deviations when implementation differs.

## Test and observability plan

- Unit/component: `apps/admin` has no unit tests.
- Integration/e2e: a new API spec on real PostgreSQL, because a mocked Prisma cannot show a foreign key rule. It covers each row of the measured table, plus a variant with orders. Playwright: extend `tests/e2e/admin/product-image-variant.comprehensive.spec.ts` from TTW-165 to delete a variant with a linked image and reload.
- Failure, retry, and concurrency: no new write path. The database applies the rule inside the existing delete.
- Logs, metrics, traces, and alerts: at design review, check whether option and variant changes reach the audit log. No new metric is expected.

## References

- `apps/api/prisma/schema.prisma:1184`: the cascade.
- `apps/api/prisma/schema.prisma:1213`, `:1339`, `:1378`: what follows the image.
- `apps/api/prisma/migrations/20260819100000_baseline/migration.sql:1531`: the same rule in the database.
- `apps/api/src/products/products.service.ts:869`: `removeVariant`.
- `apps/api/src/products/products.service.ts:888`: `createOption`.
- `apps/api/src/products/products.service.ts:942`, `:1013`: `deleteOption`, `deleteOptionValue`.
- `apps/api/src/products/products.service.ts:1638`: `indexExistingVariants`.
- `apps/api/src/products/products.service.ts:1679`: `cleanupStaleVariants`.
- `apps/admin/components/admin-product-merchandising.tsx:361`, `:519`, `:604`, `:1324`: the admin actions.
- `docs/tickets/ttw-092-build-product-detail-page.md`: gallery per colour.

## Acceptance criteria

- [x] The user's decision is recorded in this ticket before any code changes.
- [ ] Every row of the measured table has an integration test on real PostgreSQL.
- [ ] After each action, the images, roles and template layers still exist, and each image has `variantId: null`.
- [ ] A variant with orders keeps its image link, and deleting a product still deletes its images.
- [ ] The admin dialog texts describe what really happens to linked images.
- [ ] The admin journey is played end to end after a reload.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Contracts, migrations, observability, and documentation are updated where applicable.

## Out of scope

- Keeping variants, prices and SKUs when an option is added → TTW-174.
- `MediaAsset` rows left unreferenced by past cascades. The cleanup job named in the comment at `products.service.ts:1139` does not exist in `apps/api/src`, and nothing there deletes the stored files.
- How a gallery picks images per colour → TTW-092.
- Showing refused saves on the admin product page → TTW-168.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation. The measurements in Background come from a throwaway script against the real service, not from a committed test. They did not cover the admin screens in a browser, variants with orders, or option effects.

## Completion summary

Pending implementation.
