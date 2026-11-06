# TTW-148 — Run end-to-end tests and client acceptance

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-147\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 13.3, End-to-end testing and client acceptance not done** (High, P0, 10–20 h, status "To do"): API end-to-end and Playwright suites to be re-run against a test database, plus client acceptance testing of the full journeys.

## Proposal

- Re-run the API e2e and Playwright suites against a test database.
- Run the release rehearsal from `docs/release/ttw-054-interim-policy.md`.
- Walk the client through the full journeys, and turn each problem into a new ticket.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-148-run-end-to-end-tests-and-client-acceptan` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Implement the proposal in small steps. Record any deviation here.
5. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- The suites themselves, with exact results recorded below.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `docs/release/ttw-054-interim-policy.md` — row 13.3
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] All suites pass.
- [ ] The client signs off the journeys.
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
