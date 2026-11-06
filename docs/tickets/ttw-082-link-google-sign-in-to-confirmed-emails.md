# TTW-082 — Link Google sign-in only to confirmed emails

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 1.8, Google sign-in links accounts without a confirmed email** (Critical, P0, 1–2 h, status "To do"): An existing account is linked to a Google account with the same address without checking email_verified. Account takeover risk.

## Proposal

- Read Google's `email_verified` claim and pass it to the account-linking code.
- Link to an existing account, or create one, only when Google confirms the address. Otherwise refuse with the same generic sign-in error.
- Log the refusal without the email address.

## Invariants

- An existing password account is never linked through an unconfirmed Google address.
- Accounts already linked keep signing in.
- Customer and admin surfaces stay separate (TTW-020).

## Implementation plan

1. Start `codex/ttw-082-link-google-sign-in-to-confirmed-emails` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: confirmed, unconfirmed and missing `email_verified`, each with and without an existing account.
- Integration: the callback leaves the existing account unlinked when the claim is false.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/auth/auth.service.ts:575` — row 1.8
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A Google profile without a confirmed email cannot sign in to, or link with, an existing account.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Admin Google sign-in → TTW-113.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
