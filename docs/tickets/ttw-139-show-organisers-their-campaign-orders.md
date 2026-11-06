# TTW-139 — Show organisers their campaign orders

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-134; client decision on Q23 and Q25\
**Blocks:** None

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 5.9, Organisers cannot see their campaign's orders** (High, P1, 6–10 h, status "To do"): The API exists (without buyers' personal data); the screen does not.

## Proposal

- Add a screen on `GET /v1/campaigns/{id}/orders`.

## Invariants

- Buyers' personal data stays hidden, and anonymous supporters stay anonymous.

## Implementation plan

1. Start `codex/ttw-139-show-organisers-their-campaign-orders` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: an organiser sees their orders, and another organiser cannot.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `GET /v1/campaigns/{id}/orders not called` — row 5.9
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An organiser can follow their campaign's orders.
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
