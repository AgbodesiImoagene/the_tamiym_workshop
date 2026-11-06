# TTW-083 — Hash password-reset and email-verification tokens

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-005\
**Blocks:** TTW-089

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 1.7, Password reset and verification tokens stored in plain text** (Critical, P0, 2–4 h, status "To do"): Sessions are hashed, these tokens are not. A database leak would allow password resets.

## Proposal

- Store only a digest of each `AuthToken`, the same way sessions and share links do (TTW-023, TTW-026).
- Send the raw token by email only. Look tokens up by digest.
- The migration removes existing plaintext tokens: the project is not in production, so outstanding links can simply stop working.

## Invariants

- No raw reset or verification token is readable in the database.
- A token stays single-use and expiring.
- Tokens never appear in logs.

## Implementation plan

1. Start `codex/ttw-083-hash-password-reset-and-verification-tok` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Generate the migration with `pnpm --filter api exec prisma migrate dev --name <name>`, after checking that no other open ticket has one in flight.
8. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: issue, consume, replay and expiry with digests.
- Integration: reset and verify flows against real Postgres, and the stored value differs from the emailed token.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/prisma/schema.prisma (AuthToken.token)` — row 1.7
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A database read alone cannot produce a working reset or verification link.
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
