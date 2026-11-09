# TTW-190 — Make extra payment captures visible to reconciliation and alerts

**Epic:** 8 — Client review delivery\
**Status:** In review (implemented; e2e run and passed; independent review pending)\
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

- [x] An extra capture appears as a reconciliation finding until it is refunded (unit tests; note: it stays open until acknowledged, see Design review).
- [x] An alert exists for the extra-capture and late-capture metrics (`TamiymExtraPaymentCapture`), with a runbook section.
- [x] Integration test proves one claim and one settling payment under serial and concurrent delivery (audit-entry count is not asserted).
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Refunding the extra capture (TTW-191).
- Customer e-mail.

## Design review

**Reviewer:** Claude (self-review), 2026-11-09. Verdict: PASS, to be confirmed by the independent review.

- **Reconciliation:** one new check inside `checkPayments`: every `ChargeSettlementClaim` whose `Payment.status` is not `SUCCEEDED` becomes a finding (`MISMATCH`, severity `HIGH`, entity key `payment:<id>:extra_capture`, evidence `extra_capture_awaiting_refund` with the amount). No schema change and no new enum value. Why this identifies an extra capture: every normal settlement and every TTW-088 late capture sets the payment `SUCCEEDED` in the same transaction as the claim, so a claim on a non-`SUCCEEDED` payment can only come from `handleExtraCapture`. The check pages by claim id like the other checks.
- **Severity HIGH, not CRITICAL:** money is held and an admin was told, but nothing is corrupt.
- **Until TTW-191 exists the finding cannot close by itself:** it stays `OPEN`; an admin acknowledges it after refunding by hand (documented in the runbook). The fingerprint is per payment, so reruns deduplicate.
- **Alert:** `TamiymExtraPaymentCapture` in `docker/observability/prometheus/alerts.yml`: `increase(tamiym_charge_settlement_total{outcome=~"extra_capture|late_captured"}[15m]) > 0`, no `for` delay because the event is rare and one occurrence is enough. Limit: Prometheus `increase` ignores the very first sample of a counter that did not exist before, so the first-ever event after a fresh deploy may not alert; the reconciliation finding covers it.
- **`FAILED` guard:** `failIfStillPendingOrInitiated` now only updates a payment with no settlement claim (`settlementClaim: null`). The path was not shown reachable for a paid order (initiation is refused first), so this is defence in depth.
- **No transaction/network concerns:** nothing here calls Paystack.

## Implementation reviews

Independent review: **not done yet**.

## Verification evidence

- Failing first: `npx jest src/reconciliation/reconciliation-runs.service.spec.ts` → 2 failed (`flags a claim whose payment never became SUCCEEDED…`, `does not flag a claim whose payment is SUCCEEDED…`, no check existed); `npx jest src/orders/payments.service.spec.ts` → 1 failed (`never fails an attempt that already has a settlement claim`).
- After the change: reconciliation suite 38/38; payments service suite 34/34.
- Existing reconciliation test mocks gained a `chargeSettlementClaim.findMany` stub (additive; no assertion weakened).
- `node scripts/quality/validate-observability-artefacts.mjs` → "Prometheus alerts OK (7 groups, 19 rules)", "Observability artefact validation passed.".
- E2E, run against a real PostgreSQL 17 (`tamiym_workshop_e2e_190`, migrations applied with `prisma migrate deploy`): `npx jest --config ./test/jest-e2e.json --runInBand test/paystack-extra-capture.e2e-spec.ts` → 2 passed (`settles attempt B once and records attempt A as one extra capture under parallel delivery` — 21 deliveries, one claim, one `SUCCEEDED` payment, one admin notification; `reports the extra capture as a reconciliation-visible claim on a non-SUCCEEDED payment`).
- Neighbouring e2e suites on the same database: `paystack-charge-settlement`, `paystack-late-payment-refund`, `reconciliation`, `payment-initiation`, `paystack-refund-lifecycle` → 5 suites, 26 tests passed.
- **Finding from the real database:** a unique index allows only one active attempt per order (TTW-012). In reality the expired attempt A is therefore already `FAILED` when it is paid at Paystack, so an extra capture's `Payment.status` is usually `FAILED`, not `INITIATED`. The recording and the reconciliation query (status not `SUCCEEDED`) are unaffected; the `FAILED` guard added here is defence in depth, not a fix for a reachable path. The e2e test was corrected to seed A as `FAILED`.

Final gates (from `apps/api`, 2026-11-09):

- `npx tsc --noEmit` → exit 0.
- `npx eslint src/reconciliation src/orders/payments.service.ts src/orders/payments.service.spec.ts test/paystack-extra-capture.e2e-spec.ts` → exit 0, no output.
- `npx jest` (full API unit suite) → Test Suites: 148 passed, 148 total; Tests: 1374 passed, 1374 total.

## Completion summary

Implemented and committed on `codex/ttw-190-extra-captures-reconciliation`. E2E run on PostgreSQL: passed. Open: independent review, merge into `main`.
