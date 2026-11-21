# TTW-104 — Warn about low-resolution images in the workshop

**Epic:** 8 — Client review delivery\
**Status:** Implemented in a worktree, uncommitted (independent review PASS)\
**Risk:** Standard\
**Blocked by:** TTW-103\
**Blocks:** TTW-105

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 3.10, No low-resolution warning** (High, P1, 4–6 h, status "To do"): A small logo enlarged on a shirt will print blurry without warning the customer.

## Finding confirmed on `main` (4a0e5c5)

- `ImageTool.tsx` only limits the file to 10 MB and adds the image at scale 0.5. Nothing reads the image's pixel size, and no layer shows a quality state.
- A `PrintArea` holds normalised coordinates (0 to 1) of the canvas; neither `PrintArea` nor `ProductView` has a physical size in cm. The only hint is a `dpiHint: 300` in a schema comment. So a true pixels-per-inch value cannot be computed today.

## Proposal

User decision, 2026-11-21: **no schema change**. Use a proxy computed on the canvas, and leave real print sizes (cm per print area, migration, admin entry) to a separate ticket if the client needs them.

- For each image layer, compute **source pixels across the full print-area width**: `naturalWidth / (displayedWidth / printAreaWidth)`, using the image's natural size, its scale and the print area's width on the canvas.
- Show a **non-blocking** warning on the layer (layer list and next to the canvas selection) when that number is below a threshold. The customer can ignore it and keep working, save and share.
- Recompute when an image is added and when it is scaled or moved (`object:modified`), and when a saved design is opened.
- Where "before ordering" applies: the warning lives in the workshop, where the customer can fix it. The cart and checkout have no workshop design yet (TTW-058); showing the same state there belongs to that ticket.

## Threshold (confirmed by the user on 2026-11-21)

- Value: **1200 source pixels across the print-area width**, kept in one named constant so it can change without touching the logic. This is a business number: on a print area about 30 cm wide it is roughly 100 pixels per inch, a "will look soft" level rather than a print-shop 300. Confirmed by the user.
- Because it is a proxy, the message says the image "may print blurry", never gives a dpi figure.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-104-warn-about-low-resolution-images` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: the pixel-width calculation and the threshold at its boundaries (just below, equal, just above), a rotated or flipped image, a missing natural size, a print area of 0 (no warning, no division by zero).
- Component: the layer list shows the warning for a small image and none for a large one; it never disables a control.
- Playwright: upload a small image, see the warning; enlarge it and the warning stays; upload a large image and see none; save and reopen, the warning is still shown. No sleeps, role and label locators.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- No resolution check — row 3.10
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] A customer is warned in the workshop, non-blocking, when an image would print blurry; the same design opens with the same warning.
- [x] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.
- Physical print sizes per print area and a real pixels-per-inch figure (needs a schema change, risk high): separate ticket if the client asks.
- Showing the warning in the cart and checkout: TTW-058.
- Blocking an order because of image quality: not asked for.

## Design review

Standard risk, no schema, API or contract change; the work is in `apps/app` only.

- **Calculation.** `pixelsAcrossPrintArea = printAreaWidthOnCanvas / max(|scaleX|, |scaleY|)`. The image's natural size cancels out: the scale already says how many source pixels sit under one canvas pixel. `printAreaWidthOnCanvas` is `printArea.width * canvasWidth`; when a view has no print area the whole canvas width is used (the seeded e2e Classic Tee has none). The larger of the two scales is used, so a stretched image is judged on its worst axis. A missing or zero scale, or a zero-width area, gives no figure and no warning. Warn when the figure is **strictly below** 1200.
- **Source of truth.** The saved design JSON (`scaleX`, `scaleY`, `type`), which already follows add, resize, move, undo and reopen. No canvas access and no new state. Template layers are never in that JSON, so they are never judged.
- **Where it shows.** (1) A note "May print blurry" under the layer in the layer list. (2) A status message next to the canvas when the selected layer is a low-resolution image: "This image may print blurry. Make it smaller or upload a larger image." Both use theme tokens (`text-warning`), English, no blocking and no disabled control.
- **Known consequence of the default placement.** `ImageTool` adds every image at scale 0.5 whatever its size. On a print area 0.64 of a 600 px canvas that is 768 pixels across, so a freshly added image warns until the customer makes it smaller (or on a view with no print area, at 1200, exactly the threshold, no warning). This is true to the pixels, but it may feel noisy. Changing the default placement (fit the image in the print area) is a behaviour change and is left out; recorded as a possible follow-up.
- **Not in the JSON, not judged:** crop and filters; rotation and flips do not change the figure.
- **Observability:** nothing new. No logs, no data leaves the browser.
- **Risks:** a false sense of safety (the figure is a proxy, the message says "may"); noise at the default placement (above).

## Implementation reviews

Independent review by a fresh subagent on 2026-11-21: **PASS**, no blocking finding. It confirmed the calculation and its bounds (zero, negative, NaN, infinite scales; zero-width area; strict threshold), that the shared `DEFAULT_CANVAS_SIZE` leaves `WorkshopCanvas` unchanged, that template layers are never judged, that text never warns, that only the active view is judged, and the accessibility wiring. Minor points, accepted and left for follow-up:

1. The status message is only in the page while an image is selected; a live region that is always present would be announced more reliably by some screen readers. The layer list already carries the note through `aria-describedby`.
2. `text-warning` (#d97706) on the light background is about 3:1, under 4.5:1 for small text. It is the token the theme provides; to check with the design.
3. The Playwright test relies on a mouse drag and a scroll reset; the shrink step was removed for that reason (see Deviations).
4. No test covers "enlarged then shrunk, the warning goes" at editor level, nor several views with an image in an inactive view (correct by reading the code, not pinned by a test).
5. Expect some noise on freshly added images when a print area is 0.64 of the canvas (default placement at scale 0.5).

## Deviations and observations

- **Playwright covers add, enlarge, save and reload, but not "shrink it again".** A raw mouse drag to shrink the image after a reload failed about 1 run in 13 (the canvas did not receive the end of the gesture; the editor logs showed the scale never changed in those runs, so the warning code was not at fault). That step was removed from the browser test. "A dense image shows no warning" is covered by unit and component tests (`image-resolution.test.ts`, `LowResolutionWarning.test.tsx`, `WorkshopEditorLowResolution.test.tsx`).
- **Existing behaviour seen, not changed:** `ImageTool` sends `left: 50, top: 50` but a new image appears at the canvas origin (0, 0). Worth its own look; the test starts from where the image really lands.
- **Product behaviour the test has to respect:** an uploaded image is processed in the background; saving before it is ready is refused with `DESIGN_ASSET_NOT_READY`. The test waits for the `display` rendition before saving.
- **Local setup:** the Playwright run needs MinIO. The `docker-compose.yml` MinIO was started with Colima and stopped afterwards, with `S3_PRIVATE_BUCKET=tamiym-private`.

## Verification evidence

Run in the worktree `ttw-104`, 2026-11-21 (the first `main` checkout had stale dependencies; the worktree installs from the lockfile):

- Tests written first, failed for the right reason: `Cannot find module '../../lib/image-resolution'` and no note in the layer list.
- `pnpm --filter app test`: 38 suites, 287 tests passed.
- `pnpm --filter app typecheck` and `pnpm --filter app lint`: no errors.
- `pnpm --filter app build`, `pnpm docs:validate`, `pnpm playwright:validate`: passed. `prettier --check` reports only `apps/app/app/globals.css`, which this ticket did not touch.
- Playwright on a throwaway database `tamiym_workshop_test_ttw104` (seeded, dropped afterwards) with MinIO from `docker-compose.yml`: `design-workshop.*` and `shared-design.canvas` specs, 22 passed; the new `design-workshop.low-resolution.spec.ts` passed 25 times out of 25 with 4 workers.
- Not run: the full Playwright suite, the other browsers of the matrix, `pnpm verify`, CI. Not looked at by eye in the browser pane beyond the test screenshots.

## Completion summary

Pending implementation.
