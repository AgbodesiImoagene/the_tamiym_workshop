# TTW-191 — Refund extra payment captures automatically (v2)

**Epic:** 8 — Client review delivery\
**Status:** Deferred (v2)\
**Risk:** Critical\
**Blocked by:** deferred to v2 by the user (2026-11-09); TTW-190 for the reconciliation finding\
**Blocks:** None

## Background

TTW-189 records extra captures (a second payment captured for an order that is already paid, or past payment) and tells an admin, who must refund by hand from the Paystack dashboard. The admin refund tools cannot target such a payment: `reserveRefundRow` and the refund lookups in `refunds.service.ts` choose the oldest `SUCCEEDED` payment of the order, and an extra capture deliberately keeps its original status (TTW-189, D4).

TTW-088 refuses the automatic late-payment refund when an order has more than one `SUCCEEDED` payment (`capturedCount > 1`), so several captures on a cancelled order also stay manual.

## Proposal

**Decision (user, 2026-11-09), because of the delivery deadline: D1 and D2 are settled as manual refund by an admin for v1; automatic refund is v2.** Nothing in this ticket is needed for v1: the recording, the admin notification, the reconciliation finding and the alert (TTW-189, TTW-190) cover it, and the admin refunds from the Paystack dashboard then acknowledges the reconciliation finding. The text below describes the v2 work; reopen it only when the user decides to build it.

Original note: The user approved the interim recommendation (record, notify, refund by hand, no customer e-mail) on 2026-11-09; the client has not been asked yet.

- D1: refund an extra capture on a paid order automatically, or by an admin action?
- D2: same question for several captures on one cancelled order.
- Whichever is chosen, refund each captured payment exactly once, with the amount of that payment (never the order total), through the existing refund service and its guards (TTW-013, TTW-081): the refund row is reserved in a short transaction, Paystack is called with no transaction open, and the result is finalised in a second short transaction.
- The refund must target the extra `Payment` explicitly (a payment id), not "the oldest `SUCCEEDED` payment".
- If D3 changes, a customer e-mail "you paid twice, we refund you" is a separate decision.

## Invariants

- A captured payment is refunded at most once, even under duplicate or concurrent webhooks and concurrent admin actions (database-enforced).
- A refund never exceeds its own payment's captured amount.
- No database transaction is open during a Paystack call.
- Settling payments and their refund path are unchanged.

## Implementation plan

1. Get the client's D1/D2 answers through the user.
2. Failing tests first (service, then integration against Postgres and a fake Paystack).
3. Design review (Critical: invariants, threat and concurrency analysis, database enforcement).
4. Implement, update Swagger, shared contracts, reconciliation (finding closes when refunded), docs.
5. One comprehensive independent implementation review.

## Test and observability plan

- Unit/component: refund of an extra capture targets the right payment and amount.
- Integration/e2e: duplicate and concurrent refund requests produce one refund; Paystack refund id already used (TTW-081); Paystack call failing then retried.
- Logs, metrics, traces, and alerts: refund outcome metric for extra captures; alert on failed refunds.

## References

- `apps/api/src/orders/refunds.service.ts` — `reserveRefundRow`, the `capturedCount > 1` guard.
- `docs/tickets/ttw-189-handle-duplicate-payment-captures.md`, `ttw-088-refund-payments-captured-after-cancellation.md`, `ttw-190-make-extra-captures-visible-to-reconciliation.md`.

## Acceptance criteria

- [x] D1 and D2 answered for v1: manual refund (user decision, 2026-11-09). v2 automatic refund still to specify with the client.
- [ ] Each extra capture is refunded exactly once, for its own amount.
- [ ] Duplicate and concurrent requests produce at most one refund per payment.
- [ ] No transaction is open during a Paystack call (asserted in a test).
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Customer e-mail (D3) unless the user asks.
- Recording and alerting (TTW-189, TTW-190).

## Design review

Not started.

## Implementation reviews

Not started.

## Verification evidence

Not started.

## Completion summary

Not started.
