# TTW-236 — Render the canvas on shared designs

**Epic:** 8 — Client review delivery\
**Status:** Implemented-unverified (local commit, not pushed, CI not run)\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

Found in a browser run after TTW-099 and TTW-234 were merged: the public page `apps/app/app/design/shared/[shareToken]/page.tsx` never shows the canvas, so TTW-234 (`SharedWorkshopCanvas`, private images through `/v1/public/designs/:token/assets/:id/file`) is never reached.

Reproduction (local): open a share link. The page calls `GET /v1/products/undefined/workshop` (404), swallows the error, and falls back to the design thumbnail.

Root cause (read in code):

- `DesignsService.findByShareToken` (`apps/api/src/designs/designs.service.ts`) returns an allowlist: `id, name, designData, thumbnailUrl, createdAt, product {id, name, slug}, views`. There is no top-level `productId` (and there should not be: it would duplicate `product.id`).
- The page calls `getProductWorkshop(design.productId)`. `getSharedDesign` is typed as the owner's `Design`, which has `productId`, so TypeScript accepts it, but at runtime the field is `undefined`.

## Proposal

Fix the reader, not the API. The public contract already carries the product id in `product.id`.

- Add a `SharedDesign` type in `apps/app/lib/designs.ts` that mirrors the real public response (no `productId`, no owner id, no moderation status) and make `getSharedDesign` return it. The compiler then refuses `design.productId` on this page.
- The page calls `getProductWorkshop(design.product.id)`.
- No API change, no new field exposed, no OpenAPI change.

Rejected: adding `productId` to the public response (duplicates `product.id`, widens the contract for nothing).

## Invariants

- The public response stays an allowlist: no owner id, no moderation status, no share-token data (`design-share.redact.spec.ts` and the service allowlist test).
- The page never requests a workshop for an undefined product id.

## Implementation plan

1. Tests first: API contract test (exact key set of the public response, `product.id` present, no `productId`/`userId`/`moderationStatus`); page test (workshop is requested with `product.id`, one canvas per designable view with the share token).
2. `SharedDesign` type, `getSharedDesign` return type, page uses `design.product.id`.
3. Gates, independent review, one local commit. No push, no PR.

## Test and observability plan

- Unit/component: page test with `getSharedDesign` and `getProductWorkshop` mocked, `SharedWorkshopCanvas` mocked.
- API unit: public response key set.
- Integration/e2e: none added (no API behaviour change); browser run recorded below if possible.
- Logs, metrics, traces, and alerts: none.

## References

- `apps/app/app/design/shared/[shareToken]/page.tsx` — the faulty read.
- `apps/api/src/designs/designs.service.ts` — `findByShareToken`.
- `apps/app/lib/designs.ts` — `getSharedDesign`, `Design`.

## Acceptance criteria

- [x] The shared page requests the workshop of `design.product.id` and renders a canvas per designable view.
- [x] The public API response is unchanged and its key set is pinned by a test.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- Thumbnails (`thumbnailUrl`, `POST /designs/:id/thumbnail`) — handled in another session.

## Design review

Reviewer: author self-review (Standard). Date: 2026-11-21.

- Blast radius: one page and one type in `apps/app`; any other reader of `getSharedDesign` (checked by grep: only this page).
- Duplication: `product.id` already exists; no new field.
- Edge cases: workshop fetch fails → existing thumbnail fallback kept (unchanged).
- Risk: none for data exposure (no API change). Verdict: PASS.

## Implementation reviews

- Review 1 (`/code-review high`, 8 angles, 2026-11-21): no correctness finding. Two notes. (a) The `catch` around `getProductWorkshop` swallows errors silently, which hid this bug; kept because the thumbnail fallback is intended and tested; a log line is a possible later ticket. (b) The ticket sections were empty: filled in below. Verdict: PASS.

## Verification evidence

Deviation from plan: a Playwright spec was added (`tests/e2e/app/shared-design.canvas.spec.ts`, manifest entry `APP-WORKSHOP-SHARED`) because the change is user-visible.

- Tests first, shown failing: `pnpm --filter app test -- __tests__/shared-design` → 1 failed (`Expected: "prod-1" Received: undefined`), 1 passed (thumbnail fallback).
- Playwright without the fix (page temporarily reverted, app rebuilt): `shared-design.canvas.spec.ts` fails, `expect(locator('canvas').first()).toBeVisible()` → element not found.
- API contract test `pins the public response contract` passes before and after: the API was correct, the test only pins that the public query selects `product {id,name,slug}` and never `productId`, `userId` or `shareToken`.
- After the fix: `pnpm --filter app test -- __tests__/shared-design` → 2 passed. Playwright (`--project=setup --project=chromium-app`, throwaway DB `tamiym_workshop_test_ttw236`, REDIS_DB=12, dropped afterwards) → 9 passed, including the new spec.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm openapi:check`, `pnpm docs:validate`, `pnpm playwright:validate`: exit 0.
- `pnpm test`: web 79, app 241, api 1971 tests passed.
- `pnpm --filter api test:coverage` then `pnpm coverage:ratchet`: passed; `pnpm coverage:diff`: skipped, no changed executable file under `apps/api/src`.

## Completion summary

Root cause: the public share response carries the product id in `product.id` (no top-level `productId`, deliberately). The page read `design.productId` because `getSharedDesign` was typed as the owner's `Design`, so the workshop was requested for `undefined`, failed, and the page fell back to the thumbnail. Fix: new `SharedDesign` type matching the real response, page reads `design.product.id`. No API, OpenAPI or exposed-data change. Local commit only, not pushed, CI not run.
