# TTW-135 — Let organisers edit or delete their bank account

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-130; client decision on Q23 and Q25\
**Blocks:** None

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 7.3, Organisers cannot edit or delete their bank account** (Medium, P1, 4–6 h, status "To do"): Routes exist, no screen.

## Proposal

- Wire the settings screen to `GET`, `PATCH` and `DELETE /v1/payout-profiles/{id}`.

## Invariants

- Changing an account requires verifying it again.
- A payout in progress keeps its frozen bank details.

## Implementation plan

1. Start `codex/ttw-135-let-organisers-edit-bank-accounts` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: edit an account, which returns to pending.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `GET/PATCH/DELETE /v1/payout-profiles/{id}` — row 7.3
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An organiser can correct their bank details safely.
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
