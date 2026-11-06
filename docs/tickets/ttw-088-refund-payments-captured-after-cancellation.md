# TTW-088 — Refund payments captured after an order was cancelled

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Critical\
**Blocked by:** TTW-081; client answer Q16 (default in Proposal)\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 4.6, Late payment captured but not refundable from the system** (Critical, P0, 8–14 h, status "To do"): After 30 min the order is cancelled. If the customer pays later (bank transfer, USSD), the money is captured, but the API refuses to refund a cancelled order.

Client answers:

- **Q16, Payment window (30 min today) and accepted methods (card, bank transfer, USSD): which rule? For late payments, automatic refund or order confirmation?** Answer: "Context please. We may need to simplify to meet delivery targets here."

Q16 asks for more context. Explain to the client that transfers and USSD can settle after the 30-minute window, then confirm the rule.

## Proposal

- Default until Q16 is answered: keep the 30-minute window and allow a refund of a captured late payment on a cancelled order.
- Treat it as a distinct eligibility case in the refund rules, not a general opening of refunds on cancelled orders.
- Update `docs/orders/ttw-041-interim-policy.md`.

## Invariants

- Each captured payment is refunded at most once, under sequential and concurrent duplicates.
- A cancelled order without captured money stays non-refundable.
- No database transaction stays open across a Paystack call.

## Implementation plan

1. Start `codex/ttw-088-refund-payments-captured-after-cancellat` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration on real Postgres: late charge webhook then refund, duplicates in sequence and in parallel.
- Failure: Paystack refuses or times out, and the state stays retryable.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/orders/paystack-webhook.service.ts:148` — row 4.6
- `refunds.service.ts:41` — row 4.6
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An admin can refund a late payment from the system, and it settles exactly once.
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
