# TTW-085 — Validate production mail settings at startup

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** TTW-147

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 10.5, Production email settings not validated at startup** (Critical, P0, 1–2 h, status "To do"): The mail host defaults to localhost and is not a required setting: emails could fail silently.

Client answers:

- **Q42, Production email provider (Mailgun, SendGrid, Amazon SES, Resend…) and sending domain? Termii SMS account opened?** Answer: "Up to you. Do a price and suitability comparison and make an informed recommendation. No official 3p accounts ready for integration yet."

## Proposal

- Make the mail host and credentials required in production in `env-validation.ts`, and reject `localhost` or placeholder values there.
- Keep development and test behaviour unchanged.
- Update the env examples and `docs/11-development-setup.md` if they list these settings.

## Invariants

- The API refuses to boot in production with unusable mail settings.
- Development and test boot exactly as before.

## Implementation plan

1. Start `codex/ttw-085-validate-production-mail-settings` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: `env-validation` in production with missing, localhost and valid values, and in test mode.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/config/env-validation.ts:17` — row 10.5
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] Booting with `NODE_ENV=production` and a localhost mail host fails with a clear message.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Choosing the provider → TTW-147.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
