# TTW-132 — Define refund recovery after a payout

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Critical\
**Blocked by:** TTW-131; client answer Q30 (default in Proposal); client decision on Q23 and Q25\
**Blocks:** None

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 6.13, Refund after payout: no recovery rule** (Critical, P0, 6–10 h, status "To do"): The organiser's balance goes negative; the workshop absorbs the loss.

Client answers:

- **Q30, Supporter refund after the organiser was paid: deduct from future payouts, or loss for the workshop? Extend the hold before payout (7 days today)?** Answer: "Another good question. Do we have to offer refunds here? Again I’ll check with the owner."

## Proposal

- Default until Q30 is answered: deduct the amount from the organiser's future payouts, and record any remaining negative balance for admins.
- Update `docs/orders/ttw-041-interim-policy.md`.

## Invariants

- A refund is recorded once in the ledger.
- A negative balance blocks further payouts until cleared.

## Implementation plan

1. Start `codex/ttw-132-define-refund-recovery-after-payout` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: refund before and after payout, under duplicate and concurrent events.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `docs/orders/ttw-041-interim-policy.md` — row 6.13
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A refund after payout has a defined, tested financial outcome.
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
