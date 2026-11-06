# TTW-111 — Let admins suspend and reinstate users

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-112

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 1.9, Users cannot be suspended** (High, P1, 6–10 h, status "To do"): The "suspended" status does block access, but nothing can set it. The PRD requires the ability to restrict accounts.

## Proposal

- Add suspend and reinstate routes with a required reason, and actions in the admin user screens.
- Revoke the user's sessions on suspension.

## Invariants

- A suspended user loses access at once.
- An admin cannot suspend themselves or the last admin.
- Every change is in the audit log.

## Implementation plan

1. Start `codex/ttw-111-let-admins-suspend-users` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: suspend, sessions revoked, access refused, reinstate, authorization.
- Playwright: suspend a customer from admin.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- No write of UserStatus.SUSPENDED — row 1.9
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An admin can restrict an account, as the PRD requires.
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
