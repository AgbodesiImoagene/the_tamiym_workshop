# TTW-223 — Expire abandoned INITIATED payments and release the reserved stock

**Epic:** 8 — Client review delivery  
**Status:** Not started  
**Risk:** Critical  
**Blocked by:** Decision on the abandonment delay (see "Client decisions" below)  
**Blocks:** None

Origin: adversarial read-only review of the money flows (finding B1), 2026-11-15. Nothing was executed during that review; every claim below must be re-proved by the failing test written first.

## Background

`OrderExpiryService` cancels unpaid orders after their deadline, but it skips every order that has a `Payment` in status `INITIATED`, whatever the age of that payment (`apps/api/src/orders/order-expiry.service.ts:68-85`). The comment says the order "will be cancelled once the payment webhook settles".

A customer who opens the Paystack checkout and closes the tab never produces a webhook. The payment stays `INITIATED` and the order stays pending, so its stock reservation is never released. On a limited-stock product or campaign this blocks other buyers for an unbounded time. No money is lost; availability is.

Second origin (2026-11-22, [TTW-249](ttw-249-unstick-orders-after-an-incomplete-payment-event.md), merged here): since TTW-248, a signed `charge.success` without `amount` or `currency` is not settled and leaves the payment `INITIATED` and the order pending. It is stuck for the same reason, and the same fix covers it. The runbook `docs/runbooks/webhooks-money.md` (section "Incomplete `charge.success`") describes the manual steps until this ticket ships.

Not yet checked (must be read before the design review): whether another job or the reconciliation module already fails or expires old `INITIATED` payments.

## Client decisions

- How long after the order deadline is an `INITIATED` payment treated as abandoned (grace margin around the 30-minute window)? Related to Q16 and finding I6 (a customer who pays at 29 min 50 s while the webhook arrives after 30 min). Recommendation to propose, not to apply without approval: grace of a few minutes, then ask Paystack for the transaction status before cancelling.

## Proposal

To be confirmed at the design review:

1. After the agreed delay, the expiry job asks Paystack for the real status of the `INITIATED` payment (provider interface, not a direct call) outside any DB transaction.
2. Paid at Paystack: settle through the existing `charge.success` path (do not duplicate settlement logic). Abandoned or failed: mark the payment `FAILED`/`ABANDONED` with a conditional transition, then cancel the order and release the stock in one transaction.
3. Provider unreachable: skip and retry on the next run, with a log and a counter. Never cancel on a guess.
4. A late `charge.success` after the cancellation keeps going through the existing late-payment path (TTW-088).

Rejected for now: cancelling on age alone without asking Paystack (would cancel orders that were actually paid).

## Invariants

- An order paid at Paystack is never cancelled by the expiry job.
- Stock is released exactly once per cancelled order (no double release, no release without cancellation).
- State changes use conditional transitions (`updateMany ... where status = ...`), not pre-reads.
- No DB transaction stays open across the Paystack call.
- Payments in `PROCESSING` keep their current protection.

## Implementation plan

1. Write failing tests (see below), including the reproduction of B1.
2. Design review (critical): threat and concurrency analysis, then client decision on the delay.
3. Implement the status check and the conditional transitions.
4. Update the orders interim policy doc (`docs/orders/ttw-041-interim-policy.md`) and the roadmap.
5. Independent implementation review.

## Test and observability plan

- Unit: expiry service with provider answering paid / abandoned / failed / unreachable.
- Integration (real Postgres): INITIATED payment older than the delay releases stock; paid payment does not get cancelled.
- Concurrency: expiry job running at the same time as a `charge.success` webhook for the same order; two expiry runs at once. Exactly one outcome, stock consistent.
- Retry: provider error leaves the order untouched and counted.
- Observability: counter for expired-abandoned and for provider-check failures; reconcile with the existing expiry log lines.

## References

- `apps/api/src/orders/order-expiry.service.ts:68-85` — the skip.
- `docs/orders/ttw-041-interim-policy.md` — order state machine.
- TTW-088 — late payment handling.

## Acceptance criteria

- [ ] A test fails today, showing an abandoned `INITIATED` order never expires; it passes after the change.
- [ ] A paid-at-Paystack order is never cancelled by the job (test).
- [ ] An order left pending by an incomplete `charge.success` (payment `INITIATED`, no settlement claim) is settled or cancelled with its stock released by the job (test, TTW-249 case); the runbook section is updated.
- [ ] Concurrent expiry and webhook leave one consistent state and correct stock (real Postgres).
- [ ] Client decision on the delay recorded in this ticket and in `ROADMAP.md`.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Docs and observability updated.

## Out of scope

- Finding I6 beyond the grace margin (rewriting the 30-minute rule).
- Reconciliation severity for late payments on cancelled orders → separate ticket if confirmed.

## Design review

Not done yet. Required before implementation (critical).

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not started.
