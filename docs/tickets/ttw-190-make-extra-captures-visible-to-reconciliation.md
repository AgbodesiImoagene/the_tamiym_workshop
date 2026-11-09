# TTW-190 — Make extra payment captures visible to reconciliation and alerts

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None (TTW-189 is done)\
**Blocks:** TTW-191

## Background

TTW-189 records a payment captured twice for one order as a `ChargeSettlementClaim` on the extra `Payment`, leaves `Payment.status` unchanged (design decision D4: marking it `SUCCEEDED` would make the oldest-`SUCCEEDED` refund lookup in `refunds.service.ts` target the wrong payment), logs it, counts it (`charge.success.extra_capture`, settlement outcome `extra_capture`) and notifies an admin. The independent review of TTW-189 left these gaps, none of which needs a client answer:

1. **Reconciliation (TTW-015) does not see extra captures.** `reconciliation-runs.service.ts` (around line 412) only reads `Payment.status = SUCCEEDED`; analytics filters do the same. Money held for an extra capture is therefore missing from every report.
2. **No alert on the metric.** The admin notification is sent after the commit; if `adminNotify.emit` fails, Paystack redelivers, the claim makes the redelivery a `duplicate`, and no admin is ever told. The log and the metric survive, but nothing watches them. TTW-088 has the same pattern for late captures. Decision of the user (2026-11-09): keep log and metric, wire an alert on them rather than moving the outbox write into the transaction.
3. **No test against a real database** for the unique claim under concurrent delivery (no Postgres was available when TTW-189 was built).
4. The extra `Payment` could later be set to `FAILED` by `failIfStillPendingOrInitiated` (`payments.service.ts` around line 459). Not shown reachable for a `PAID` order; confirm and guard if reachable.

## Proposal

1. Add a reconciliation check: every `ChargeSettlementClaim` whose `Payment.status` is not `SUCCEEDED`, on an order that is not the settling order of that payment, becomes a finding "extra capture awaiting refund" until a refund exists (TTW-191). Decide the severity and the `ReconciliationOutcome` in the design review; reuse existing values if one fits.
2. Wire an alert (existing alert-rules mechanism) on `charge.success.extra_capture` and on `charge.success.cancelled_order` above zero, and document it in `docs/`.
3. Add integration/e2e coverage: pay attempt A, expire it, pay attempt B, deliver both webhooks serially and concurrently; assert one settled order, one extra-capture claim, one audit entry, no second `SUCCEEDED` payment.
4. Guard the extra `Payment` against `failIfStillPendingOrInitiated` if reachable.

Rejected alternative: moving the admin outbox write into the settlement transaction (a separate ticket for TTW-088 and TTW-189 together, only if the alert proves insufficient).

## Invariants

- The settling path of a first capture, and the TTW-088 cancelled-order path, are unchanged.
- An extra capture never changes the order, stock, campaign totals or ledger.
- Reconciliation stays read-only except for its existing finding records.

## Implementation plan

1. Write failing tests (reconciliation unit test, then the integration test).
2. Design review (High: security review not required, integration coverage required).
3. Implement the reconciliation check and the alert rule.
4. Docs: `docs/orders/ttw-041-interim-policy.md` limit paragraph, observability docs.

## Test and observability plan

- Unit/component: reconciliation finds a claim on a non-`SUCCEEDED` payment; ignores the settling payment.
- Integration/e2e: Postgres + fake Paystack scenario above, serial and concurrent.
- Logs, metrics, traces, and alerts: alert fires when `charge.success.extra_capture` is above zero.

## References

- `apps/api/src/orders/paystack-webhook.service.ts` — `handleExtraCapture`.
- `apps/api/src/reconciliation/reconciliation-runs.service.ts` — payment checks.
- `docs/tickets/ttw-189-handle-duplicate-payment-captures.md` — design review (D4) and independent review.

## Acceptance criteria

- [ ] An extra capture appears as a reconciliation finding until it is refunded.
- [ ] An alert exists for the extra-capture and cancelled-order capture metrics.
- [ ] Integration test proves one claim and one audit entry under serial and concurrent delivery.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Refunding the extra capture (TTW-191).
- Customer e-mail.

## Design review

Not started.

## Implementation reviews

Not started.

## Verification evidence

Not started.

## Completion summary

Not started.
