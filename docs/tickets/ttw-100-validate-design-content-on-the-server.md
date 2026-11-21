# TTW-100 — Validate design content on the server

**Epic:** 8 — Client review delivery\
**Status:** Implemented-unverified (local commit, not pushed, CI not run)\
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
3. **Ownership and readiness** (`DesignsService.assertDesignContent`). One `designAsset.findMany` for all ids with `ownerUserId = the design owner`. A missing id (unknown or someone else's) gives `DESIGN_ASSET_NOT_FOUND`, the same answer for both so ids cannot be probed. Not `READY` gives `DESIGN_ASSET_NOT_READY`.
4. **When.** On `create` and on `update` when `designData` is sent, before moderation and before any write. A name-only update does not re-validate saved content.
5. **Errors.** HTTP 400 with `{ statusCode, code, message }`. Codes: `DESIGN_TOO_LARGE` (the 2 MB limit is kept), `DESIGN_STRUCTURE_INVALID`, `DESIGN_FIELD_NOT_ALLOWED`, `DESIGN_FIELD_VALUE_INVALID`, `DESIGN_OBJECT_TYPE_NOT_ALLOWED`, `DESIGN_IMAGE_EXTERNAL`, `DESIGN_IMAGE_ASSET_MISSING`, `DESIGN_ASSET_NOT_FOUND`, `DESIGN_ASSET_NOT_READY`. They are listed in the Swagger text of `POST /designs` and `PATCH /designs/:id`.
6. **Configuration.** The server did not know its own public address. User decision (2026-11-21): new `API_PUBLIC_URL`, required and validated in production (`validateEnv`), defaulting to `http://localhost:3001/v1` elsewhere (the app's own default). Without it in production every design with an image would be refused (fail closed). Documented in `apps/api/.env.example`, `infra/runtime/secrets/.env.example` and its README.
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

Pending: independent review for this risk level (`/code-review high`, then security and integration charter) is still to do.

## Verification evidence

Run from the worktree `codex/ttw-100-validate-design-content-on-the-server`, on 2026-11-21.

- Tests first, failing for the right reason: validator suite "Cannot find module './design-content.validator'"; `designs.service.spec.ts` 10 failed (no validation yet); `env-validation.spec.ts` 4 failed.
- `pnpm lint`: 0 errors (api 14 warnings, none in touched files; same count as before). `pnpm format:check`: passed. `pnpm typecheck`: 6 of 6 successful.
- `pnpm test`: api 172 suites, 2033 tests; app 29 suites, 239 tests; web 12 suites, 79 tests; all passed.
- `pnpm --filter api test:coverage`, `pnpm coverage:ratchet` (statements 84.94% vs floor 55.64%, branches 70.48% vs 48.73%, functions 75.86% vs 54.64%, lines 85.26% vs 56.00%) and `pnpm coverage:diff` (20/20 changed lines, 100%, floor 80%): passed.
- `pnpm openapi:generate` then `pnpm openapi:check` and `pnpm docs:validate`: passed.
- API e2e on a throwaway database `tamiym_workshop_test_ttw100` (REDIS_DB=13, dropped afterwards): `design-content-validation` (9 tests: valid save, empty design, external image, foreign and unknown asset with identical body, PENDING asset, unknown type and field, update accepted, update refused with content kept, update with foreign asset), `shared-design-private-images`, `moderation-appeals`, `campaign-authoring`, `view-surcharge-precedence`, `private-customer-uploads`: 6 suites, 41 tests passed.
- `pnpm build` (5 tasks, passed), then Playwright `design-workshop.layers.spec.ts` and `design-workshop.reopen.spec.ts` with the setup project, on the same seeded throwaway database: 13 passed. The layers journey asserts that the real editor's `POST /v1/designs` answers 201.
- Not run: `pnpm audit:prod`, `pnpm verify` as a whole, the whole Playwright suite, a journey that uploads an image in the editor (no MinIO on this machine), CI.

## Remaining

- Independent implementation review (high risk: security and integration), fix and repeat until PASS.
- Show the new error codes in the editor: today the save panel shows the message of the API. Mapping each code to its own wording is a UI ticket (not created).
- Set `API_PUBLIC_URL` in the production secrets before deploying (the API will not start without it).
- `DESIGN_SHARE_PUBLIC_ORIGIN` is also required in production but missing from `infra/runtime/secrets/.env.example` (seen, not changed here).
- `thumbnailUrl` is still accepted as any string and only fetched by moderation when it is on our storage: out of scope here.

## Completion summary

The server now refuses a saved design that is not made of the editor's text and image layers, with an allowlist of objects and fields. Every image must be one of the design owner's READY uploads, served from `API_PUBLIC_URL`; external images and other users' assets are refused with stable codes, before moderation and before any write. The editor's designs still save (Playwright journeys, e2e). Local commit only: nothing pushed, CI not run. See Remaining before closing the ticket.
