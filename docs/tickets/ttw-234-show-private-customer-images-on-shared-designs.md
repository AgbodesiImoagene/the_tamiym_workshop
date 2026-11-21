# TTW-234 — Show private customer images on shared designs

**Epic:** 8 — Client review delivery\
**Status:** Implemented-unverified (local commit, not pushed, CI not run, no browser run)\
**Risk:** High\
**Blocked by:** TTW-099 (this branch starts from its commit `200887f`)\
**Blocks:** None

## Background

Found during the TTW-099 independent review. TTW-099 made customer uploads private: an image layer in a saved design now has `src = <API>/design-assets/:id/file`, which needs the owner's (or an admin's) session.

The public page `apps/app/app/design/shared/[shareToken]/page.tsx` renders `designData` through `SharedWorkshopCanvas` for anyone holding a share link, with no session. Each customer image layer answers 401, so the shared design shows without the customer's artwork. Before TTW-099 the permanent public URL made it work.

## Proposal

Give the holder of a valid share link read access to the images that design uses, and nothing else.

- New public endpoint `GET /v1/public/designs/:shareToken/assets/:designAssetId/file?variant=original|display|thumb`, `@Public()`, throttled, streaming the bytes with the same headers as TTW-099 (`private, no-store`, `nosniff`) plus `X-Robots-Tag: noindex, nofollow`.
- It answers 200 only if all of these hold, and a uniform 404 otherwise (no enumeration):
  1. the share link exists, is not revoked and not expired, and its design is `APPROVED` (the same rule as `DesignsService.findByShareToken`);
  2. the `designAssetId` appears in that design's `designData` (`data.designAssetId` of an object);
  3. the design asset belongs to the design's owner (a design cannot expose someone else's file by naming its id);
  4. the file is usable: not failed, not infected, scan not failed, not rejected by moderation (the rule applied to owners in TTW-099, without the admin exception).
- The shared canvas rewrites each customer image `src` to that endpoint and loads it with `crossOrigin: 'anonymous'` (no cookie). Stored designs are not changed.

Rejected: making `/design-assets/:id/file` public (no token scope); signed storage links in `designData` (they expire, and a redirect breaks canvas CORS as found in TTW-099).

## Invariants

- A customer upload is never readable without a valid session or a valid share link of a design that uses it.
- A share link opens only the images that its own design references.
- Revoking or expiring a link, or un-approving the design, closes the images at once (checked on every request).
- The share token is never logged: URLs are redacted by `redactPublicDesignShareUrl`, which already matches this longer path.

## Implementation plan

1. Create the worktree from the TTW-099 branch (done) and record the design review below.
2. Tests first: unit (`DesignAssetsService.openSharedFile`, design-data scan), e2e on a throwaway database, component test of the `src` rewrite. Show them failing.
3. `DesignAssetsService.openSharedFile`, reusing the TTW-099 usability rules and `S3Service.getPrivateObjectStream`; public route in `PublicDesignsController`; `DesignsModule` imports `DesignAssetsModule`.
4. App: `sharedImageSource` helper in `apps/app/lib/designs.ts`, `shareToken` prop on `SharedWorkshopCanvas`, passed by the shared page.
5. `pnpm openapi:generate`, docs, TTW-099 ticket «Remaining» line removed.
6. Gates, independent review, one local commit. No push, no PR.

## Test and observability plan

- Unit: asset ids found in nested `designData`; valid token, revoked, expired, unapproved design, unknown token, asset not referenced, asset of another owner, rejected/infected/failed file, derivative not ready, bad variant.
- Integration/e2e (real Postgres + Redis, in-memory object store): the same cases through HTTP, plus no `Authorization` header and no cookie.
- Component: the shared canvas gets rewritten sources, `crossOrigin` anonymous, and leaves public catalogue images alone.
- Logs: no token and no signed link in logs; one test checks the redaction of the new path.

## References

- `apps/app/app/design/shared/[shareToken]/page.tsx:79` — the page that lost the images.
- `apps/api/src/designs/designs.service.ts:796` — `findByShareToken`, the validity rule reused here.
- `apps/api/src/designs/public-designs.controller.ts` — the public controller.
- `apps/api/src/design-assets/design-assets.service.ts` — TTW-099 read rules.
- `docs/tickets/ttw-099-make-customer-uploads-private.md` — origin of this regression.

## Acceptance criteria

- [x] An anonymous visitor with a valid share link sees the customer images of that design (proved over HTTP with an in-memory store, not in a browser).
- [x] The same request is refused (404) for a revoked or expired link, an unapproved design, an asset the design does not reference, an asset of another owner, and a rejected, infected or failed file.
- [x] Swagger, shared contracts and docs are updated.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Public campaign pages and the design thumbnail (`thumbnailUrl`): the thumbnail was left public here, which was wrong (it shows the customer's images). Made private in TTW-237.
- Browser run against a real object store: not possible on this machine (no MinIO).

## Design review

Date: 2026-11-20. Blast radius: one new public route, one service method, one canvas prop; no schema change, no migration.

- **Duplication check.** The usability rules (failed, infected, scan failed, rejected) already live in `DesignAssetsService.authorizeRead` (TTW-099). They are extracted into one private helper used by both the session path and the share path, so the two cannot drift. Token validity reuses `hashDesignShareToken` and the same deny conditions as `findByShareToken`.
- **Why check `designData`.** A share token proves the holder may see one design, not every file of its owner. Without the reference check, any token holder could read any `designAssetId` they guess or learn. Collection is a bounded recursive scan for `designAssetId` strings, ignoring everything else. `designData` is capped at 2 MB on save, so the scan is cheap.
- **Why check the owner.** `designData` is client-supplied. A user could write another customer's `designAssetId` into their own design and share it. Requiring `designAsset.ownerUserId === design.userId` closes that.
- **Admin exception.** None here: a public viewer never gets the owner/admin review access.
- **Edge cases.** Token length bounds as in `findByShareToken`; uniform 404 for every denial; a variant not generated yet is 404; a legacy PUBLIC asset is 404 (never read from the private bucket).
- **Throttle.** 240 requests per minute per client, because a design can have several images and a page loads them together (the JSON route keeps 60).
- **Risks.** The canvas fetch is cross-origin and anonymous: the API CORS already allows the app origins. Not exercised in a browser here (no MinIO).
- **Verdict.** Go.

## Deviations from the plan

- The link-validity rule (token length, revoked, expired, design approved) was extracted into `apps/api/src/designs/design-share.policy.ts` and is now used by both `DesignsService.findByShareToken` and `DesignAssetsService.openSharedFile`, after the review found it duplicated. The behaviour of the shared design itself is unchanged (its existing tests pass).
- The throttle is 240 requests a minute for the image route (60 for the JSON route), as designed.

## Implementation reviews

Independent review (`/code-review high`, 2026-11-20), 6 findings:

- Fixed: images nested in a Fabric group were not rewritten on the canvas (now recursive, test added); duplicated share-link rule (extracted, see Deviations).
- Not fixed: the e2e suite was written before the route and only run after (unit and component tests were shown failing first); every image request re-reads and re-scans the whole `designData`; the streamed S3 body is not destroyed on client abort (same as TTW-099); no browser run of the shared canvas.

## Verification evidence

Run from the worktree `codex/shared-design-private-images` (cut from `200887f`), on 2026-11-20.

- Tests shown failing first: `design-data-assets.spec.ts` and `design-assets.shared.service.spec.ts` (17 failed), app `shared-design-images.test.ts` and `SharedWorkshopCanvas.test.tsx` (7 failed of 8), and the group case (1 failed) before the recursive rewrite.
- `pnpm lint`: 0 errors (admin 22 and api 14 warnings, none from this change). `pnpm format:check`: all files formatted. `pnpm typecheck`: 6 of 6 tasks.
- `pnpm test`: api 1960, app 187, web 79 tests, all passed.
- `pnpm --filter api test:coverage`, `pnpm coverage:ratchet` passed. `pnpm coverage:diff`: 117/132 lines (88.64%), floor 80% (the diff is against `origin/main`, so it includes TTW-099).
- `pnpm openapi:generate` then `pnpm openapi:check`, `pnpm docs:validate`, `pnpm migrations:check`: passed (no migration here).
- API e2e on a throwaway database `tamiym_workshop_test_ttw_shared` (REDIS_DB=13, dropped afterwards): `shared-design-private-images` (valid link, default variant, unknown variant, unknown token, revoked, expired, closed at once after revocation, design not approved, asset not referenced, other design, other owner, infected, scan failed, processing failed, rejected, rendition not ready), `private-customer-uploads` and `privacy-lifecycle`: 3 suites, 27 tests passed.
- Not run: `pnpm build`, `pnpm audit:prod`, Playwright, a browser. There is no MinIO here: storage is an in-memory fake, and the shared page with a real canvas was not played.

## Completion summary

An anonymous visitor with a live share link can read the customer images of that design through `GET /v1/public/designs/:shareToken/assets/:designAssetId/file`. The route answers 404 unless the link is live, the design approved, the image used by that design, owned by the design's owner and usable. `SharedWorkshopCanvas` rewrites image sources to that route with `crossOrigin: 'anonymous'`. No schema change. Local commit only, nothing pushed, CI not run. To check by hand with a real object store: open a shared design link in a private window and confirm the customer images show.
