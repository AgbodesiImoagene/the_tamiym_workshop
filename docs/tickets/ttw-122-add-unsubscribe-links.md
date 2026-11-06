# TTW-122 — Add unsubscribe links to marketing emails

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** TTW-119\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 10.9, No unsubscribe link in emails** (Medium, P1, 2–4 h, status "To do"): Consent is checked at send time, but there is no unsubscribe link or page. With no consent screen, a broadcast email reaches nobody.

## Proposal

- Add the signed link from `notification-preference.service.ts` to marketing emails, and a public page that handles it.
- Offer the consent choice, so that a broadcast can reach customers who opted in.

## Invariants

- Security and transactional emails are unaffected.
- The link cannot change another user's preferences.

## Implementation plan

1. Start `codex/ttw-122-add-unsubscribe-links` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: valid, expired and tampered links.
- Playwright: unsubscribe from the link and see the preference change.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/notifications/notification-preference.service.ts:170` — row 10.9
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] One click from a marketing email stops future marketing emails.
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
