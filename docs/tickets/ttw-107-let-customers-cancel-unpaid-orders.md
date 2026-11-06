# TTW-107 — Let customers cancel their unpaid orders

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Critical\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 5.2, Customers cannot cancel an unpaid order** (Medium, P1, 3–5 h, status "To do"): Allowed by the policy; the API does not exist.

## Proposal

- Add a customer cancel route for unpaid orders, per `docs/orders/ttw-041-interim-policy.md`, with a button on the order page.
- Release the stock reservation in the same state transition.
- Close the active payment attempt, and handle a payment that arrives afterwards as TTW-088 does.

## Invariants

- A paid order cannot be cancelled by this route.
- A reservation is released exactly once, under duplicate and concurrent requests.
- A charge webhook racing with the cancel never loses money.

## Implementation plan

1. Start `codex/ttw-107-let-customers-cancel-unpaid-orders` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration on real Postgres: double cancel, and cancel racing a charge webhook.
- Playwright: cancel an unpaid order from its page.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `docs/orders/ttw-041-interim-policy.md` — row 5.2
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer can cancel an unpaid order, and its stock returns.
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
