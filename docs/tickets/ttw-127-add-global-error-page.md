# TTW-127 — Add a global error page to the public site

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 12.7, No global error page** (Low, P1, 1–2 h, status "To do"): If the API is down, visitors see the raw Next.js error screen.

## Proposal

- Add `error.tsx` and a global fallback to `apps/web/app`, with a retry action and English copy.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-127-add-global-error-page` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Write the tests first and show them failing for the right reason.
4. Implement the proposal in small steps. Record any deviation here.
5. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Component: the page renders and retry resets it.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/web/app (no error.tsx)` — row 12.7
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] If the API is down, a visitor sees a Tamiym page instead of the raw Next.js error.
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
