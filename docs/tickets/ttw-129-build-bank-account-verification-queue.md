# TTW-129 — Build the bank-account verification queue

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Critical\
**Blocked by:** TTW-128; client decision on Q23 and Q25\
**Blocks:** TTW-130, TTW-131

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 7.1, Organiser bank accounts cannot be verified** (Blocker, P0, 8–12 h, status "To do"): In production every account stays "pending". The API has no route to list accounts awaiting verification and there is no screen. Without verification: no campaign, no payout.
- **Row 6.11, Activation blocked because bank accounts cannot be verified** (Blocker, P0, 0–0 h, status "Included in 7.1"): Activation requires a verified bank account, which admins cannot verify (see 7.1).

## Proposal

- Add a route listing accounts awaiting verification, and an admin queue to verify or reject them.

## Invariants

- Only a verified account can receive a payout.
- Every decision is audited.

## Implementation plan

1. Start `codex/ttw-129-build-bank-account-verification-queue` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: list, verify, reject, authorization.
- Playwright: a verified account allows campaign activation.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/admin/admin-payout-profiles.controller.ts` — row 7.1
- `docs/fundraising/ttw-034-interim-policy.md` — row 6.11
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A campaign can be activated in production, because its bank account can be verified.
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
