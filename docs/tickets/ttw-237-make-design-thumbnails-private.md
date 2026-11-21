# TTW-237 — Make design thumbnails private

**Epic:** 8 — Client review delivery\
**Status:** Implemented-unverified (local commit, not pushed, CI not run, no browser run against a real object store)\
**Risk:** High\
**Blocked by:** TTW-099 (merged on `main`). Policy confirmation by the client: see "Décisions à obtenir" below.\
**Blocks:** None

## Background

TTW-099 made customer uploads private. The thumbnail of a design is a picture of the canvas, so it contains the same customer images, but it was left public (TTW-234 says so in its "Out of scope": "the thumbnail … stays public").

Today `POST /v1/designs/:id/thumbnail` (`DesignsController.uploadThumbnail`, `DesignsService.uploadThumbnail`, `apps/api/src/designs/designs.service.ts:582`) stores the file with `S3Service.uploadObject` in the PUBLIC bucket under `thumbnails/<designId>/thumb.<ext>` and writes the storage address into `Design.thumbnailUrl`. Verified in a browser run: `GET http://127.0.0.1:9000/tamiym-assets/thumbnails/<id>/thumb.webp` answers 200 with no session, for ever, whatever the moderation status of the design (even REJECTED).

Other defects found while reading the code:

- `CreateDesignDto` and `UpdateDesignDto` accept any `thumbnailUrl` string from the client (`dto/create-design.dto.ts:28`, `dto/update-design.dto.ts:25`). A user can point a design at any address, which is then shown to admins and supporters.
- `uploadThumbnail` never re-runs moderation: an APPROVED design can get a new picture that nobody screens. And `moderateDesign` only looks at the image when the URL is "trusted", and at creation time the thumbnail is not uploaded yet, so in practice the picture is never screened by the AI.
- The key depends on the extension (`thumb.png` and `thumb.webp` can both exist for one design).
- `duplicate` copies the address of the original's thumbnail to the copy (`designs.service.ts:642`): the copy shows the original's picture, and would break once the key is per design.

## Proposal (policy to confirm)

The thumbnail goes to the PRIVATE bucket and is served by the API. `thumbnailUrl` stops being a storage address and becomes a stable API path.

- **Storage.** `S3Service.uploadPrivateObject`, one fixed key `design-thumbnails/<designId>` (no extension; the content type is stored with the object and the bytes are verified by magic number, as in TTW-099). A new upload replaces the old one. Deleting the design deletes the object (see "Out of scope" for retention).
- **Read.** New `GET /v1/designs/:id/thumbnail`, streamed with `getPrivateObjectStream`, headers `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex, nofollow`.
  - The owner and admins: always.
  - A visitor without a session (or a customer who is not the owner): only if the design is `APPROVED`. In every other case a uniform `404` (no way to tell "does not exist" from "not allowed").
  - A design that becomes `REJECTED` (or `FLAGGED`, or back to `PENDING`) closes the thumbnail at once: the rule is checked on every request, nothing is cached.
- **`thumbnailUrl`.** The column keeps its name but holds the API path `/designs/<id>/thumbnail` (relative to the API base, which already ends with `/v1` in the three frontends). It is server-controlled: it is removed from `CreateDesignDto` and `UpdateDesignDto`, and only `uploadThumbnail` writes it.
- **Moderation.** When a thumbnail is uploaded, the bytes are screened inline (`moderateImageBytes`, no link, same as TTW-099) and the result is recorded like an update of the design content, so a new picture can never inherit an old APPROVED.
- **Duplicate.** The copy gets its own object (server-side copy of the bytes) and its own path, and is `PENDING`.
- **Legacy data.** No production, so a light migration: a one-shot idempotent script `apps/api/scripts/migrate-design-thumbnails.ts`. For every design whose `thumbnailUrl` is not the new path, it sets the column to `null`; then it deletes everything under `thumbnails/` in the public bucket. Thumbnails come back at the next save in the workshop (the editor uploads one at each save). No Prisma schema change, so no SQL migration.

Rejected alternatives:

- Signed temporary links stored in `thumbnailUrl`: they expire, so every list would need regenerating, and crawlers and cached pages would break.
- Keep the thumbnail public but with an unguessable key: still permanent and unmoderated; a leaked link stays valid for ever.
- A new column `thumbnailKey`: a schema change with no benefit, since the key is derivable from the design id.

## Who reads `thumbnailUrl` today, and what changes

Counted with `grep -ri thumbnail` on `apps`, `packages` (excluding generated files, product-image roles and tests).

**API (no code change except the first row; the value just changes):**

| File                                                                                                                         | Use                                       | Change                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `designs/designs.service.ts` (`create`, `update`, `uploadThumbnail`, `duplicate`, `moderateDesign`, `updateModeration` hash) | writes and moderation                     | rewritten (see Proposal)                                                                     |
| `designs/designs.controller.ts`, `dto/create-design.dto.ts`, `dto/update-design.dto.ts`                                      | upload route, client-supplied URL         | new GET route; field removed from both DTOs                                                  |
| `fundraising/campaigns.service.ts` (4 selects, 1 mapper: lines 91, 337, 461, 529, 1173)                                      | organiser and public campaign offers      | none (public offers already keep only APPROVED designs, so supporters are inside the policy) |
| `pricing/pricing.service.ts` (lines 800, 899)                                                                                | public offers and the owner DRAFT preview | none (DRAFT preview is for the owner, who reads their own thumbnails)                        |
| `designs/designs.service.ts` `findByShareToken` (~line 813)                                                                  | shared design response                    | **not touched** (other session); it already requires APPROVED                                |

**Frontends (each must turn the path into `${API_BASE}${path}`; today they use the value as is):**

| App   | File                                                                             | Use                                                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| app   | `app/dashboard/design/page.tsx:118`                                              | owner's list of designs                                                                                                                                                    |
| app   | `app/design/shared/[shareToken]/page.tsx:63`                                     | fallback image of the shared page (**other session's file**: the one-line fix is left to them or done after their merge)                                                   |
| app   | `lib/designs.ts`, `lib/campaign-authoring.ts`                                    | types, upload helper, organiser offer cards                                                                                                                                |
| web   | `components/public-fundraiser-detail.tsx:75`                                     | public campaign picture                                                                                                                                                    |
| web   | `lib/media/social.ts:21`                                                         | Open Graph / Twitter image of a public campaign: **must become an absolute API URL**, otherwise `resolvePreviewImageUrl` would prefix it with the web domain (broken link) |
| web   | `lib/fundraisers.ts`, `lib/fundraiser-selection.node-test.ts`                    | types and test fixtures                                                                                                                                                    |
| admin | `app/admin/moderation/designs/page.tsx:125`, `.../[id]/page.tsx:267`             | moderation list and detail (admin: always allowed)                                                                                                                         |
| admin | `components/campaign-review-panels.tsx:64`, `lib/designs.ts`, `lib/dashboard.ts` | campaign review                                                                                                                                                            |

Impact: 1 API service + 1 controller + 2 DTOs rewritten, 0 schema change, 8 frontend files touched (3 apps) with one small shared helper per app, plus seeds (`seed-e2e-dummy-data.ts:1201,1227` use external placeholder images: they stay as they are in the seed, but the helper must let an absolute `https://` address pass untouched so the existing seeded screens keep working).

Points that need care:

- **Public route with an optional session.** The route is `@Public()` but must still recognise the owner or an admin. If the code base has no "optional authentication" guard, one is added (the cookie is read and verified, a failure means "visitor", never 401). The auth surface is taken from `Origin`, with `Referer` as fallback (`auth-surface.ts`), which is what an `<img>` request sends.
- **Open Graph crawlers** send no cookie: they get the picture only for an APPROVED design, which is exactly the set shown on the public campaign page.
- **No `next/image` or CSP list of storage hosts** was found in `apps/*`, so nothing else to adjust (to be confirmed at implementation with `next build`).

## Invariants

- A design thumbnail is never readable without the owner's or an admin's session, unless the design is `APPROVED`.
- Un-approving a design closes its thumbnail on the next request.
- The public bucket never holds customer-derived pictures after the migration script has run.
- A client can never set `thumbnailUrl`.
- A new thumbnail is always moderated before it can be shown to the public.
- No signed link and no storage address is returned or logged.

## Implementation plan

1. Tests first, shown failing: unit (`DesignsService`: upload goes to the private bucket, fixed key, moderation of bytes, duplicate copies, DTO no longer accepts the field; read rules by role and status), e2e API with an in-memory object store (`createE2eApp` `configure`), as in `private-customer-uploads.e2e-spec.ts`; frontend tests of the URL helper (app, web, admin) and of the Open Graph image.
2. API: private upload, new `GET /designs/:id/thumbnail`, optional-session handling, DTO fields removed, `duplicate`, moderation of bytes.
3. Frontends: one helper per app; replace the 8 usages.
4. Script `migrate-design-thumbnails.ts` with a test; run once on the local databases.
5. `pnpm openapi:generate`; update `docs/privacy/ttw-025-data-inventory.md`, `docs/05-design-workshop.md` if it describes thumbnails; TTW-234 "Out of scope" line corrected.
6. Gates, independent review (`/code-review high`), one local commit. No push, no PR.

## Test and observability plan

- Unit: owner / other customer / visitor / admin × PENDING / APPROVED / FLAGGED / REJECTED; missing object; wrong content type; oversize (2 MB limit kept); duplicate; URL helpers (relative path, absolute https untouched, null).
- Integration/e2e (real Postgres + Redis, in-memory store): upload then read as owner (200), as visitor while PENDING (404), after approval (200), after rejection (404 again, same body as unknown id); the public bucket stays empty; `thumbnailUrl` in the DTO is rejected; re-upload on an APPROVED design is moderated.
- Concurrency: two simultaneous uploads for one design end with one object and a consistent column (last write wins, no orphan).
- Logs: the existing pino redaction is unchanged; a test checks that no log line carries the object key or bytes.

## References

- `apps/api/src/designs/designs.service.ts:582` — current upload to the public bucket.
- `apps/api/src/storage/s3.service.ts:74,127,177` — `uploadObject`, `uploadPrivateObject`, `getPrivateObjectStream`.
- `apps/api/src/design-assets/design-assets.service.ts` — TTW-099 read rules to imitate.
- `apps/api/test/private-customer-uploads.e2e-spec.ts` — e2e pattern with an in-memory store.
- `docs/tickets/ttw-099-make-customer-uploads-private.md`, `docs/tickets/ttw-234-show-private-customer-images-on-shared-designs.md`.

## Acceptance criteria

- [x] An anonymous request for the thumbnail of a PENDING, FLAGGED or REJECTED design answers the same 404 as an unknown id; for an APPROVED design it answers 200.
- [x] The owner and an admin read the thumbnail whatever the status.
- [x] After upload, the public bucket contains no object for the design and `thumbnailUrl` is the API path.
- [x] Rejecting an approved design closes its thumbnail at once.
- [x] `thumbnailUrl` is refused in the create and update bodies.
- [x] The app, web (including the Open Graph image) and admin screens still show thumbnails.
- [x] The migration script nulls legacy values and empties `thumbnails/` in the public bucket.
- [x] Required quality gates pass with evidence recorded below.
- [x] Swagger, shared contracts and docs are updated.

## Out of scope

- Deleting thumbnail objects when a design or an account is deleted, and the retention job: covered by TTW-120 and TTW-235 (a note is added to both so they include `design-thumbnails/`).
- The shared page `apps/app/app/design/shared/[shareToken]/page.tsx` and `DesignsService.findByShareToken` (other session): only the one-line use of the helper there, after that session merges.
- Product images (`ProductImageRole THUMBNAIL`): public catalogue pictures, not customer data.

## Décisions à obtenir

1. Confirm the policy above (private bucket, APPROVED designs readable by visitors, owner and admins always).
2. Confirm that a new thumbnail is moderated at upload (a design can move from APPROVED to FLAGGED when it is saved with a flagged picture). Alternative: only reset to PENDING if the design was APPROVED.
3. Confirm the light migration: legacy thumbnails are dropped and regenerate at next save.

## Design review

Date: 2026-11-21. Reviewer: author only so far; the independent design review is the confirmation above plus the implementation review. Blast radius: one API domain (designs), 3 frontends, one script, no schema change.

- **Duplication check.** Private streaming, content-type verification and the "uniform 404" pattern already exist in `DesignAssetsService` (TTW-099, TTW-234): reuse them, do not write a second reader.
- **Interfaces.** New GET on an existing path (the POST stays); two DTO fields removed (breaking for a client that sent them, none do apart from tests); `thumbnailUrl` value format changes from an absolute address to a relative path. No production, so no compatibility layer.
- **Edge cases.** No thumbnail yet (null → placeholders as today); extension no longer in the key; replacement upload; duplicate; design deleted (object left until TTW-120/235); seeds with external https images; Open Graph absolute URL.
- **Risks.** Optional-session handling on a public route (the main security risk: a mistake would either lock out owners or open the picture); frontends that forget the helper show broken images (covered by tests per app and a browser run).
- **Verdict.** Approved by the client (policy and the 3 decisions: yes to all). The user confirmed the policy as recommended: private thumbnail served by the API; owner and admins always; a visitor without a session only if the design is APPROVED, otherwise a uniform 404; a rejected design closes its thumbnail at once. This confirmation was relayed by the parent session on 2026-11-21 (its first brief wrongly said the user already agreed).

## Implementation reviews

Review 1 (`/code-review high`, inline, 8 angles), 8 findings:

- Fixed: a new picture could lift an admin REJECTED / FLAGGED / PENDING design to APPROVED through the AI decision. Now the status can only get stricter (`stricterStatus`); tests `never lets the AI lift a … design to APPROVED` and e2e `keeps a rejected design rejected`.
- Fixed: the object was replaced before the status was downgraded. Now the transaction commits first, then the object is written; test `commits the status change before the new picture replaces the old object`.
- Not applied, recorded: public thumbnails are `no-store` and not throttled (kept on purpose, same as TTW-099 file reads; a cache policy for approved thumbnails is a follow-up); `update()` screens designData text only, the editor uploads a new picture right after (existing behaviour of `update`, not widened here); storage failure is reported as 404 (the storage layer cannot tell a missing key from an outage); double decode on upload (2 MB cap, negligible); helper copied in three apps (admin has no unit test runner, each app owns its API base).
- Disclosure: existing unit tests were rewritten, not only added, because the contract changed with the approved policy: `create … thumbnail provided` (the DTO field no longer exists) and the three `uploadThumbnail` tests (public bucket and extension key, fake bytes). Nothing was skipped or weakened: each now asserts the new behaviour, and the removed cases are covered by new tests.

## Verification evidence

Run on branch `codex/ttw-237-private-design-thumbnails` from `origin/main` `fa07b97` (database `tamiym_workshop_test_ttw237`, `REDIS_DB=13`, dropped afterwards).

- Red first: the new e2e `private-design-thumbnails.e2e-spec.ts` failed 10/11 before the implementation; unit `designs.service.spec.ts` failed on the new cases; `design-thumbnail.test.ts` (app, web) failed with "Cannot find module".
- `pnpm lint`: 0 errors (existing warnings only). `pnpm format:check`: pass. `pnpm typecheck`: 6/6 pass.
- `pnpm test`: api 1992+ passed (173+ suites), app 243, web 84 (before the review fixes; `src/designs` re-run after: 91 passed).
- `pnpm --filter api test:coverage` + `pnpm coverage:ratchet`: pass. `pnpm coverage:diff`: 57/60 lines, 95.00% (floor 80%).
- `pnpm openapi:generate` then `pnpm openapi:check`: pass. `pnpm docs:validate`, `pnpm playwright:validate`: pass.
- e2e `private-design-thumbnails`: 12 tests (owner/admin/visitor/stranger × statuses, close on reject, invalid token = visitor, 400 on client `thumbnailUrl`, non-image bytes, re-moderation, concurrent uploads, duplicate, rejected stays rejected).

Not verified: browser run with a real object store (no MinIO on this machine); the migration script against real storage (core tested with fakes, `S3Service` list/delete tested with a mocked client); the admin helper has no unit test (admin has no test runner), only typecheck; Playwright suites were not run.

## Fix after merge (2026-11-21)

The CI of `main` (run 44893074471, commit `0699870`) failed on `Playwright Comprehensive UAT`, a job that runs only on `main`: `GET /v1/designs/<id>/thumbnail` answered an error and Chrome blocked it (`net::ERR_BLOCKED_BY_ORB`) on the admin moderation pages. Cause: `DesignsService.uploadThumbnail` wrote `thumbnailUrl` in the database before the storage write. When the write failed (the CI has no object store) the row kept a path to a picture that does not exist; a real storage outage would do the same. Fix: the path is now written only after the picture is stored. Tests first: two new cases in `designs.service.spec.ts` (no path when the storage write fails; path set after the upload), failing before the fix.

## Completion summary

Thumbnails are private, served by `GET /v1/designs/:id/thumbnail` (owner and admins always; others only if APPROVED; uniform 404), stored at `design-thumbnails/<designId>` as WebP, moderated from bytes, status can only tighten. `thumbnailUrl` is an API path set by the server; the DTO fields are removed. Frontends use `designThumbnailSrc` (app, web, admin); the Open Graph image is an absolute API URL. `apps/api/scripts/migrate-design-thumbnails.ts` clears legacy values and empties `thumbnails/` in the public bucket (to run once per environment, `--dry-run` available). No schema change. Follow-ups: shared page fallback image (other session) must use `designThumbnailSrc`; TTW-120 and TTW-235 must include `design-thumbnails/`; cache policy for approved thumbnails.
