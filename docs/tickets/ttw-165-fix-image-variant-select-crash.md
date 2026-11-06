# TTW-165 — Stop the admin product page crashing on products with images

**Epic:** 0 — Trustworthy delivery system\
**Status:** Complete\
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

- `apps/admin/components/admin-product-merchandising.tsx:1003-1018`: the select.
- `apps/admin/components/admin-product-merchandising.tsx:967`: `variantId: variantId || null`.
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

**Review 1, 2026-11-06, `/code-review low` on the application diff.** No findings. This level reads the diff only and skips test files, and it ran in the implementing session, so it does not count as independent.

**Review 2, 2026-11-06, independent reviewer (fresh session, read-only) covering code, test, ticket and similar defects.** Verdict: PASS, no blocking finding. It reran `pnpm --filter admin typecheck` (exit 0) and `pnpm --filter admin lint` (exit 0, 0 errors, 22 warnings). It did not rerun Playwright, so the journey results below remain those of the implementing session.

Non-blocking findings, none changed in this ticket:

1. **Medium, out of scope.** Deleting a variant, or the option value behind it, deletes the images linked to it without warning (`onDelete: Cascade`, `schema.prisma:1184`; `cleanupStaleVariants`, `products.service.ts:1698`). The rule already existed, but this screen could not reach it while the page crashed. Keeping the image on "All variants" or deleting it is a product decision.
2. **Low, out of scope.** `listBanks` copies Paystack data unfiltered (`paystack-transfer.provider.ts:40`), so an empty `bank.code` would crash the same way at `apps/app/app/dashboard/fundraiser/page.tsx:484`. No real Paystack response was observed, so this is possible, not proven.
3. **Low, already there.** The `save` mutation of `ImageRow` has no `onError`, so a refused save shows nothing to the admin.
4. **Low.** `expect.any(String)` in the journey accepts any string. The API validates the id, and the SKU is checked again after the reload.
5. **Very low.** `placeholder="All variants"` can no longer display.

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

After merging local `main` (5522b23, with TTW-005, TTW-163 and TTW-164) and `origin/main` (0fd9548, with TTW-167 and TTW-175) into this branch, on aab8b4a:

- `pnpm verify`: exit 0, every step run, including `migrations:check` (`Prisma schema matches the migrations.`), 145 API suites and 1217 tests under coverage, `coverage:ratchet`, and `build` 5/5 tasks. `coverage:diff` was skipped because the branch has no changed API source against `origin/main`. `audit:prod` passed with 24 low and moderate findings.
- `DATABASE_URL` came from `apps/api/.env.test`, and `SHADOW_DATABASE_URL` pointed to a disposable `tamiym_workshop_ttw165_shadow`, created for the run and dropped after it.
- `pnpm docs:validate`: exit 0.
- The only merge conflict was in `docs/tickets/README.md`: the TTW-005 row keeps `Complete` from `main`, and the TTW-164 and TTW-165 rows are both kept.

Not verified after the merge: the Playwright journey, which `pnpm verify` does not run and which was not replayed on aab8b4a. In `apps/admin`, the merge only changed `app/admin/pricing/bulk-pricing/page.tsx`, so the page this ticket fixes is unchanged since the journey passed. CI has not run either: `ci.yml` only runs on pushes to `main` or `develop` and on PRs, so it could not run on this branch.

CI on GitHub: run 42262808016 on `main` (`2e9b693`) passed, all 18 jobs. That run does not include this ticket's journey, which is tagged `@comprehensive`.

## Completion summary

The admin product page no longer crashes for a product with images. "All variants" now uses the dedicated `ALL_VARIANTS` value, and the saved value for it stays `null`. No deviation from the plan, no migration and no contract change. Merged into `main` locally before CI ran, at the user's request and without a PR. The merge also brings `origin/main` into local `main`, which had diverged from it.

The user pushed `main`, CI passed on `2e9b693`, and the branch and its worktree were deleted.
