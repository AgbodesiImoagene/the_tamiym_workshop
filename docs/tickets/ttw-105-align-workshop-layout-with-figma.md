# TTW-105 — Align the Design Workshop layout with Figma

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** TTW-104\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 3.4, Design Workshop layout differs from Figma** (High, P1, 30–45 h, status "To do"): Left tool rail, front/back/sleeve thumbnails, dashboard sidebar, product photo as background.

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

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
