# TTW-166 — Stop variant changes silently deleting linked images

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-005; TTW-165; user decision on the image outcome (see Proposal)\
**Blocks:** None

## Background

An admin can link a product image to one variant. Any action that removes that variant also removes the image, without warning. Nothing in the admin says so.

TTW-165 makes this reachable. Until it merges, the admin product page crashes as soon as a product has an image, so an admin cannot set the link from that screen.

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

### Decision required

**When a variant disappears, what happens to the images linked to it?** This is a product decision, so no option below may be applied until the user has chosen one and the choice is recorded here. The question is also listed under "Décisions à obtenir du client" in `ROADMAP.md`.

|                                    | Option A: move the image to "All variants"                                                                          | Option B: keep the deletion and warn the admin                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| What the admin sees                | The image stays on the product, with `variantId: null`. The admin can relink or delete it afterwards                | A warning lists what will be deleted. On confirmation the image goes, as it does today                                            |
| Thumbnail and workshop layers      | Kept                                                                                                                | Deleted with the image once confirmed                                                                                             |
| Paths covered                      | All, enforced by the database, including `deleteMany` and any future caller                                         | Only the paths given a warning: three existing dialogs, plus new ones on "Add option" and on the first value of a new option      |
| Change                             | `onDelete: SetNull` and one migration, three dialog texts                                                           | No schema change. A read-only impact preview that reuses the regeneration rules, a confirmation the API enforces, and dialog work |
| Main drawback                      | A photo of a withdrawn variant stays on the product and keeps its role, so customers may still see it until cleanup | A mistaken click loses the link, role and layers. Recovery means importing the image and rebuilding them by hand                  |
| After TTW-092 (gallery per colour) | Such a photo appears under every colour until an admin reassigns it                                                 | No effect                                                                                                                         |
| Rough size                         | 3–5 h                                                                                                               | 8–12 h                                                                                                                            |

### Recommendation

**Option A.** A leftover photo is visible and takes one click to fix. A deleted image, role or template layer has to be rebuilt by hand, and because adding an option affects every variant at once, Option B would mean asking an admin to approve the loss of all variant images for an ordinary catalogue edit. Option A also holds for every code path, without relying on each screen to warn.

If the extra photo matters more than the rework, Option B is sound, but its warning must cover "Add option".

### Rejected

Refusing the action while images are linked. Regeneration runs inside other edits, so an admin could no longer add an option or remove a value without first unlinking each image.

## Invariants

- A variant with order lines is never deleted, and its images stay linked to it.
- Deleting a product still deletes its images (`schema.prisma:1181`, unchanged).
- A non-null `ProductImage.variantId` always points to a variant of the same product.
- Option A: a variant change never deletes a `ProductImage`, `ProductImageRole` or `WorkshopTemplateLayer`.
- Option B: no image is deleted by a variant change unless the request confirms an impact the admin was shown, and an unconfirmed API call deletes nothing.

## Implementation plan

1. Record the user's decision in this ticket. Start only after TTW-005 and TTW-165 are merged.
2. Write the failing integration spec for every row of the measured table.

**If Option A:**

3. Change `schema.prisma:1184` to `onDelete: SetNull` and generate the migration with `prisma migrate dev`. It only replaces the foreign key and changes no data.
4. Update the three dialog texts to say linked images move to "All variants".
5. Extend the TTW-165 Playwright journey.

**If Option B:**

3. Extract the read phase of `regenerateVariants` so the preview and the write share one set of rules.
4. Add the read-only impact endpoint, listing images, roles and template layers, with Swagger and shared contracts.
5. Require a confirmation on the affected write routes, and reject the call when the impact changed since the preview.
6. Show the impact in the three dialogs, and add a confirmation to "Add option" and to the first value of a new option.
7. Extend the TTW-165 Playwright journey.

Update this plan and record deviations when implementation differs.

## Test and observability plan

- Unit/component: `apps/admin` has no unit tests. Option B adds service tests for the shared impact computation.
- Integration/e2e: a new API spec on real PostgreSQL, because a mocked Prisma cannot show a foreign key rule. It covers each row of the measured table, plus a variant with orders. Playwright: extend `tests/e2e/admin/product-image-variant.comprehensive.spec.ts` from TTW-165 to delete a variant with a linked image and reload.
- Failure, retry, and concurrency: option A has no new write path. Option B must test a stale confirmation and two admins editing the same product.
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

- [ ] The user's decision is recorded in this ticket before any code changes.
- [ ] Every row of the measured table has an integration test on real PostgreSQL.
- [ ] Option A: after each action, the images, roles and template layers still exist, and the image has `variantId: null`. Or option B: each action shows the affected images, roles and layers before anything is deleted, and an unconfirmed API call deletes nothing.
- [ ] A variant with orders keeps its image link, and deleting a product still deletes its images.
- [ ] The admin dialog texts describe what really happens to linked images.
- [ ] The admin journey is played end to end after a reload.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Contracts, migrations, observability, and documentation are updated where applicable.

## Out of scope

- Adding an option still deletes variants, with their prices and SKUs, under both options. Only their images are in this ticket. It needs its own ticket: an existing variant should be kept when an option is added.
- `MediaAsset` rows left unreferenced by past cascades. The cleanup job named in the comment at `products.service.ts:1139` does not exist in `apps/api/src`, and nothing there deletes the stored files.
- How a gallery picks images per colour → TTW-092.
- Showing refused saves on the admin product page → TTW-168.

## Design review

Pending. Requires the decision above.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation. The measurements in Background come from a throwaway script against the real service, not from a committed test. They did not cover the admin screens in a browser, variants with orders, or option effects.

## Completion summary

Pending implementation.
