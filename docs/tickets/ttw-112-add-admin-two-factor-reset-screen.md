# TTW-112 — Add the admin two-factor reset screen

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-111\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 1.10, No screen to reset an admin's two-factor authentication** (Medium, P1, 2–4 h, status "To do"): An admin who loses their phone and recovery codes stays locked out.

## Proposal

- Add the action to the Team screen, calling `POST /v1/admin/users/{id}/mfa/reset`, with a confirmation and a reason if the API asks for one.

## Invariants

- An admin cannot reset their own two-factor without the existing checks.

## Implementation plan

1. Start `codex/ttw-112-add-admin-two-factor-reset-screen` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: reset another admin, who must enrol again at next sign-in.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `POST /v1/admin/users/{id}/mfa/reset not called` — row 1.10
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An admin who lost their phone and codes can regain access through another admin.
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
