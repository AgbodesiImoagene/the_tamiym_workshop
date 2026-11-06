# TTW-133 — Cap one-off payouts and require a second admin

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Critical\
**Blocked by:** TTW-131; client decision on Q23 and Q25\
**Blocks:** None

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 7.8, One-off payout with no cap, approved by a single admin** (Critical, P0, 4–8 h, status "To do"): Free amount up to ₦999,999,999, never compared with the available balance. A typo or a compromised admin account could drain the Paystack balance.

## Proposal

- Refuse a one-off payout above the available balance.
- Require a second admin's approval, like manual adjustments.

## Invariants

- No payout exceeds the available balance, even under concurrent requests.
- The initiator cannot approve their own payout.

## Implementation plan

1. Start `codex/ttw-133-cap-one-off-payouts` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration on real Postgres: amount above balance, self-approval, concurrent requests.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/payouts/payouts.service.ts:245` — row 7.8
- `apps/admin/app/admin/payouts/manual/page.tsx:46` — row 7.8
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] One admin alone cannot drain the Paystack balance.
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
