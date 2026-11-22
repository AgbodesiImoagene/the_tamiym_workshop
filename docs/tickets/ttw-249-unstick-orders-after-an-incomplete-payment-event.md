# TTW-249 — Unstick orders that got an incomplete payment event

**Epic:** 2 — Security and trust boundaries\
**Status:** Merged into TTW-223\
**Risk:** Critical\
**Blocked by:** None\
**Blocks:** None

## Decision

Merged into [TTW-223](ttw-223-expire-abandoned-initiated-payments-and-release-stock.md) on 2026-11-22. After an incomplete `charge.success`, the payment stays `INITIATED` (TTW-248 writes nothing), which is the exact case TTW-223 handles: after the agreed delay the expiry job asks Paystack for the real status, settles through the existing `charge.success` path, or cancels and releases the stock. Nothing is to be built under this number. The text below is kept as the origin of the case.

## Background

Found by the independent review of TTW-248 (2026-11-22). Since TTW-248, a signed `charge.success` without `amount` or `currency` is not settled: the order stays `PENDING_PAYMENT` with its stock reserved, and admins are notified (`PaystackWebhookService.processChargeSuccess`). Paystack received a 200 and does not redeliver. The expiry job skips any `PENDING_PAYMENT` order that has an `INITIATED` payment (`apps/api/src/orders/order-expiry.service.ts`, about lines 64-80). So if no complete event follows, the order stays pending and the stock stays reserved until a person acts. The runbook (`docs/runbooks/webhooks-money.md`, section "Incomplete `charge.success`") describes the manual steps. A dashboard resend replays the stored, possibly still incomplete, payload, so it does not settle the order.

The event is rare (Paystack normally sends both fields). No automatic follow-up exists.

## Proposal

To decide in the design review, not here: an automatic follow-up that asks Paystack for the real state of the transaction (outside any database transaction) and then settles, or cancels and releases the stock, or raises a clear admin task. Rejected for now: settling from the incomplete event.

## Invariants

- A paid order is never created without the right amount and currency.
- Money captured is never lost: a capture on an order that cannot use it is recorded for refund.
- Stock is released exactly once, and never both released and consumed.
- No network call inside a database transaction.

## Implementation plan

1. Record the design review (Critical: invariants, concurrency, database enforcement).
2. Tests first on real Postgres: incomplete event, then the follow-up, duplicate and concurrent runs.
3. Implement, update the runbook and the alert text, run the gates and the independent review.

## Test and observability plan

- Integration on real Postgres, including concurrent duplicates against `ChargeSettlementClaim`.
- A metric and a log reason for the follow-up outcome; no secrets or PII in logs.

## References

- `docs/tickets/ttw-248-harden-paystack-webhook-and-key-check.md` — origin.
- `docs/runbooks/webhooks-money.md` — manual procedure.
- `apps/api/src/orders/order-expiry.service.ts`, `apps/api/src/orders/paystack-webhook.service.ts`.

## Acceptance criteria

- [ ] An order left pending by an incomplete event ends settled, cancelled with stock released, or visible as a task, without manual database work.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Docs, runbook and observability are updated.

## Out of scope

- Changing the 30-minute payment window (Q16).

## Design review

To be recorded before implementation.

## Implementation reviews

To be recorded.

## Verification evidence

To be recorded.

## Completion summary

To be written at the end.
