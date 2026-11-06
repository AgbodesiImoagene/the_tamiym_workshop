# TTW-162 — Darken the green buttons for contrast

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 12.8, Insufficient contrast on green buttons** (Low, P2, 1–3 h, status "To do"): Below WCAG AA on the homepage and footer.

Client answers:

- **Q50, Green button colour: darken it slightly for accessibility, or keep the brand colour?** Answer: "Can darken."

## Proposal

- Darken the token in `packages/config` to reach WCAG AA (client agrees, Q50), and remove the exception from `tests/e2e/accessibility/exceptions.json`.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-162-darken-green-button-colour` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Write the tests first and show them failing for the right reason.
4. Implement the proposal in small steps. Record any deviation here.
5. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: the accessibility suite passes without the exception.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `tests/e2e/accessibility/exceptions.json` — row 12.8
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] The buttons meet WCAG AA with no recorded exception.
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
