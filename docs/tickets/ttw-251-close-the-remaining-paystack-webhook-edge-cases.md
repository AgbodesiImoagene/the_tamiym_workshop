# TTW-251 — Close the remaining Paystack webhook edge cases

**Epic:** 2 — Security and trust boundaries\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

Reported, not fixed, by the independent reviews of TTW-248 (2026-11-22). None loses money today.

1. **No de-duplication of admin notifications.** Each repeated incomplete `charge.success` sends a new admin notification (`PaystackWebhookService`).
2. **Extra capture does not check amount or currency.** `handleExtraCapture` (order already `PAID`) and the path where `status !== 'success'` record a claim without requiring or checking `amount` and `currency`.
3. **A string `amount` follows the old mismatch path.** An `amount` sent as a string is neither treated as missing nor compared as a number.
4. **A stale line in the setup docs.** `docs/11-development-setup.md` (about line 70) still lists `PAYSTACK_WEBHOOK_SECRET`; the code reads only `PAYSTACK_SECRET_KEY`.

## Proposal

Fix 1 to 4 with the smallest changes, in the design review order of risk. For 2 and 3, fail closed like TTW-248 and keep the money recorded for refund. Rejected: changing the settlement claim table.

## Invariants

- Duplicate and concurrent delivery still settles exactly once.
- Captured money is always recorded for refund when the order cannot use it.
- No secrets or PII in logs.

## Implementation plan

1. Design review, then tests first (unit and real Postgres e2e), then implementation, gates and independent review.

## Test and observability plan

- Unit and e2e for each case, including repeated and concurrent deliveries; metric labels for the new rejections.

## References

- `docs/tickets/ttw-248-harden-paystack-webhook-and-key-check.md` — origin.
- `apps/api/src/orders/paystack-webhook.service.ts`, `docs/runbooks/webhooks-money.md`.

## Acceptance criteria

- [ ] Each of the four points is fixed or explicitly declined with a reason in the design review.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Docs, runbook and observability are updated.

## Out of scope

- Orders stuck after an incomplete event → TTW-249.

## Design review

To be recorded before implementation.

## Implementation reviews

To be recorded.

## Verification evidence

To be recorded.

## Completion summary

To be written at the end.
