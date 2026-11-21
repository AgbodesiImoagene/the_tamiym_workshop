# TTW-105 — Align the Design Workshop layout with Figma

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** TTW-104\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 3.4, Design Workshop layout differs from Figma** (High, P1, 30–45 h, status "To do"): Left tool rail, front/back/sleeve thumbnails, dashboard sidebar, product photo as background.

Seen running on 2026-11-12 (`/dashboard/design/new/<product>` on the customer app): a full-page editor with no dashboard sidebar, an empty white canvas with no product photo, and one right-hand column holding Size, Color, Add Text, Add Image and Save Design. Figma (frames under "Dashboard/Products/.../DesignWorkshop") has the sidebar, a left rail (Upload, Add Text, Product Colors, Front, Back, Sleeve), a colour grid with a size list, and the buttons Add Product, Remove Product, Duplicate Product, Save | Share and Get Price. The upload text also differs: Figma says "jpg, png, eps, ai and pdf (max 5 mb)", the app says "PNG, JPEG or WebP · max 10 MB". Vector formats are an option the client postponed (3.9, Q27), so the upload text must follow what the app really accepts, not Figma.

## Proposal

- Rebuild the layout from the approved Figma: left tool rail, front, back and sleeve thumbnails, dashboard sidebar, product photo background.
- Change the layout only: tool behaviour stays as it is.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-105-align-workshop-layout-with-figma` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: the existing workshop journeys pass on desktop and mobile widths.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- Compared with the Figma screenshots — row 3.4
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] The workshop matches the approved Figma screens.
- [ ] No workshop feature regressed.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Add, Remove and Duplicate Product buttons (3.5): not needed per Q6.

## Figma findings (local screenshots, read 2026-11-21)

From `revue-client/screenshots/` (frames "Dashboard/Products/Product Info/TamiymSoftShirt/DesignWorkshop", with "Add Text" and "Product Colors" variants):

- The dashboard sidebar (black, 300 px: Home, Products, Design, Orders, Fundraiser) stays on the left. The page title is "Design Workshop" with a back arrow.
- One rounded card holds: a narrow left rail (Upload, Add Text, Product Colors, then the Front, Back and Sleeve thumbnails), a tool panel next to the rail (title bar, then the tool's content), and the product photo on the right as the canvas background.
- Upload panel: "Choose file to Upload", "Art work with high quality would be preferred.", a drag-and-drop zone. Figma lists JPG, PNG, EPS, AI and PDF (max 5 MB); the app keeps "PNG, JPEG or WebP · max 10 MB" (see Background).
- Add Text panel: a text field and a green "Add Text" button.
- Product Colors panel: a colour grid and a size list (XS to 5XL).
- Below the card: Add Product, Remove Product, Duplicate Product (out of scope, row 3.5), the product name and colour, then "Save | Share" and "Get Price".
- Not in Figma: the layers list, undo/redo/delete, the design name field. They stay in the app (behaviour unchanged); where they go is a design-review question.

## Design review

Decided with the product owner on 2026-11-21 (standard risk: no API, schema or contract change).

- Both workshop routes (`/dashboard/design/new/<product>` and `/dashboard/design/<id>/edit`) are wrapped in the existing `CustomerDashboardShell` through a small `WorkshopPageShell`, so the editor and its loading and error screens sit beside the sidebar. `WorkshopEditor` itself does not depend on the user, which keeps its unit tests unchanged.
- Layout only. `TextTool`, `ImageTool`, `OptionPicker`, `LayerList`, `SavePanel`, `SharePanel` and the canvas are reused as they are. A new `WorkshopToolRail` only chooses which tool is open (Add Text first). `ViewTabs` keeps its API and tab roles but becomes vertical thumbnails inside the rail.
- Placement chosen for what Figma does not draw: undo, redo, delete, the layers list and the design name with Save stay in the tool panel, under the open tool (option A). The "Save | Share" row below the card is not copied, because Save and Share already exist in that panel and a second pair would be a duplicate control.
- Not added: Add, Remove and Duplicate Product (row 3.5), and "Get Price" (no behaviour is defined for it; a button with no action is incomplete).
- Product Colors is offered only when the product has options, so the rail has no empty tool.
- The product photo is the existing workshop template layer drawn behind the customer's layers. No API change. To prove it, the e2e seed gives the Campus Hoodie front a template layer (a small PNG data URL).
- Upload text stays "PNG, JPEG or WebP · max 10 MB": it follows what the app accepts, not Figma.
- Existing tests: the image tool is now behind "Upload", so two tests gained one click on "Upload" before their unchanged assertions (`WorkshopEditorLayers.test.tsx`, `design-workshop.low-resolution.spec.ts`). Nothing was removed, weakened or skipped.

## Implementation reviews

Pending: independent review not done yet.

## Verification evidence

2026-11-21, in the worktree, Node 24.22.1:

- Tests written first and failing for the right reason: `WorkshopEditorLayout.test.tsx` (no toolbar "Workshop tools") and `WorkshopPageShell.test.tsx` (module missing).
- `pnpm --filter app test`: 42 suites, 312 tests passed.
- `pnpm --filter app typecheck`, `pnpm --filter app lint`, `pnpm --filter api typecheck`: no error. `pnpm --filter api lint`: 0 errors, 14 warnings (none in files of this ticket).
- `pnpm format:check`, `pnpm playwright:validate`, `pnpm docs:validate`: passed.
- Playwright (chromium-app, throwaway database `tamiym_workshop_test_ttw105`, built apps): `design-workshop.layout.spec.ts` 3/3 (sidebar and rail, product photo painted on the hoodie and not on the tee, phone width with no horizontal scroll). Run together with the other workshop, shared-design and design-order specs: 27 passed (9 of them the login setup), 1 failed (the low-resolution spec, below).
- Not verified here: `design-workshop.low-resolution.spec.ts` fails at the image upload with an API 500, because no object storage (MinIO) runs on this Mac. It is not run against `main` either; CI must confirm it. One run of `design-workshop.layers.spec.ts` also hit a 500 on the thumbnail upload for the same reason, then passed on rerun.
- Not done: mobile Playwright project, Firefox and WebKit, a visual comparison by the client.

## Findings outside this ticket

- The template layer (product photo) painted only a 300 x 300 area at the top left of the 600 x 600 canvas in the e2e run, with two different seed images (1 px and 60 px). It looks like a scaling problem in `WorkshopCanvas.tsx` (`loadTemplateLayers`), which this ticket does not touch. It needs its own check with a real product photo.

## Completion summary

Implemented locally, not committed to any shared branch and not pushed. Awaiting the independent review and the client's visual check.
