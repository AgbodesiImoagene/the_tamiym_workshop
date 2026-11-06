# TTW-147 — Choose and configure the production email provider

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-085\
**Blocks:** TTW-148

## Background

No production email provider is chosen. The client asks for a price and suitability comparison and has no third-party accounts ready (Q42).

Client answers:

- **Q42, Production email provider (Mailgun, SendGrid, Amazon SES, Resend…) and sending domain? Termii SMS account opened?** Answer: "Up to you. Do a price and suitability comparison and make an informed recommendation. No official 3p accounts ready for integration yet."

## Proposal

- Compare providers on price and fit for Nigeria, and record a recommendation (the client asks for it, Q42).
- After approval, set up the sending domain (SPF, DKIM) and the production settings.

## Invariants

- No secret is committed.

## Implementation plan

1. Start `codex/ttw-147-choose-and-configure-email-provider` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Send a real test email from the validation environment.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] Production emails reach an inbox from the client's domain.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Failover between providers → TTW-048, which stays deferred.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
