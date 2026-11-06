# TTW-114 — Build the Paystack reconciliation screens

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 10.1, Paystack reconciliation has no screens** (High, P1, 20–30 h, status "To do"): Discrepancies are detected nightly but admins cannot see or handle them (10 routes).

## Proposal

- Add admin screens for `/v1/admin/reconciliation/*`: findings, acknowledge, repair request and approval, export, manual run.

## Invariants

- Repair keeps its two-person rule (TTW-015).
- Screens never apply a financial effect by themselves.

## Implementation plan

1. Start `codex/ttw-114-build-paystack-reconciliation-screens` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: a seeded discrepancy is seen, acknowledged and sent for repair.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `/v1/admin/reconciliation/*` — row 10.1
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] Admins can see and handle every discrepancy the nightly run finds.
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
