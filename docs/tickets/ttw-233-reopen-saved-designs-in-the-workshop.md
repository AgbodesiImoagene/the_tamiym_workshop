# TTW-233 — Reopen a saved design in the workshop without a 404

**Epic:** 8 — Client review delivery  
**Status:** Complete (local commit, not pushed)  
**Risk:** Standard  
**Blocked by:** None  
**Blocks:** None

## Background

Found while working on TTW-102 and confirmed on `main` with an empty design, so it does not come from TTW-102.

`/dashboard/design/<id>/edit` answers 404 on a direct load, on a reload, and right after the first save (`WorkshopEditor` calls `router.replace('/dashboard/design/<id>/edit')` after `createDesign`). A saved design can never be reopened.

Cause: `apps/app/app/dashboard/design/[designId]/edit/page.tsx` is an async Server Component. It calls `getDesign()` and `getProductWorkshop()` from `apps/app/lib/designs.ts`, which use the browser `apiClient`. That client authenticates with the customer cookie (`credentials: 'include'`, `apps/app/lib/api.ts`). On the server there is no customer cookie, so `GET /v1/designs/<id>` answers 401, the `catch` calls `notFound()`, and the customer sees a 404. Nothing in `apps/app` uses `next/headers`; the other dashboard pages (for example `apps/app/app/dashboard/orders/[id]/page.tsx`) are client components that fetch in the browser.

Other server-side fetches checked:

- `apps/app/app/dashboard/design/new/[productId]/page.tsx` calls only `getProductWorkshop`, a public endpoint (no cookie needed). It works.
- `apps/app/app/design/shared/[shareToken]/page.tsx` calls `getSharedDesign` (public, token in the URL) and `getProductWorkshop` (public). It works.

So the edit page is the only page whose server-side call needs the customer session.

## Proposal

Make the edit route load its data in the browser, like the other dashboard pages.

- `page.tsx` stays a thin Server Component that only reads `params` and renders a new client component `EditDesignLoader` with the design id. It fetches nothing.
- `EditDesignLoader` (`apps/app/components/workshop/EditDesignLoader.tsx`) loads the design with `getDesign`, then the product workshop with `getProductWorkshop`, through TanStack Query (already provided in `apps/app/app/providers.tsx`), and renders `WorkshopEditor` with both.
- Explicit states: loading (`role="status"`), unauthorized (401 → `router.replace('/auth/login')`), not found (404 → message and a link back to `/dashboard/design`), error (any other failure → `role="alert"` message and a "Try again" button that refetches).
- The queries use `retry: false` and `gcTime: 0` / `staleTime: 0`. `WorkshopEditor` only reads `existingDesign` when it mounts, so a cached older copy must never be shown as the design to edit.
- Rejected: forwarding the session cookies from the server (`next/headers` + a server fetch helper). It adds a second transport next to `apiClient`, makes the server forward the customer's credentials, and the cross-origin cookie (API and app live on different origins in the deployed topology, see the CSRF note in `lib/api.ts`) may not be sent to the app's own server at all, so it can fail in production while passing locally. It also has no precedent in this app.

## Invariants

- No API, DTO, Swagger or schema change. A customer can only read their own designs (the API answers 403 for another customer's design and 404 for a missing one; the page shows the same not-found state for both).
- Nothing about the customer session is exposed to the server or to logs.
- `WorkshopEditor` behaviour is unchanged; it is only given the same two props the server page used to give it.
- The new-design route and the public shared page are unchanged.

## Implementation plan

1. Tests first, shown failing: component test of the loader states; Playwright spec of the journey.
2. Add `EditDesignLoader` and make `edit/page.tsx` render it.
3. Register the spec in the Playwright manifest (new entry, `APP-WORKSHOP` stays blocked by TTW-055).
4. Run the gates, record evidence, independent review, play the journey in a browser.

## Test and observability plan

- Unit/component (`apps/app/__tests__/workshop/EditDesignLoader.test.tsx`): loading state; editor rendered with the design and the workshop context once loaded; 404 → not found with a link back; 401 → redirect to login; other failure → error with a retry that loads the design on success; failure of the workshop request (design loaded) → same error state.
- Integration/e2e (`tests/e2e/app/design-workshop.reopen.spec.ts`): a freshly registered customer creates a design from `/dashboard/design/new/e2e-product-classic-tee`, adds a text layer, saves, lands on `/edit` without a 404, reloads, and still sees the design name and the layer. Role and label locators, no sleeps, no mocking of first-party APIs.
- Failure, retry, and concurrency: unauthorized, not found, server error and retry covered by the component test.
- Logs, metrics, traces, and alerts: nothing new; no cookie, token or design content in logs.

## References

- `apps/app/app/dashboard/design/[designId]/edit/page.tsx` — the server page that returned 404.
- `apps/app/lib/designs.ts` — `getDesign`, `getProductWorkshop`.
- `apps/app/lib/api.ts` — cookie-based `apiClient`.
- `apps/app/components/workshop/WorkshopEditor.tsx` — `router.replace` after the first save.
- `apps/app/app/dashboard/orders/[id]/page.tsx` — the client-fetch pattern followed here.
- TTW-102 (branch `codex/ttw-102-add-delete-undo-and-layers-to-the-worksh`, not merged when this ticket was written): its spec `tests/e2e/app/design-workshop.layers.spec.ts` ends at the save with a comment about this defect. Once both branches are merged, its reload step can be added back. This ticket does not depend on it.

## Acceptance criteria

- [x] `/dashboard/design/<id>/edit` opens the saved design on a direct load and on a reload.
- [x] After the first save the customer stays in the editor on the `/edit` route, without a 404.
- [x] Loading, not found, unauthorized (redirect to login) and error-with-retry states exist and are tested.
- [x] The Playwright spec passes and is registered in the manifest; `APP-WORKSHOP` stays blocked.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- Unblocking `APP-WORKSHOP` (TTW-055).
- The design thumbnail upload and its behaviour after the route change.
- Layer deletion, undo and the layer list → TTW-102.

## Design review

Reviewer: Claude (author), 2026-11-20, before implementation. Standard risk: the change touches how a page reads the customer session but changes no auth rule, no API and no data.

- Risk: Standard. No schema, API, upload, queue or privilege change; the access rule (own designs only) stays enforced by the API. The change moves an existing authenticated read from a place where it cannot work (server) to the place where every other dashboard read already happens (browser).
- Blast radius: `edit/page.tsx` and one new component. `WorkshopEditor`, `lib/designs.ts`, the new-design page and the shared page are untouched.
- Duplication check: the loading / error / 401 pattern follows `orders/[id]/page.tsx` (TanStack Query, redirect to `/auth/login` on 401). No new transport.
- Options: (a) browser load (chosen) vs (b) forward cookies from the server (rejected, see Proposal: second transport, credentials forwarded by the server, cross-origin cookie not guaranteed to reach the app server in production, no precedent). `.cursor/rules/frontend.mdc` asks for explicit loading, empty, error, unauthorized and retry states: (a) provides them.
- Edge cases: stale cache (editor reads `existingDesign` only at mount, so `gcTime: 0`); 401 vs 404 vs other errors; the workshop request failing after the design loaded (same retry state); `designId` changing (query key includes it); the first save's `router.replace` now lands on a page that loads the design it just created.
- Risks: a brief loading state on every open (acceptable); the first save remounts the editor, so the in-flight thumbnail capture may find no canvas (existing behaviour, out of scope, noted).
- Test plan: as in the Test and observability plan.
- Verdict: PASS, proceed with (a).

## Implementation reviews

Review 1 — independent read-only subagent, 2026-11-20, Standard charter. Verdicts: correctness PASS, security PASS, frontend rules PASS, test quality PASS with reservations, ticket accuracy FAIL until fixed. Findings and handling:

- Ticket did not record the e2e deviation, evidence sections were empty → fixed (this file).
- The e2e spec only proves the layer through the API response, not on screen → recorded as a known limit (canvas has no DOM; layer list is TTW-102).
- Missing tests: `replace` called once on 401; retry of a failed workshop request; another customer's design → added (unit and e2e). The e2e one found a real gap: the API answers 403, not 404, for another customer's design, so the loader now shows the same "Design not found" screen for 403 and 404 (unit test "403" added; Invariants corrected).
- Minor, not changed: the 401 redirect does not remember the destination (same as `orders/[id]/page.tsx`); a 404 on the product workshop request shows the generic error with a retry; a non-UUID id probably gets a 400 and the generic error; no explicit focus styles on the link and button; a blank frame while redirecting on 401.

Overall verdict after fixes: PASS (the review was not repeated in full; the changes after it are the three tests and the 403 branch, covered by the tests below).

## Verification evidence

- Test first: `EditDesignLoader.test.tsx` failed with "Cannot find module '@/components/workshop/EditDesignLoader'" before the component existed; Playwright "first save…" failed (`getByLabel('Design name')` not found after landing on `/edit`, a 404 page) and "unknown design" failed (`Design not found` heading absent) on the unfixed build. The "layer" and "another customer" tests were written after the first run and were not run on the unfixed build (same route, same cause).
- `pnpm --filter app test`: 19 suites, 177 tests passed.
- `pnpm --filter app typecheck`: no error. `pnpm --filter app lint`: no error (`eslint .`).
- `pnpm format:check`, `pnpm docs:validate`, `pnpm playwright:validate`: passed.
- `pnpm build`: passed.
- Playwright on a throwaway database `tamiym_workshop_test_ttw233` (REDIS_DB 13, dropped afterwards), `--project=chromium-app`: the four new tests pass. Full app project, first run: 78 passed, 3 skipped. Second run on the same database: 78 passed, 3 skipped, 1 failed — `email-verification-banner … refused at checkout until the email is verified`, which uses one seeded single-use unverified customer per attempt, consumed by the first run (environment limit of re-running on one seed, unrelated to this change).
- The design thumbnail upload (no MinIO on this Mac) did not show up: the specs use a plain Playwright context without the console-error guard, and the editor remounts right after the first save.

## Completion summary

Shipped: `/dashboard/design/<id>/edit` loads the design in the browser (`EditDesignLoader`), with loading, not found (404 and 403), login redirect (401) and error-with-retry states. The page is now a thin Server Component. No API, contract, migration or Swagger change. New Playwright entry `APP-WORKSHOP-REOPEN`; `APP-WORKSHOP` is still blocked by TTW-055. The roadmap was not touched.

Deviations: (1) the spec does not add the layer through the UI, because on this code "Add to canvas" does nothing: `canvasRef` in `WorkshopEditor.tsx` is declared and read but never assigned, so `handleAddText` and `handleAddImage` return early. TTW-102 removes that reference. This is a second pre-existing defect, not fixed here. (2) The layer is checked in the design the browser receives, not on screen.

Not verified: no manual run in the in-app browser (the Playwright journeys drive a real Chromium); no run in Firefox/WebKit; thumbnail upload; the 401 path in a browser (unit-tested only).

Follow-ups: dead text/image tools on `main` (covered by TTW-102); once TTW-102 is merged, add the reload step back to `design-workshop.layers.spec.ts`; optional: remember the destination on the 401 redirect.
