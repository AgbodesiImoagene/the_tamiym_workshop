# TTW-165 — Stop the admin product page crashing on products with images

**Epic:** 0 — Trustworthy delivery system\
**Status:** In review\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

`apps/admin/components/admin-product-merchandising.tsx:1005` renders `<SelectItem value="">All variants</SelectItem>` inside `ImageRow`, on the "Catalog media" card of the admin product page (`/admin/catalog/products/[id]`).

The Radix `Select` refuses an empty item value: it throws `A <Select.Item /> must have a value prop that is not an empty string`, and the page falls into its error screen. `ImageRow` is only rendered when a product has at least one image, so the page opens for a product without images and crashes for any product that has one. An admin can then no longer manage that product.

TTW-005 found the same defect on `/admin/pricing/bulk-pricing` and fixed it on its own branch. This one was left out of that scope on purpose.

This select is not a display filter. It links an image to one variant, and "All variants" means the image is not tied to a variant (`variantId: null`).

## Proposal

Give "All variants" a dedicated non-empty value, `ALL_VARIANTS`, as `ALL_PRODUCTS` does in the TTW-005 fix. The component state keeps `''` for "no variant", so the save payload (`variantId: variantId || null`) does not change. Only the select translates between the two.

Add an `aria-label` to the select trigger, because it has no visible label and the test must find it by role and name.

Rejected: dropping the "All variants" item. An admin could then link an image to a variant but never undo it.

## Invariants

- A product with images opens on the admin product page without a page error.
- Saving "All variants" stores `variantId: null`, never the `ALL_VARIANTS` value.
- Saving a variant stores that variant's id, and it is shown again after a reload.

## Implementation plan

1. Write the Playwright journey and show it fails on the crash.
2. Add `ALL_VARIANTS` and map it in the select.
3. Run the journey, typecheck, lint, format and the validators, and record the evidence.

## Test and observability plan

- Unit/component: none, `apps/admin` has no unit tests.
- Integration/e2e: `tests/e2e/admin/product-image-variant.comprehensive.spec.ts`. It creates a product with two variants and an imported image through the real admin, then links the image to a variant and back to "All variants", reloading after each save. The `adminPage` fixture fails on any page or console error.
- Failure, retry, and concurrency: not applicable, this is a client-side select with no new write path.
- Logs, metrics, traces, and alerts: no change.

## References

- `apps/admin/components/admin-product-merchandising.tsx:1003-1012`: the select.
- `apps/admin/components/admin-product-merchandising.tsx:964`: `variantId: variantId || null`.
- `apps/api/src/products/products.service.ts:1087`: `updateProductImage` stores `null` as sent.
- `apps/admin/app/admin/pricing/bulk-pricing/page.tsx` on `codex/ttw-005-reconcile-prisma-schema`: `ALL_PRODUCTS`.

## Acceptance criteria

- [x] The admin product page opens for a product with an image.
- [x] An image can be linked to a variant and back to "All variants", and each choice survives a reload.
- [x] The Playwright journey fails before the fix and passes after it.
- [x] Required quality gates pass with evidence recorded below.
- [x] Contracts, migrations, observability, and documentation are updated where applicable (no contract, migration or observability change is expected).

## Out of scope

- The `SelectItem value=""` on `/admin/pricing/bulk-pricing`, fixed by TTW-005 on its own branch.

## Design review

Not required: low-risk ticket.

## Implementation reviews

**Review 1, 2026-11-06, `/code-review low` on the application diff.** No findings. This level reads the diff only and skips test files, and it ran in the implementing session, so it is not a fresh independent reviewer. A fresh reviewer has not looked at this ticket.

## Verification evidence

Environment: macOS, Node v24.22.1, PostgreSQL 17 native, Redis, production builds on ports 3100-3103, disposable database `tamiym_workshop_ttw165_e2e` (dropped afterwards), `REDIS_DB=14`. Other sessions were running tests at the same time, so the default ports and test database were left alone.

| Command                                                                                                                                          | Result                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec playwright test tests/e2e/admin/product-image-variant.comprehensive.spec.ts --project=setup --project=chromium-admin`, before the fix | 1 failed, 3 passed. `Unhandled page error: A <Select.Item /> must have a value prop that is not an empty string`, right after the image import |
| Same command, after the fix, with `product-views.comprehensive.spec.ts`                                                                          | 5 passed                                                                                                                                       |
| Same spec with `--repeat-each=3 --no-deps`                                                                                                       | 3 passed                                                                                                                                       |
| `pnpm exec playwright test --project=setup --project=chromium-admin`                                                                             | 42 passed                                                                                                                                      |
| `pnpm --filter admin typecheck`                                                                                                                  | exit 0                                                                                                                                         |
| `pnpm --filter admin lint`                                                                                                                       | exit 0, 0 errors, 22 warnings                                                                                                                  |
| `pnpm docs:validate`, `pnpm playwright:validate`                                                                                                 | exit 0                                                                                                                                         |
| `pnpm exec prettier --check` on the 5 changed files                                                                                              | All matched files use Prettier code style                                                                                                      |
| `pnpm format:check`                                                                                                                              | exit 1 on 87 files, all generated and gitignored (`apps/api/src/generated/**`, `next-env.d.ts`). None is a file of this ticket                 |

The journey covers both directions: the `PATCH` returns a variant id after choosing a SKU and `null` after choosing "All variants", and the page shows the same choice after each reload.

Not verified:

- CI has not run this branch.
- The journey is tagged `@comprehensive`, so CI only runs it nightly or on manual dispatch, not on each push.
- The image was a queued URL import, so the row was tested without a processed file. MinIO is not available on this machine.

## Completion summary

The admin product page no longer crashes for a product with images. "All variants" now uses the dedicated `ALL_VARIANTS` value, and the saved value for it stays `null`. No deviation from the plan, no migration and no contract change. The branch stops at a local commit, as requested.
