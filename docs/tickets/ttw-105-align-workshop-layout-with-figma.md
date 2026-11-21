# TTW-105 — Align the Design Workshop layout with Figma

**Epic:** 8 — Client review delivery\
**Status:** Implemented locally (not pushed, not merged)\
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
- Layout only. `TextTool`, `ImageTool`, `OptionPicker`, `LayerList`, `SavePanel`, `SharePanel` and the canvas are reused as they are. A new `WorkshopToolRail` only chooses which tool is open (Add Text first). The three tools stay mounted and the closed ones are hidden, so what was typed in Add Text, or an upload in progress, survives a visit to another tool (found by the first review). The rail is a labelled group, not a toolbar, because it holds the view tabs. `ViewTabs` keeps its API and tab roles but becomes vertical thumbnails inside the rail.
- Placement chosen for what Figma does not draw: undo, redo, delete, the layers list and the design name with Save stay in the tool panel, under the open tool (option A). The "Save | Share" row below the card is not copied, because Save and Share already exist in that panel and a second pair would be a duplicate control.
- Not added: Add, Remove and Duplicate Product (row 3.5), and "Get Price" (no behaviour is defined for it; a button with no action is incomplete).
- On a phone the canvas comes right after the rail and the tool panel comes after the canvas, so the result of a tool is visible without scrolling past every panel (found by the first review).
- Product Colors is offered only when the product has options, so the rail has no empty tool.
- The product photo is the existing workshop template layer drawn behind the customer's layers. No API change. To prove it, the e2e seed gives the Campus Hoodie front a template layer (a small PNG data URL).
- Upload text stays "PNG, JPEG or WebP · max 10 MB": it follows what the app accepts, not Figma.
- Existing tests: the image tool is now behind "Upload", so two tests gained one click on "Upload" before their unchanged assertions (`WorkshopEditorLayers.test.tsx`, `design-workshop.low-resolution.spec.ts`). Nothing was removed, weakened or skipped.

## Implementation reviews

First review (independent subagent, 2026-11-21): FAIL (conditional). No security finding. To fix: (1) typed text lost when another tool was opened, (2) an upload error lost if the tool was left during the upload, (3) the canvas below every panel on a phone, (4) toolbar role containing tabs and a wrong vertical orientation on a phone, (5) an inaccurate seed comment and an incomplete ticket. All five are fixed in the second commit, with tests written first (`WorkshopEditorLayout.test.tsx`: typed text kept, image tool kept mounted, group role; `design-workshop.layout.spec.ts`: canvas in the viewport on a phone). The reviewer's claim that `originalBytes: 144` was wrong is itself wrong: the PNG is 144 bytes.

Second review (independent subagent, 2026-11-21): PASS, no blocking finding. It re-ran the app tests (42 suites, 317 tests), typecheck and lint, and read the code of the two fix commits. Remarks kept for the product owner, none blocking:

- On a phone the visual order (rail, canvas, tool panel) differs from the keyboard order (rail, tool panel, canvas), because only CSS `order` changes it. Minor for a touch screen.
- A text or image is added at 50, 50, so with a print area such as 0.3, 0.3, 0.4, 0.4 of a 600 px canvas (window 180 to 420) it lands outside the visible window and cannot be seen when added. This already happened before this ticket (with the shifted clip); with "only the print area is visible" it may surprise the customer. Placing new layers at the centre of the print area would fix it: not done, outside this ticket.
- The clip is covered by a unit test on the parameters given to Fabric and by the manual check above; the e2e photo test uses a product with no print area.
- Not re-checked by the reviewer: Playwright, the API gates, `format:check`, `docs:validate`, `playwright:validate` (run by the author, see the evidence).

## Verification evidence

2026-11-21, in the worktree, Node 24.22.1:

- Tests written first and failing for the right reason: `WorkshopEditorLayout.test.tsx` (no toolbar "Workshop tools") and `WorkshopPageShell.test.tsx` (module missing); then for the review fixes, six assertions of `WorkshopEditorLayout.test.tsx` failed before the code change (no group role, typed text lost, image tool unmounted).
- `pnpm --filter app test`: 42 suites, 317 tests passed (after the canvas origin fix).
- `pnpm --filter app typecheck`, `pnpm --filter app lint`, `pnpm --filter api typecheck`, `pnpm format:check`, `pnpm playwright:validate`: exit 0. `pnpm docs:validate` passed at the first commit.
- Playwright (chromium, throwaway database `tamiym_workshop_test_ttw105` seeded with `seed:e2e`, built apps), one combined run of `design-workshop*`, `shared-design*`, `design-order*`, `checkout-order-note`, `checkout-delivery-instructions`, `email-verification-banner`, `products-cart`, admin `bulk-pricing`: 51 passed, 1 failed. The failure is `design-workshop.low-resolution.spec.ts`: the image upload answers 500 because no object storage (MinIO) runs on this Mac. It was not run on `main`; CI must confirm it.
- Risks of the seed change (a product photo on the Campus Hoodie), checked: the specs above that use the hoodie pass on a fresh seed, and the full API e2e suite gives 377 of 378 passed. The one failure (`address-country-and-text-hardening`, over-long state) passes alone, 20 of 20, and concerns addresses, not products. One earlier run of `products-cart` failed ("Bulk Item 01" missing) on a database already used by several runs; it passed on a fresh seed, and it also failed with the hoodie photo rows deleted, so the cause is not the seed change.
- Not done: Playwright mobile project, Firefox and WebKit, a visual comparison by the client.

## Findings outside this ticket

Found and fixed on 2026-11-21, with the product owner's approval (commit `1582b01`):

- Fabric 7 centres an object on its `left` and `top` unless `originX` and `originY` say otherwise (checked with Fabric 7.4.0 alone: a 200 px square placed at 100, 100 covers 0 to 200).
- `WorkshopCanvas.tsx` placed the product photo at `left: 0, top: 0` with no origin, so only its bottom-right quarter showed at the canvas top-left (seen with a real photo and with the seed image: 25 % of the canvas painted). The print-area clip (`buildClipPath`) had the same flaw: for an area of 0.3, 0.3, 0.4, 0.4 of a 600 px canvas the visible window was 60 to 300 instead of 180 to 420, and a text added at 50, 50 was almost entirely cut.
- Fix: `originX: 'left'` and `originY: 'top'` on the photo and on the clip. Tests first: two assertions in `WorkshopCanvas.test.tsx` (failed on the missing origin), and the e2e photo check now requires more than 99 % of the canvas painted (it measured 25 % before the fix).
- Checked in the running app afterwards, with a real product photo and a print area added to the local database only: the painted window is exactly 180 to 420 on both axes.

Decided by the product owner on 2026-11-21: only the print area must be visible. The print-area clip stays on the whole canvas, so the product photo and the customer's layers both show only inside the print area. No change.

## Completion summary

Implemented locally in four commits (three of code, one of documentation), not pushed. Both independent reviews are done (the second one PASS). Awaiting the client's visual check, the CI run of the image upload spec, and the merge decision.
