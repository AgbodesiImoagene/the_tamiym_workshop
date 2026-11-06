# TTW-136 — Allow guest checkout for fundraiser supporters

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Critical\
**Blocked by:** TTW-039; TTW-131; client decision on Q23 and Q25\
**Blocks:** TTW-137

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 4.7, Fundraiser supporters must create an account** (High, P1, 20–30 h, status "Optional (client decision)"): Sign-up and email verification are required before buying: a major conversion barrier.

Client answers:

- **Q14, Must fundraiser supporters create an account to buy, or is guest checkout needed?** Answer: "Guest checkout is fine. They can leave details without creating an account for accounting purposes for the organisers, but can also chose to stay anonymous. Through an account should also be a valid option. So if logged in use account, if not prompt to log in/create account or use guest checkout."

## Proposal

- If signed in, use the account. If not, offer sign-in, account creation or guest checkout (Q14).
- A guest leaves contact details for accounting, and can choose to stay anonymous to the organiser.
- Define how a guest reaches their order status at design review.

## Invariants

- One cart revision creates one order, for guests too.
- A guest order is never readable by someone else.
- Anonymous supporters are never shown to organisers.

## Implementation plan

1. Start `codex/ttw-136-allow-guest-fundraiser-checkout` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Generate the migration with `pnpm --filter api exec prisma migrate dev --name <name>`, after checking that no other open ticket has one in flight.
8. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: guest order idempotency and access control.
- Playwright: full guest purchase, including payment.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/web/app/fundraiser/[slug]/checkout/page.tsx:88` — row 4.7
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A supporter can buy without an account, and optionally stay anonymous.
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
