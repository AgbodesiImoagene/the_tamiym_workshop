# TTW-119 — Build the data-rights and preference screens

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-122

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 11.1, No screens for data rights** (High, P1, 12–18 h, status "To do"): Export, account deletion, request tracking, preferences and consent (10 existing routes).

## Proposal

- Add customer screens for export, account deletion, request tracking, notification preferences and marketing consent, using `/v1/privacy/*` and `/v1/users/notification-preferences`.
- State clearly what deletion removes and what is legally kept.

## Invariants

- Deletion and export keep their re-authentication step.

## Implementation plan

1. Start `codex/ttw-119-build-data-rights-screens` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: export request, deletion request, and a preference change that persists.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `/v1/privacy/*, /v1/users/notification-preferences` — row 11.1
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer can exercise these rights without contacting support.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
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
