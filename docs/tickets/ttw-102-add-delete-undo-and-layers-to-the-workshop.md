# TTW-102 — Add delete, undo and a layer list to the Design Workshop

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** TTW-103

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 3.3, Added elements cannot be deleted** (High, P1, 10–16 h, status "To do"): No delete button, no undo, no layer list.

## Proposal

- Add delete, undo and redo, and a layer list with reorder, following Figma where it applies.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-102-add-delete-undo-and-layers-to-the-worksh` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Component: delete, undo and redo, layer order.
- Playwright: add an element, delete it, undo, save, reload.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/app/components/workshop/` — row 3.3
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer can remove any element they added, and undo the last change.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Recorded 2026-11-20, before implementation, against `main` at 85f9c27.

**Finding confirmed, and it moved.** Row 3.3 is accurate: `apps/app/components/workshop/` has no delete, undo, redo, layer list, reorder or keyboard handling. One more defect sits underneath it: `WorkshopEditor.tsx` declares `canvasRef` but never gives it to `WorkshopCanvas`, so `canvasRef.current` is always `null`. `handleAddText`, `handleAddImage` and the thumbnail capture return early. There is nothing to delete until adding works, so wiring the canvas is part of this ticket. A test reproduces it first.

**Design.**

- `WorkshopCanvas` receives a `controlRef` prop and fills it with a `WorkshopCanvasControls` object: `addText`, `addImage`, `deleteSelected`, `deleteLayer`, `selectLayer`, `moveLayer`, `undo`, `redo`, `toDataURL`. The editor stops holding a canvas itself and no longer imports Fabric. A plain prop is used instead of `ref` so that it does not depend on how `next/dynamic` forwards refs.
- Every user object gets a stable `data.layerId` when added. `data` is already serialised (`toJSON(['designAssetId','data'])`), so the id survives save and reload. Objects saved before this ticket have no id: they receive one when the view is loaded.
- Undo and redo use one history per view, held in a new `layer-history.ts` (a bounded stack of JSON snapshots of the user objects only, same filter as `emitChange`). It is reset when the view changes, because the canvas is rebuilt on each tab switch. Restoring removes and re-adds the user objects only, so template layers are never touched (`loadFromJSON` would wipe them). A restore still goes through `emitChange`, so autosave and the layer count stay correct, and it does not create a new history entry.
- Delete acts on the selected user object, from a button, from the layer list, and from the Delete and Backspace keys. The keys are ignored while a text field, the Fabric text editor or a select has focus. Template layers cannot be deleted or moved.
- The layer list (`LayerList.tsx`, right sidebar) shows user layers from the top of the stack down. It selects, deletes and moves a layer up or down with buttons. No drag and drop. The selection is kept in sync with the canvas through `onSelectionChange`. An empty state explains how to add a layer.
- No API, schema, migration or OpenAPI change. The stored `designData` shape does not change (TTW-100 relies on it). Logs: nothing new.

**Risks and answers.**

| Risk                                                 | Answer                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Autosave regressions (`lastJsonRef` de-duplication)  | The existing `WorkshopEditor.test.tsx` stays unchanged and green.                                        |
| Undo wiping template layers                          | Dedicated test: template objects survive delete, undo and redo.                                          |
| Delete key typed in a text field removes a layer     | Test of the key handler for inputs and for Fabric text editing.                                          |
| TTW-105 will re-lay out the sidebar                  | Controls stay in the existing sidebar and toolbar, with no redesign.                                     |
| TTW-099 may change `originalUrl` for uploaded images | No file overlap. The canvas keeps loading images from the `src` it is given. To re-check when 099 lands. |

**Playwright decision.** `APP-WORKSHOP` in `docs/playwright/prd-test-manifest.json` is blocked by TTW-055, which is deferred after v1. Proposal: add a separate manifest entry for this ticket instead of unblocking that one. The user confirms or changes this when reviewing.

## Deviations from the design

- **`loadFromJSON` replaced.** The canvas now loads the saved layers with `util.enlivenObjects` and adds them, because `loadFromJSON` clears the whole canvas, template layers included. The saved canvas-level `clipPath` is no longer re-applied on load: the print-area clip always wins.
- **`toObject(props)` instead of `toJSON(props)`.** Found by playing the journey in a real browser: in Fabric 7 `toJSON()` ignores the property list, so `data` was never saved (on `main` as well). The layer list stayed empty until this was fixed. The stored shape therefore gains `data.layerId` and `data.designAssetId` on each layer. The API reads only `type`, `text` and `objects`, so nothing else changes. `fabric-serialisation.test.ts` pins this against the real Fabric.
- **Object types.** Fabric 7 writes `IText` and `Image`, not `i-text`. The layer list reads the type case-insensitively.
- **Stable `activeEffects`.** The editor passed a new array on every render, which made the canvas clear and reload all template layers on each render. Selection and history updates now re-render the editor often, so the array is memoised.
- **Callbacks through refs.** The Fabric listeners live as long as the canvas, so they read the latest callbacks from refs instead of the first render's closures.

## Pre-existing defect found while working on this ticket (fixed by TTW-233)

`/dashboard/design/<id>/edit` answers **404** on a direct load and right after the first save (the editor calls `router.replace` to it). `apps/app/app/dashboard/design/[designId]/edit/page.tsx` is a Server Component that calls `getDesign` through the browser `apiClient`, which has no customer cookie on the server, so the call fails and the page calls `notFound()`. Confirmed with an empty design, so it does not depend on this ticket. Consequences: a saved design cannot be reopened, and the "save, reload" step of this ticket's Playwright plan cannot pass. The new spec stops at the save and checks the payload sent to the API instead. Proposal: a separate ticket that loads the design on the client, like the other dashboard pages. Out of scope here (`Out of scope` rules out other defects). **Update 2026-11-20:** fixed by TTW-233 (`docs/tickets/ttw-233-reopen-saved-designs-in-the-workshop.md`, merged on `main` before this ticket). The reload step is back in this ticket's Playwright spec.

## Implementation reviews

One independent review (general-purpose reviewer, read-only, charter: Fabric 7 correctness, template-layer safety, async races, regressions, a11y, test quality), run on the working tree before the commit. Verified against the Fabric 7.4.0 sources.

| #   | Finding                                                                                            | Result                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Undo/redo race: history moved before the async restore ran                                         | Fixed: the history moves inside the queued step; add, delete and move do nothing while a restore is pending. Test: "ignores changes while an undo is still being applied".       |
| 2   | `enlivenObjects` drops an image that fails to load, so undo could silently lose a layer            | Fixed: a restore that returns fewer objects than the snapshot is refused and the history goes back. Test: "refuses an undo when a layer cannot be loaded back".                  |
| 3   | New `activeEffects` array on every render reloads the template layers                              | Fixed with `useMemo`. Test: "hands the canvas the same effects array on every render".                                                                                           |
| 4   | A drag-selection of several layers could not be deleted from the UI                                | Fixed: the selection reports its first customer layer, `deleteSelected` removes all. Test added.                                                                                 |
| 5   | `toPlain(canvas)` serialises the template images on every event                                    | Not changed. Small cost; the envelope is kept as on `main`.                                                                                                                      |
| 6   | Tools do nothing until the canvas is ready (no feedback)                                           | Fixed after the merge: see 'Follow-up after the merge'.                                                                                                                          |
| 7   | No guard after `enlivenObjects` in the first load                                                  | Fixed (`fabricRef.current !== canvas`).                                                                                                                                          |
| 8   | A11y: unnamed list; focus lost when "up" disables itself; same text gives the same accessible name | List named "Layers" and the e2e uses it. Focus handling and duplicate names not changed.                                                                                         |
| 9   | Fake Fabric hides real behaviour                                                                   | Added `fabric-serialisation.test.ts` on the real Fabric. The fake now models `toObject`/`toJSON` like v7. No jsdom test drives the real `Canvas`: the browser journey covers it. |

Review round 2 (re-checking these fixes) has not been run.

## Verification evidence

Run in the worktree on Node 24.22.1, 2026-11-20.

- `pnpm --filter app test`: 23 suites, 206 tests passed. Workshop folder: 9 suites, 48 tests. Before the implementation the 4 new suites failed for the expected reasons (modules missing, `controlRef` never filled, the editor never passing the canvas).
- `pnpm --filter app typecheck`: no error. `pnpm --filter app lint`: no error. `pnpm format:check`: all files formatted.
- `pnpm docs:validate` and `pnpm playwright:validate`: passed (new manifest entry `APP-WORKSHOP-LAYERS`).
- `pnpm build` (all apps): exit 0. `pnpm --filter app build` re-run after the review fixes: exit 0.
- Playwright, `tests/e2e/app/design-workshop.layers.spec.ts` (`--project=setup --project=chromium-app`) against a throwaway database `tamiym_workshop_test_ttw102` (migrated, `seed:e2e`, `REDIS_DB=14`): 9 passed, including the journey: add two texts, delete with the button, undo, redo, undo, delete with the Delete key, undo with Ctrl/Cmd+Z, move up, delete from the list, save and check the payload (1 layer).
- Not run: `pnpm verify` (coverage ratchet, audit), the API test suites (no API change), web and admin typecheck, Firefox/WebKit matrix.
- Not verified: reload of a saved design (blocked by the pre-existing 404 above); the thumbnail upload, which now actually runs because the canvas is reachable. The local machine has no MinIO, so that upload answers 500 there; CI has MinIO. First CI run after the push will show it; the app already treats a thumbnail failure as non-fatal. Dragging a rubber-band selection and image layers were checked by the reviewer against the Fabric sources and by unit tests, not played in a browser.

## Follow-up after the merge

Recorded 2026-11-20, on branch `codex/ttw-102-reload-after-save` cut from `main` at `e3c401c`.

- **Reload step restored.** `tests/e2e/app/design-workshop.layers.spec.ts` now continues after the save: the edit route shows the one remaining layer, a reload keeps the design name and that layer, a reopened design starts with no undo step, and deleting then undoing works on it.
- **Defect found by that step, fixed (review finding 6).** On a reopened design the layer list appears at once, but the canvas finishes loading its layers a moment later. A click on "Delete", "Undo" or a layer button during that moment did nothing and said nothing. `WorkshopCanvas` now reports `onReadyChange(true)` once its controls exist and `onReadyChange(false)` when they are gone. The editor keeps Undo, Redo and Delete disabled, and `LayerList` disables all its buttons (new `disabled` prop), until then. Tests written first and shown failing: "tells the editor when the controls are ready, and when they are gone", "keeps the toolbar and the layer list disabled until the canvas is ready", "disables every action while the canvas is not ready".
- **Evidence.** `pnpm --filter app test`: 24 suites, 216 tests passed (workshop folder: 58). `pnpm --filter app typecheck` and `lint`: no error. `pnpm --filter app build`: exit 0. Playwright (`--project=setup --project=chromium-app`, throwaway database `tamiym_workshop_test_ttw102`, `REDIS_DB=14`) with `design-workshop.layers.spec.ts` and `design-workshop.reopen.spec.ts`: the 4 reopen tests passed; every step of the layers test passed, including the reload and the edit after it. The layers test still ends red on this machine in the fixture's "no console error" check, because the thumbnail upload (`POST /v1/designs/<id>/thumbnail`) answers 500 when no MinIO answers on `localhost:9000`. This Mac has none, and CI does. Not confirmed on CI yet.

## Completion summary

The customer can now delete what they added (button, Delete key, layer list), undo and redo (buttons, Ctrl/Cmd+Z), and reorder layers from a layer list, in English and with theme tokens. Template layers are never touched. Adding text and images also works for the first time: the editor never held the canvas before. Merged on `main` with TTW-233 (CI green on `e3c401c`). A follow-up (reload step, canvas-ready state) is committed on `codex/ttw-102-reload-after-save` and not pushed. `ROADMAP.md` is not ticked yet, on purpose, to avoid a merge conflict with TTW-099.
