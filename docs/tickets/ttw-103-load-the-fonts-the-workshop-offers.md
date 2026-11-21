# TTW-103 — Load the fonts the Design Workshop offers

**Epic:** 8 — Client review delivery\
**Status:** Implemented on a local branch (not pushed, not merged)\
**Risk:** Standard\
**Blocked by:** TTW-102\
**Blocks:** TTW-104

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 3.11, Fonts offered but never loaded** (High, P1, 4–6 h, status "To do"): Montserrat, Oswald, Playfair and Roboto render with a fallback font. What is printed may differ from what the customer saw.

## Proposal

- Load every offered font before rendering, and redraw when it arrives.
- Remove fonts that depend on the visitor's machine, or give them a bundled equivalent.
- Make sure previews and print files use the same fonts.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-103-load-the-fonts-the-workshop-offers` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Component: font list only contains loaded fonts.
- Playwright: text in Montserrat renders with that font.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/app/components/workshop/TextTool.tsx:17` — row 3.11
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] Each font in the list renders as itself on a machine without it installed.
- [x] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Standard risk, no client decision blocks this ticket (TTW-102 is complete; no entry in the roadmap's open client decisions).

- **Finding confirmed on `main` (dc94bcf):** `TextTool.tsx` offered 10 families; none was loaded (no `next/font`, `@font-face` or fontsource in `apps/app`). Montserrat, Oswald, Playfair Display and Roboto fell back; Arial, Georgia, Helvetica, Impact, Times New Roman and Trebuchet MS depended on the visitor's machine.
- **Decision (needs the user's eye, it changes what customers see):** offer only the four fonts the client named, shipped with `@fontsource/*` (latin and latin-ext subsets, weights 400/700, italic where the family has one; Oswald has no italic and is slanted by the browser). The six machine fonts are removed from the list. Default font becomes Roboto. No CDN at run time, so the browser, the thumbnail and the customer's machine agree.
- **Loading:** fonts download on first use. After a text is added, loaded from a saved design, or restored by undo/redo, the canvas calls `document.fonts.load`, clears Fabric's per-family measurement cache, re-measures the text and redraws. The thumbnail waits for `document.fonts.ready`.
- **Saved designs with a removed font** (e.g. `Arial`): unchanged. They keep their value and render with the browser's font, as before. No migration and no API change (the server still validates `fontFamily` as a string, TTW-100).
- **Out of scope, recorded:** print files do not exist yet (TTW-101); they must use the same four families when built. Not fixed here: the app-wide UI fonts `Mundial` and `Neuffila Grotesk` in the theme are not loaded either (not a Workshop font; to raise as its own ticket).
- **Risks:** text width changes once the real font arrives (selection box and alignment are re-measured); extra font bytes (28 small CSS files, font bytes fetched only when a text uses a face).

## Implementation reviews

Review by the `code-review` skill (high effort, in-session, not an independent human or fresh-session reviewer) on 2026-11-21. Seven findings:

- **Fixed:** only the `latin` subset was shipped, so Yoruba letters (ẹ, ọ, ṣ) would fall back. The `latin-ext` subsets are now imported too. The font load now uses the layer's real text as its sample, so the browser picks the right subset (unit test added).
- **Fixed afterwards (user asked for these in this ticket):**
  1. The thumbnail now waits for the canvas's own `fontsReady()` (all font loads and re-measures finished), then `document.fonts.ready`.
  2. After a font arrives the text is re-measured and the new size is reported to the editor, so the saved `width` and `height` are the real ones. It is not an undo step, and nothing is reported when the size did not change.
  3. New unit tests (`WorkshopFontsRedraw.test.tsx`) cover add text, undo, the cleared font cache, the reported size, no undo step, no report when unchanged, and `fontsReady`. The Playwright test now covers all four fonts, compares each saved width with the width measured in the real font against the default font, and reopens the design.
- **Not fixed, left for follow-up (none blocks the acceptance criteria):**
  1. Font arrival is handled at three call sites; a single `document.fonts` `loadingdone` listener would be more robust.
  2. The Playwright test compares text widths, not canvas pixels (pixel snapshots are fragile across machines).
  3. Designs saved with a removed font (Arial, Impact, …) keep it and render with the browser's font (no mapping).
  4. TTW-101 (print files) should still recompute text sizes with the real font rather than trust stored ones.

Independent review by a fresh subagent on 2026-11-21: **PASS**, no blocking finding. It confirmed `fabric.cache.clearFontCache`, the three redraw call sites, the read-only and shared canvas, and the unit tests and typecheck.

Second independent review (fresh subagent, same day) of the follow-up version: **PASS**, no blocking finding, no loop or leak in `fontsReady` / `redrawAfterFonts`. Its points:

- **Fixed:** a font request that never answers could block the thumbnail and so the save. The thumbnail now waits at most 3 s (`FONTS_WAIT_MS`). The undo-history test now proves the absence of a step (one undo leaves `canUndo: false`). A test now covers a text saved with the design (`loadUserLayers` path).
- **Recorded, accepted:** opening a design saved before this ticket (text widths measured with the fallback font) now sends one automatic save about 3 s later, without a thumbnail, because the corrected size is reported. This is what corrects the stored widths. A font arriving during the very first save leaves the fallback width in that save until the next edit. The shared read-only view is not affected (it reports nothing).
- **Recorded, not fixed:** the Fabric fake in the unit test uses a global flag and proves orchestration, not real measuring (Playwright does that); the e2e opens the font list, whose options use their own font, so a face may already be downloading before the text exists and the test cannot prove the redraw by itself (it proves the saved width is the real one; a `page.route` delay on the font files would prove the redraw); the "closer to the real font than to `serif`" comparison depends on the browser's default font; the autosave may land after Playwright's default 5 s on a slow machine.

## Verification evidence

Run in the worktree `ttw-103`, 2026-11-21:

- Tests written first: `pnpm --filter app exec jest __tests__/lib/workshop-fonts.test.ts __tests__/workshop/WorkshopFonts.test.tsx` failed with `Cannot find module '../../lib/workshop-fonts'` before the implementation.
- `pnpm --filter app test`: 35 suites, 269 tests passed (final version, after the second review).
- `pnpm --filter app typecheck` and `pnpm --filter app lint`: no errors.
- `pnpm exec prettier --check` on touched code, tests and `docs/playwright`: clean. `apps/app/app/globals.css` is reported by `prettier --check apps/app` but was not touched here.
- `pnpm playwright:validate` and `pnpm docs:validate`: passed.
- `pnpm build`: 5 of 5 tasks succeeded.
- Playwright, on a throwaway database `tamiym_workshop_test_ttw103` (seeded with `seed:e2e`, dropped afterwards), project `chromium-app`: `design-workshop.*` and `shared-design.canvas` specs, 21 passed (final version), including the extended `design-workshop.fonts.spec.ts`. One earlier run of that spec failed because the editor had already saved by itself before the test waited for the save; the spec now records every save request.
- Not run: the full Playwright suite, the other browsers of the matrix, and `pnpm verify` (coverage ratchet, audit). The change is in `apps/app` only; the web and admin apps were not touched.
- Not checked by eye: a visual comparison of the canvas in the browser pane.

## Completion summary

The text tool offers Montserrat, Oswald, Playfair Display and Roboto, all shipped with the app (latin and latin-ext). The canvas waits for a font and draws the text again. Six machine-dependent fonts are removed from the list. Remaining items are listed under Implementation reviews. Not merged, not pushed.
