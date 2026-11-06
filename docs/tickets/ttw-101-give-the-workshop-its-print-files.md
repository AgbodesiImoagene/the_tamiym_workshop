# TTW-101 — Give the print shop its print files

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-058; TTW-099\
**Blocks:** TTW-143

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 3.2, The print shop does not receive print files** (Blocker, P0, 20–35 h, status "To do"): The admin order detail only shows the design name: no per-side preview, no originals, no positions.

## Proposal

- Show on the admin order detail: a preview per side, the original uploads through signed links, and the positions and sizes.
- Read the design revision frozen on the order, not the current one.
- Confirm the export format with the print shop at design review.

## Invariants

- Later edits to a design never change what an order prints.
- Only admins can open these files.

## Implementation plan

1. Start `codex/ttw-101-give-the-workshop-its-print-files` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: admin access allowed, customer access refused.
- Playwright: an ordered design shows all its sides in admin.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/admin/app/admin/orders/[id]/page.tsx:185` — row 3.2
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] The print shop can produce an order from the admin screen alone.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
