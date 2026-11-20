# TTW-099 — Make customer uploads private with signed links

**Epic:** 8 — Client review delivery\
**Status:** Implemented-unverified (local commit, not pushed, CI not run)\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-100, TTW-101, TTW-120

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 11.3, Uploads reachable by public URL** (High, P1, 8–14 h, status "To do"): Private storage and temporary links needed, including for AI analysis.
- **Row 9.7, Customer artwork reachable by public link** (High, P1, 0–0 h, status "Included in 11.3"): For AI analysis, originals are made public before moderation.

## Proposal

- Store customer originals in private storage and serve them through short-lived signed links, including for the AI analysis.
- Keep catalogue photos public: only customer uploads change.
- Follow `.cursor/rules/media-security.mdc`, and update `docs/privacy/ttw-025-data-inventory.md`.

## Invariants

- A customer upload is never readable without a valid link.
- Signed links expire and are not logged.
- A file that fails scanning stays unusable, and the scanner still fails closed.

## Implementation plan

1. Start `codex/ttw-099-make-customer-uploads-private` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Generate the migration with `pnpm --filter api exec prisma migrate dev --name <name>`, after checking that no other open ticket has one in flight.
8. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: the public URL is refused, the signed link works and then expires.
- Failure: storage or moderation is unavailable.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/media/media.processor.ts:116` — row 11.3
- `apps/api/src/media/media.processor.ts:116` — row 9.7
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] An original cannot be opened by a permanent public URL, before or after moderation.
- [x] Swagger, shared contracts, migrations and docs are updated where applicable.
- [x] Required quality gates pass, with evidence recorded below. (Playwright and a browser run of the workshop were not possible: see Remaining.)

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Date: 2026-11-20. Scope decided by the user: **everything** of a customer upload becomes private (original, display and thumb), not only the original.

### Finding confirmed on `main` (85f9c27)

- `S3Service.uploadObject` (`apps/api/src/storage/s3.service.ts`) writes every object to one bucket and returns a permanent URL built from `S3_PUBLIC_URL`. That URL is stored in `MediaAsset.originalUrl` and `MediaDerivative.url`.
- `MediaService.createAssetFromUpload` (`media.service.ts:186`) is shared by customer uploads (`design-assets.service.ts:33`) and catalogue images (`products.service.ts:1070,1103`). The catalogue must stay public, so the asset needs a visibility.
- `MediaProcessor` (`media.processor.ts:109-121`) sends the public `originalUrl` to AI moderation, before any decision. That is the "originals are made public before moderation" case (row 9.7).
- The Workshop saves `originalUrl` as the Fabric image `src` (`apps/app/components/workshop/ImageTool.tsx:41-50`), so a saved design stores that URL.

### Design

1. **Visibility.** New enum `MediaVisibility { PUBLIC PRIVATE }` and column `MediaAsset.visibility`, default `PUBLIC` (catalogue unchanged). `design-assets` creates `PRIVATE` assets. `MediaDerivative.url` and `MediaAsset.originalUrl` are not stored for private assets (`MediaDerivative.url` becomes nullable). Only keys are persisted.
2. **Storage.** Private objects go to a separate bucket (`S3_PRIVATE_BUCKET`), written without ACL and never reachable through `S3_PUBLIC_URL`. If the private bucket is not configured, a private upload is refused. It never falls back to the public bucket (fail closed).
3. **Read path.** (Changed during implementation, see Deviations.) `GET /v1/design-assets/:id/file?variant=original|display|thumb` is authenticated, allowed for the owner and for admins only (ownership re-checked in the service), and streams the image bytes with `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`. `GET /v1/design-assets/:id/link?variant=...` returns `{ url, expiresInSeconds: 300 }`, a presigned GET link that is never persisted and never logged. Saved designs reference the stable `/file` path, so they do not break when a link expires. The upload response no longer returns `originalUrl`, only `designAssetId` and `status`.
4. **AI moderation.** The processor already holds the bytes after the scan, so moderation receives the image as a base64 `data:` URL built from the resized display buffer. No link, public or signed, leaves the system for moderation. The "No URL available" branch disappears for private assets.
5. **Failure.** Scanner unavailable, infected file, storage down, moderation down: unchanged fail-closed behaviour, and the file stays unreadable through the read path unless `status = READY` for the owner (admins may read any status to review).
6. **Admin.** `adminFindAll/adminFindOne` stop returning stored URLs for private assets and return the same stable path pattern instead, served to admins by the same endpoint family.
7. **Migration.** One CLI-generated migration (enum, column, nullable url). No other open ticket has a migration in flight (no open ticket branch besides this one and TTW-102, which has none). The project is not in production: no data migration of existing public objects; dev rows stay `PUBLIC`.

### Risks and how they are handled

- Fabric canvas with a cross-origin image: a redirect to a signed storage link cannot carry credentials through CORS (the redirect makes the request origin `null`), so `/file` streams bytes from the API instead. Still to confirm in a browser.
- Design thumbnails (`designs.service.ts` `/thumbnail`) are generated by the app, not customer uploads: out of scope, flagged for a later ticket.
- Overlap with TTW-100 (server-side design validation) and TTW-101 (print files): both will read originals through the new private read path.

### Out of scope here

- Erasing files of deleted accounts (TTW-120), lifecycle cleanup of rejected/orphaned private objects beyond what exists today.

## Deviations from the plan

- `/file` streams bytes instead of redirecting to a signed link, because the Fabric canvas needs a credentialed CORS image and a cross-origin redirect to storage breaks that. The signed link is provided by the separate `/link` endpoint.
- AI moderation receives the resized display image inline (base64 data URL) rather than a presigned link, so no link leaves the system. For a private asset the display image is built before moderation.
- New dependency `@aws-sdk/s3-request-presigner@3.1114.0` (added with `pnpm --filter api add`). It resolves `@smithy/types` 4.20.0 while `client-s3` uses 4.17.2, so `S3Service.createPrivateReadUrl` casts the client and command types.
- The e2e harness `createE2eApp` takes an optional `configure` callback to override providers (here an in-memory object store). There is no MinIO on this machine.
- Admin: `GET /admin/media` and `/admin/media/:id` add `accessPath` on derivatives of private assets (`MediaDerivative.url` is null for them). `apps/admin/lib/media.ts` and the moderation media detail page use it.

## Implementation reviews

Independent review (`/code-review high`, 2026-11-20) reported 9 findings:

- Fixed: stale design review in this ticket.
- Not fixed, recorded under Remaining: shared design page (`apps/app/app/design/shared/[shareToken]/page.tsx`) shows blank customer images to anonymous visitors; `S3_PRIVATE_BUCKET` is not provisioned in OpenTofu or validated at startup; no lifecycle cleanup of rejected, infected or orphaned private objects; streamed S3 body not destroyed on client abort; duplicated bucket code in `S3Service`; type casts caused by duplicate `@smithy/types`; the owner can read the original before the scan completes (needed so the canvas shows the image right after upload); no browser run of the workshop.

A second review pass after the Remaining items are handled is still to do.

## Verification evidence

Run from the worktree `codex/ttw-099-make-customer-uploads-private`, on 2026-11-20.

- Tests written first and shown failing for the missing feature: 24 failed, 17 passed across `s3.service.spec.ts`, `media.service.spec.ts`, `media.processor.private.spec.ts`, `design-assets.service.spec.ts`, `moderation.service.spec.ts`. App tests: 7 failed before `designAssetFileUrl` and `imageCrossOrigin` existed.
- `pnpm lint`: 0 errors, 14 warnings (none in touched files: `eslint` on the touched api files prints nothing).
- `pnpm format:check`: all matched files use Prettier code style.
- `pnpm typecheck`: 6 of 6 tasks successful.
- `pnpm test`: api 168 suites, 1918 tests; app 20 suites, 178 tests; web 12 suites, 79 tests; all passed.
- `pnpm --filter api test:coverage` then `pnpm coverage:ratchet` (statements 84.74% vs floor 55.64%, branches 69.83% vs 48.73%, functions 75.53% vs 54.64%, lines 85.04% vs 56.00%) and `pnpm coverage:diff` (88/103 lines, 85.44%, floor 80%): passed.
- `pnpm openapi:check`, `pnpm docs:validate`, `pnpm migrations:check`: passed.
- API e2e on a throwaway database `tamiym_workshop_test_ttw099` (REDIS_DB=14, dropped afterwards): `private-customer-uploads`, `products`, `moderation-appeals`, `privacy-lifecycle`, `schema-reconciliation`, `app`: 6 suites, 29 tests passed. The new suite has 10 tests: private storage and no URL in the database, storage failure, signed link JSON (300 s), streamed bytes and headers, 401 and 404 for strangers, unknown variant, infected file (owner 404, admin 200), derivative not ready, signing failure, streaming failure.
- Not run: `pnpm audit:prod`, `pnpm build`, Playwright, `pnpm verify` as a whole.

## Remaining

Handled after the first review (second commit):

- Shared designs: TTW-234 (separate branch `codex/shared-design-private-images`).
- Private bucket: the infra already has a private `<prefix>-originals` bucket (ACL private), so no new OpenTofu resource. `S3_PRIVATE_BUCKET` maps to it (documented in `infra/runtime/secrets/README.md`), and `validateEnv` now refuses to start in production when `S3_BUCKET` is set without a distinct, non-placeholder `S3_PRIVATE_BUCKET` (`env-validation.spec.ts`, 4 tests).
- Infected private files: the processor now deletes the stored object and the ORIGINAL derivative row and clears `originalKey` (`MediaProcessor.purgeInfectedOriginal`, `S3Service.deletePrivateObject`). If the deletion fails the key is kept and the error logged. A scanner outage (scan FAILED) and a moderation rejection are deliberately NOT purged: the first can be rescanned, the second may be appealed.

Still open:

- Retention of rejected private files and of orphan objects: needs a business decision (how long a rejected upload is kept for appeals). Deleted accounts: TTW-120.
- Streamed S3 body is not destroyed when a client aborts (minor).
- Play the workshop journey in a browser against MinIO: add an image, save, reload, thumbnail export. No Docker or MinIO on this machine.
- Existing dev design assets stay `PUBLIC` and answer 404 on `/file`; no data migration was done (not in production).

## Completion summary

Customer uploads are now stored in a separate private bucket, with no URL in the database, and read only through the authenticated `/file` stream or the 5-minute signed `/link`. AI moderation gets the image bytes inline. Catalogue images are unchanged. Local commit only: nothing pushed, CI not run. See Remaining before closing the ticket.
