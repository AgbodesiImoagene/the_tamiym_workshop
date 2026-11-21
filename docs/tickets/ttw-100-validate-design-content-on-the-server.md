# TTW-100 — Validate design content on the server

**Epic:** 8 — Client review delivery\
**Status:** Implemented-unverified (pushed, CI green on `aaaf66f`, not merged, third review pass done)\
**Risk:** High\
**Blocked by:** TTW-099\
**Blocks:** TTW-058

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 3.7, Design content not validated; moderation can be bypassed** (Critical, P0, 10–16 h, status "To do"): The server accepts any JSON: external images or another user's images, with no scan or moderation. Moderation only sees the text and a browser-generated thumbnail.

## Proposal

- Validate the saved design JSON against a strict allowlist of object types and fields.
- Accept images only when they are READY media assets owned by the design owner. Refuse external URLs.
- Keep the existing 2 MB limit, and return stable error codes the editor can display.

## Invariants

- A design cannot reference an external image or another user's asset.
- Designs the editor produces today still save.

## Implementation plan

1. Start `codex/ttw-100-validate-design-content-on-the-server` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: valid designs from the editor, external image, foreign asset, unknown object type.
- Integration: create and update refused with the right codes.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/designs/designs.service.ts:95` — row 3.7
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] The bypass described in the review no longer works.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- A server-side render for moderators → TTW-143.

## Design review

Date: 2026-11-21. TTW-099 is already on `main`, so the blocker is lifted.

### Finding confirmed on `main` (fa07b97)

- `DesignsService.validateDesignData` only checked "non-null object" and the 2 MB size. `create` and `update` stored any JSON, so an external image URL or another user's `designAssetId` reached the database, the shared-design page and (later) the print pipeline. Moderation only reads the text and the browser thumbnail.
- The editor saves Fabric `toObject(['designAssetId','data'])` output. After TTW-099 an image is `{ type: 'Image', src: <API_BASE>/design-assets/<id>/file?variant=..., data: { designAssetId, layerId } }`. The real key sets of `IText`, `Textbox` and `FabricImage` (Fabric 7.4.0) were captured from the library and are the fixtures of the unit tests.

### Design

1. **Allowlist** (`apps/api/src/designs/design-content.validator.ts`, pure, no database). Top level: `version`, `productId`, `views`. View: `productViewId`, `fabricJson`, `isUsed`, `layerCount`, legacy `layers`. `fabricJson`: `version`, `objects`, `background` (so no `backgroundImage`, no `clipPath`). Objects: `IText`/`i-text`, `Textbox`, `Text`, `Image` (type compared without case or dashes), each with the Fabric field list and a type per field. A fill or stroke is a string, never a pattern or gradient object (a pattern carries an image source). `shadow` must be null and `filters` empty. At most 200 layers per view, text at most 5000 characters. Own-property checks, so `__proto__` or `constructor` cannot slip through.
2. **Images.** An image must name one design asset (`data.designAssetId`, or top-level, never two different ones). Its `src`, if present, must be exactly `<API_PUBLIC_URL>/design-assets/<same id>/file`, optionally `?variant=original|display|thumb`: same origin, no credentials, no fragment, no other query. Anything else is `DESIGN_IMAGE_EXTERNAL`.
3. **Ownership and readiness** (`DesignsService.assertDesignContent`). One `designAsset.findMany` for all ids with `ownerUserId = the design owner`. A missing id (unknown or someone else's) gives `DESIGN_ASSET_NOT_FOUND`, the same answer for both so ids cannot be probed. Not `READY` gives `DESIGN_ASSET_NOT_READY`. A READY asset whose moderation is `FLAGGED` or `REJECTED` gives `DESIGN_ASSET_NOT_APPROVED` (added after the review). `PENDING` is accepted on purpose: a moderation outage leaves it, and the design is moderated itself. Business decision to confirm if the client wants stricter.
   Only images name a design asset: a text layer carrying `designAssetId` (in `data` or at top level) is refused with `DESIGN_FIELD_NOT_ALLOWED`.
4. **When.** On `create` and on `update` when `designData` is sent, before moderation and before any write. A name-only update does not re-validate saved content.
5. **Errors.** HTTP 400 with `{ statusCode, code, message }`. Codes: `DESIGN_TOO_LARGE` (the 2 MB limit is kept), `DESIGN_STRUCTURE_INVALID`, `DESIGN_FIELD_NOT_ALLOWED`, `DESIGN_FIELD_VALUE_INVALID`, `DESIGN_OBJECT_TYPE_NOT_ALLOWED`, `DESIGN_IMAGE_EXTERNAL`, `DESIGN_IMAGE_ASSET_MISSING`, `DESIGN_ASSET_NOT_FOUND`, `DESIGN_ASSET_NOT_READY`, `DESIGN_ASSET_NOT_APPROVED`. They are listed in the Swagger text of `POST /designs` and `PATCH /designs/:id`.
6. **Configuration.** The server did not know its own public address. User decision (2026-11-21): new `API_PUBLIC_URL`, required and validated in every deployment (`validateEnv`), with no fallback in any named environment (staging, preview...): `validateEnv` also requires it there. Only `NODE_ENV` unset, `development` or `test` falls back to `http://localhost:3001/v1` (the app's own default), see `isLocalEnvironment` in `env-validation.ts`. Without it in production every design with an image would be refused (fail closed). Documented in `apps/api/.env.example`, `infra/runtime/secrets/.env.example` and its README.
7. **No migration, no new dependency.**

### Risks and how they are handled

- Allowlist too strict after a Fabric upgrade: the unit tests use real Fabric 7.4.0 output, and the Playwright layers and reopen journeys save through the real editor. A Fabric upgrade must re-capture the keys.
- `API_PUBLIC_URL` must equal the `NEXT_PUBLIC_API_URL` the customer app is built with. A mismatch refuses every image design: stated in the infra README.
- Designs saved before TTW-099 (public storage URL in `src`, dev data only, no production users) are refused at their next save that sends `designData`. Not migrated: the project is not in production.
- The client review row says moderation sees only the text and thumbnail. This ticket closes the bypass (nothing but moderated-pipeline uploads can be referenced). Server-side render for moderators stays in TTW-143.

## Deviations from the plan

- The ticket proposes "images only when READY media assets owned by the design owner". "Owned" is `DesignAsset.ownerUserId` (the media asset has no owner of its own).
- Legacy `views.<key>.layers` (read by the moderation text extraction, never written by the editor) is still accepted, with the same per-layer rules, so the existing service tests keep their meaning. One existing unit-test fixture changed: the legacy `da-1` image now needs a READY asset of the owner (a `designAsset.findMany` mock). No assertion was weakened or removed.
- `apps/api/test/design-content-validation.e2e-spec.ts` was written after the implementation, not before. The unit tests were written first and shown failing (10 failed in `designs.service.spec.ts`, the validator suite failing to load, 4 failed in `env-validation.spec.ts`).

## Implementation reviews

`/code-review high`, 2026-11-21, reported 6 findings on the first commit (`acbb95d`). All handled in the second commit:

1. **Fixed, security.** A text layer could carry `data.designAssetId` or a top-level `designAssetId`. The ownership check only covered images, but the shared-design reader (`collectDesignAssetIds`) counts any such key, so a share link could have exposed another user's private image. Text layers (including legacy ones) are now refused when they carry an asset id. Tests: validator spec (2), e2e "victim asset id hidden in a text layer".
2. **Fixed.** A READY asset still FLAGGED (or REJECTED) was accepted. Now `DESIGN_ASSET_NOT_APPROVED`. PENDING stays accepted (decision above). Tests: service spec, e2e.
3. **Fixed.** Any `NODE_ENV` other than `production` fell back to localhost, so a staging deployment without `API_PUBLIC_URL` refused every image with no startup error. `validateEnv` now requires it in any named environment, and the service falls back only for unset, `development` or `test`. Tests: env-validation spec (3), service spec.
4. **Covered.** `apps/app/__tests__/lib/design-image-serialisation.test.ts` serialises a real `FabricImage` with `toObject(['designAssetId','data'])` and checks that `src` is exactly `designAssetFileUrl(id)`, `crossOrigin` is `use-credentials`, `filters` is empty, and every key is on the server allowlist. It passed at once, confirming the assumption. Still not played: an image uploaded and saved in a browser (no MinIO here).
5. **Fixed.** The e2e seed designs held `{ type: 'image', src: <id> }`, which the allowlist refuses on re-save. They now use the Workshop's shape (`seedImageLayer` in `seed-e2e-dummy-data.ts`). The flagged design stays unsavable until its image is approved, which is the intended rule.
6. **Process.** The first e2e suite was written after the code. For the fixes the tests were written first: 7 unit tests failed before the fix (2 validator, 2 moderation, 1 staging fallback in the service spec, 2 env). The two new e2e cases were not run against the old code.

Second review pass (`/code-review high`, 2026-11-21) found 1 issue in the fixes, handled in the third commit:

7. **Fixed, security.** The text-layer rule only looked at `data` and the top-level key, but `styles` (per-character text style) accepted any nested key except `src`. A `designAssetId` hidden there skipped the ownership check while `collectDesignAssetIds` still counted it. `styles` is now validated structurally: only the two shapes Fabric writes (`[{ start, end, style }]` or `{ line: { character: style } }`), and only known style properties (fill, stroke, strokeWidth, fontSize, fontFamily, fontWeight, fontStyle, underline, overline, linethrough, deltaY, textBackgroundColor, textDecorationThickness) with their types. Tests written first and shown failing (2 failed), plus a test that both Fabric shapes are still accepted.

Third review pass (`/code-review high`, 2026-11-21) on this fix: no finding. The review loop is closed.

## Verification evidence

Run from the worktree `codex/ttw-100-validate-design-content-on-the-server`, on 2026-11-21. The figures below are from the run after the third commit, except Playwright (run after the second).

- Tests first, failing for the right reason: validator suite failing to load, `designs.service.spec.ts` 10 failed and `env-validation.spec.ts` 4 failed before the first commit; then 7 failed before the review fixes (see Implementation reviews).
- `pnpm lint`: 0 errors (api 14 warnings, none in touched files). `pnpm format:check`: passed. `pnpm typecheck`: 6 of 6 successful.
- `pnpm test`: api 172 suites, 2046 tests; app 30 suites, 242 tests; web 12 suites, 79 tests; all passed.
- `pnpm --filter api test:coverage`, `pnpm coverage:ratchet` (lines 85.29% vs floor 56.00%, other floors passed) and `pnpm coverage:diff` (202/213 changed lines, 94.84%, floor 80%): passed.
- `pnpm openapi:generate`, `pnpm openapi:check`, `pnpm docs:validate`: passed.
- API e2e on a throwaway database `tamiym_workshop_test_ttw100` (REDIS_DB=13, dropped afterwards): `design-content-validation` (11 tests), `shared-design-private-images`, `moderation-appeals`, `campaign-authoring`, `private-customer-uploads`: 5 suites, 38 tests passed (an earlier 47-test run of 7 suites, which also had `view-surcharge-precedence` and `seed-e2e-fixture-owned-rows`, was before the third commit).
- `pnpm build`, then Playwright `design-workshop.layers.spec.ts` and `design-workshop.reopen.spec.ts` with the setup project on the freshly seeded throwaway database: 13 passed on the first run. On repeated runs the layers journey failed intermittently with "Unexpected console error: 500". The 500 is `POST /v1/designs/:id/thumbnail` (storage is not available on this machine, the editor treats it as non-fatal and it only shows when the console check catches it before the test ends); the design `POST` itself answered 201 each time. Some later repeats also hit the admin MFA rate limit (429) from repeated setup runs. This is environmental, not caused by the ticket, but it means the journey is not green on every run here: it should be confirmed in CI, where storage exists.
- CI, run 44890509726 on the branch (`aaaf66f`), 2026-11-21: all 19 jobs succeeded, including Unit Tests, Coverage, API Integration, API Open Handles, Production Audit, OpenAPI Contracts, Documentation, Migration Baseline, Production Build, the container builds and Playwright Smoke. Playwright Smoke runs the `@smoke` tests only, so it does not confirm the layers journey.
- Third review pass (`/code-review high`, 2026-11-21) on the `styles` fix: no finding.
- Not run: `pnpm verify` as a whole, the whole Playwright suite, a browser journey that uploads an image.

## Remaining

- Confirm the layers Playwright journey (thumbnail upload needs storage, see evidence): CI runs the smoke subset only, so run the `@critical` journeys in an environment with storage.
- Decide with the client whether an image whose moderation is still PENDING may be used in a design (accepted today).
- Show the new error codes in the editor: today the save panel shows the message of the API. Mapping each code to its own wording is a UI ticket (not created).
- Set `API_PUBLIC_URL` in the production secrets before deploying (the API will not start without it).
- `DESIGN_SHARE_PUBLIC_ORIGIN` is also required in production but missing from `infra/runtime/secrets/.env.example` (seen, not changed here).
- `thumbnailUrl` is still accepted as any string and only fetched by moderation when it is on our storage: out of scope here.

## Completion summary

The server now refuses a saved design that is not made of the editor's text and image layers, with an allowlist of objects and fields. Every image must be one of the design owner's READY uploads, served from `API_PUBLIC_URL`; external images and other users' assets are refused with stable codes, before moderation and before any write. The editor's designs still save (Playwright journeys, e2e). Branch pushed, CI green, not merged. See Remaining before closing the ticket.
