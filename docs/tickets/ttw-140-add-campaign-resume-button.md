# TTW-140 — Add the admin button to resume a paused campaign

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Low\
**Blocked by:** client decision on Q23 and Q25\
**Blocks:** None

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 6.10, Admins cannot resume a paused campaign** (Low, P1, 1–2 h, status "To do"): The route exists, the button does not.

## Proposal

- Add the button, calling `POST /v1/admin/campaigns/{id}/resume`, and show readiness errors.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-140-add-campaign-resume-button` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Write the tests first and show them failing for the right reason.
4. Implement the proposal in small steps. Record any deviation here.
5. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: pause then resume a campaign.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `POST /v1/admin/campaigns/{id}/resume not called` — row 6.10
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An admin can resume a paused campaign from the screen.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Not required for a low-risk ticket.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
