# TTW-134 — Show organisers their balance and payouts

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-131; client decision on Q35; client decision on Q23 and Q25\
**Blocks:** TTW-139

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 7.9, Organisers cannot see their money** (High, P1, 8–12 h, status "To do"): No available balance, no pending amounts, no payout history.

Client answers:

- **Q35, Payout schedule: weekly, at campaign end, or manual? Minimum amount? Always approved by an admin?** Answer: "Should be configurable. Question is per campaing or globally by site admin, and in the latter case how do we communicate changes. I’ll revert. We may fix a platform policy of weekly."

## Proposal

- Add a read route and screen for available balance, amounts on hold and payout history.
- Replace the gross figure on the organiser dashboard.

## Invariants

- An organiser sees only their own campaigns.

## Implementation plan

1. Start `codex/ttw-134-show-organisers-their-money` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: amounts match the ledger, and access by another user is refused.
- Playwright: the dashboard shows the balance.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/app/app/dashboard/fundraiser/page.tsx:166` — row 7.9
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An organiser can see what they will receive, and when.
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
