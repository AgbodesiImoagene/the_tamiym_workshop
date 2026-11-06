# TTW-089 — Add forgot-password and reset-password pages

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-083\
**Blocks:** TTW-090

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 1.1, No "forgot password" or password reset pages** (High, P1, 6–10 h, status "To do"): The API exists, but there is no link on any login page. The reset email points to /reset-password, which does not exist (404).

## Proposal

- Add a forgot-password page and a reset page on the surface the email link targets (`/reset-password` on the web app today), using the existing `POST /v1/auth/forgot-password` and `POST /v1/auth/reset-password`.
- Link them from the customer login pages. Follow Figma where a design exists.
- Use Zod and React Hook Form, and model loading, error, expired-link and success states.

## Invariants

- The forgot-password response never reveals whether an account exists.
- A reset closes all sessions (existing behaviour).

## Implementation plan

1. Start `codex/ttw-089-add-forgot-and-reset-password-pages` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Component: form validation and states.
- Playwright: request, open the emailed link, set a password, sign in.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/auth/auth.service.ts:230` — row 1.1
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer who forgot their password can recover the account from the login page.
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
