# TTW-189 — Record and resolve a second payment captured for the same order

**Epic:** 8 — Client review delivery\
**Status:** Complete (rescoped: recording, metric, admin notification; the rest moved to TTW-190 and TTW-191)\
**Risk:** Critical\
**Blocked by:** client answers D1 and D2 below (recommendations in Proposal)\
**Blocks:** None (follow-ups: TTW-190, TTW-191)

## Background

Found by the independent review of TTW-088, and left out of that ticket because it concerns orders that are not cancelled. Confirm each point against current `main` before designing: the code may have moved, and TTW-088 (commit `134ac6b`, branch `codex/ttw-088-refund-payments-captured-after-cancellat`) was not merged when this ticket was written.

An order can own several `Payment` rows, one per attempt (`apps/api/src/orders/payments.service.ts`, `payment.create` around line 255; TTW-012 allows only one _active_ attempt at a time, but an expired attempt can still be paid at Paystack afterwards). Paystack can therefore capture money twice for one order. Today the second capture is neither refunded nor reported:

1. **Order already `PAID`.** In `processChargeSuccess` (`apps/api/src/orders/paystack-webhook.service.ts`, around line 123) `order.status === OrderStatus.PAID` records a `duplicate` settlement metric and returns. Nothing is stored on the second `Payment` (it stays `PENDING`), no admin is notified, no refund is started. The customer has paid twice and nobody knows.
2. **Order in any other non-`PENDING_PAYMENT` status** (for example `PROCESSING` after a manual change, or a later status). The check near line 173 (`order.status !== OrderStatus.PENDING_PAYMENT`) returns with no log, metric or notification. Same effect.
3. **Several captures on a cancelled order.** `main` notifies an admin for each one (`ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER`) and asks for a manual refund. TTW-088 refunds a single late capture automatically, but `reserveRefundRow` in `refunds.service.ts` refuses the automatic refund when more than one `Payment` is `SUCCEEDED`, so this case stays manual. The admin is told, but the system has no durable record of which captures still await a refund.

Not yet confirmed: whether the first capture of an attempt that reaches the "expired order" or "amount mismatch" branches can end up in the same silent state. Check while confirming.

## Proposal

Principle: **every captured payment is either the order's settling payment, or is recorded as an extra capture, reported, and refunded exactly once.** No capture may vanish.

1. In `processChargeSuccess`, replace the two silent returns (PAID and any other non-`PENDING_PAYMENT` status) by one path that: verifies the reference belongs to a known `Payment`; marks that `Payment` as captured but not settling the order (a status or flag that the money is held, to be chosen in the design review, with a migration if needed); logs an error; records a distinct metric (for example `charge.success.extra_capture`); and emits an admin notification (reuse `ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER` with a clear `reason`, or add an event; decide in review).
2. Refund of the extra capture, depending on decision D1: automatic, through the same refund service and the same one-refund-per-payment guarantees as TTW-088, or manual from the admin refund tools with the extra capture listed as "to refund".
3. For several captures on a cancelled order, depending on decision D2: refund each capture automatically (amount taken from each `Payment`, never from the order total), or keep it manual but recorded per payment as in point 1.
4. All Paystack calls (refund initiation) stay outside any open DB transaction. Reserve the local refund row in a short transaction, call Paystack, then finalise in a second short transaction, as the existing refund flow does.

Rejected alternatives: refunding inside the webhook transaction (would hold a transaction across a network call); summing all captures into one refund (Paystack refunds one transaction at a time).

### Decisions to validate (nothing below is applied until the user agrees)

| #   | Question                                                                                                                                   | Recommendation                                                                                                                      | Blocks                                      | Who answers                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------ |
| D1  | A second capture arrives for an order that is already paid: refund it automatically, or only report it and let an admin refund it by hand? | Always record and notify. Refund automatically only after the client agrees, as a second step.                                      | Implementation step 4 (automatic refund)    | Client (money policy); the user relays     |
| D2  | Several captures on one cancelled order: refund every capture automatically, or keep the manual path TTW-088 leaves?                       | Same answer as D1, for consistency. Record every capture either way.                                                                | Implementation step 5                       | Client                                     |
| D3  | Which customer message, if any, should say "you paid twice, we refund you"? None exists today.                                             | No customer e-mail in this ticket. Admins contact the customer until D1 is settled.                                                 | Nothing (out of scope unless the user asks) | User                                       |
| D4  | Should the extra capture reuse an existing `PaymentStatus` value or need a new one (schema migration)?                                     | Decide in the design review from the actual enum and TTW-088's changes. Prefer no new status if a flag or the refund row is enough. | Step 1 (migration)                          | Design review (technical, no client input) |

**User answer (2026-11-09):** the user approved the recommendations for D1, D2 and D3. So, until the client says otherwise: every extra capture is recorded, counted and reported to an admin, the refund stays manual (listed as "to refund"), and no customer e-mail is sent. The client has not been asked yet: automatic refund of extra captures stays blocked on the client's answer to D1 and D2. D4 is still open (design review).

D1 and D2 are business decisions, so they go to the client through the user. This ticket does not edit `revue-client/`; add them to `docs/tickets/ROADMAP.md` "Décisions à obtenir du client" (done) and to the next client message when the user decides to send one.

What stays unblocked without any client answer: recording the extra capture, the metric and the admin notification (steps 1–3). They only make an existing silent loss visible and do not move money.

## Invariants

- A captured payment is refunded at most once, even under duplicate or concurrent webhook delivery and concurrent admin actions (database-enforced, as TTW-081 does for the provider refund id).
- No successful capture is left without a trace: each one ends as the settling payment of its order, or as a recorded extra capture with an admin notification, and is visible to reconciliation (TTW-015).
- The refund amount of a payment never exceeds that payment's own captured amount.
- No database transaction stays open during a Paystack call.
- The settling path of the first capture is unchanged: one settlement claim per payment, one `PAID` transition, inventory consumed once (TTW-010, TTW-014).
- A webhook for an unknown reference stays a no-op.

## Implementation plan

1. ~~Wait for TTW-088~~ merged (859783a); branch fast-forwarded onto it.
2. Start `codex/ttw-189-handle-duplicate-payment-captures` from current `main`, in its own worktree.
3. Re-confirm the three findings in Background on `main` with failing tests (write them first, show them fail for the right reason).
4. Record the design review below (Critical): data model for the extra capture (D4), notification choice, concurrency analysis.
5. Implement recording, metric and admin notification for extra captures (no client answer needed).
6. After D1/D2: implement the chosen refund path (automatic or manual listing) with the same guards as TTW-088.
7. Update Swagger, shared contracts, migration (if any), reconciliation report and `docs/orders/ttw-041-interim-policy.md`.
8. Update this plan with any deviation.

## Test and observability plan

- Unit/component: `processChargeSuccess` with order `PAID`, `PROCESSING` and `PENDING_PAYMENT` plus a second `Payment` — the extra capture is recorded, notified and counted; the order is untouched.
- Integration/e2e: against Postgres and a fake Paystack: pay attempt A, let it expire, pay attempt B at Paystack, then deliver both webhooks. Expect one settled order and one recorded extra capture. Repeat on a cancelled order with two captures.
- Failure, retry, and concurrency: the same webhook delivered twice and concurrently; the refund call failing then retried; two admins refunding the same extra capture at once; Paystack refund id already used (TTW-081). Assert at most one refund per payment and no transaction open during the mocked Paystack call.
- Logs, metrics, traces, and alerts: error log with order id and reference; new metric `charge.success.extra_capture` (outcome label); alert when its count is above zero; reconciliation report lists unrefunded extra captures.

## References

- `apps/api/src/orders/paystack-webhook.service.ts:123` — `PAID` early return counted as `duplicate` (line numbers from `main` at `43cd1df`).
- `apps/api/src/orders/paystack-webhook.service.ts:173` — silent return when the order is not `PENDING_PAYMENT`.
- `apps/api/src/orders/paystack-webhook.service.ts:100-140` — cancelled-order path that notifies an admin (manual refund).
- `apps/api/src/orders/payments.service.ts:255` — one `Payment` created per attempt.
- `apps/api/src/orders/refunds.service.ts` (`reserveRefundRow`, branch `codex/ttw-088-refund-payments-captured-after-cancellat`) — refuses automatic late refund when more than one `Payment` is `SUCCEEDED`.
- `apps/api/src/admin-notifications/admin-notification-events.ts:11` — existing admin event for a capture that cannot settle.
- TTW-010, TTW-012, TTW-013, TTW-015, TTW-081, TTW-088.

## Acceptance criteria

- [x] A second capture on a `PAID` order, and a capture on any other non-`PENDING_PAYMENT` order, is stored, logged, counted and reported to an admin (unit tests listed in Verification evidence).
- [x] No extra capture is silently dropped. Known gap, not part of this ticket: a first capture with a different amount or currency is notified but records nothing durable (follow-up to open if the user wants it). of `processChargeSuccess`.
- [~] Moved to TTW-191 (blocked on D1/D2). Interim: manual refund from the Paystack dashboard, as approved by the user.
- [~] At most one record per payment is enforced by the unique claim and unit-tested; the real-database test moves to TTW-190, the refund part to TTW-191.
- [x] No transaction is open during a Paystack call (asserted in a test; this path makes no Paystack call).
- [x] Required quality gates pass with evidence recorded below.
- [x] Contracts, migrations, observability, and documentation are updated where applicable (no migration, no OpenAPI change; metric and policy doc updated; alert and reconciliation moved to TTW-190).

## Out of scope

- Automatic refunds for a single late capture on a cancelled order → TTW-088.
- Customer-facing e-mail about a double payment (D3).
- Preventing a second capture at Paystack (not possible from our side; TTW-012 already limits active attempts).
- Changing the 30-minute payment window.

## Design review

**Reviewer:** Claude (Sonnet 5.5, self-review), 2026-11-09. Verdict: **PASS for the unblocked part**; the refund part stays blocked on D1/D2. No independent reviewer yet (see Implementation reviews).

**Findings confirmed on `main` (859783a, TTW-088 merged):**

1. Order `PAID` + second payment: silent `duplicate` return, nothing stored (confirmed by the old test `should skip when order already PAID`, which asserted no transaction).
2. Any other non-`PENDING_PAYMENT`/non-`CANCELLED` status: silent return. Extra finding: the "expired order" check ran _before_ that status check, so a `PROCESSING` order with a past `expiresAt` would have called `cancelPendingAndReleaseInventory` and released stock that was already consumed. Moving the status check first fixes this.
3. Several captures on a cancelled order: after TTW-088 each capture whose amount and currency match is recorded (`SUCCEEDED` + claim) and notified; only the automatic refund is refused (`capturedCount > 1`). So this case already has a durable record; nothing to add.
4. Expired-order and amount/currency-mismatch branches on a first capture: an admin is notified but a mismatching capture records nothing durable. Unchanged here; possible follow-up.

**D4 decision: no new `PaymentStatus`, no migration.** An extra capture is stored as a `ChargeSettlementClaim` for its `Payment` (unique per payment and per `(provider, businessKey)`) plus the webhook payload in `Payment.rawEvent`, while `Payment.status` is left unchanged. Reason: marking it `SUCCEEDED` would be wrong because (a) `reserveRefundRow` and the refund lookups pick the _oldest_ `SUCCEEDED` payment of the order, and an expired attempt A paid after B settled is older than the settling payment B, so a normal admin refund would hit the wrong payment; (b) reconciliation (TTW-015) treats `SUCCEEDED` payments as the order's settled money. The claim gives exactly-once recording under duplicate and concurrent delivery (unique index) and makes the capture findable (claim with `Payment.status != SUCCEEDED`).

**Notification:** reuse `ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER` with a clear `reason` (no new event, no route to configure).

**Concurrency / failure analysis:** the claim insert, the `rawEvent` update and the audit entry share one short transaction; a lost race (P2002) is a duplicate and sends no second notification. Notification and metrics happen after commit. No Paystack call exists in this path, so no transaction is open during a network call (asserted by test).

**Known limit:** the admin refund tools cannot yet target an extra capture (they look up `SUCCEEDED` payments), so the notification tells the admin to refund from the Paystack dashboard. A "refund extra capture" tool belongs to the blocked D1/D2 work.

**Residual risk:** the notification is best-effort after commit; if the process dies between commit and emit, the capture is recorded but no admin is told. The alert on the metric and a reconciliation listing of unrefunded extra captures are not built yet.

## Implementation reviews

**Review 1 — independent subagent (read-only), 2026-11-09. Verdict: PASS for the declared scope** (recording, metric, admin notification, manual refund). Dimensions: correctness PASS; concurrency PASS (unique index, P2002 handled, no network call in a transaction); security/data PASS with reserves; tests PASS (unit; no real-database test); docs PASS with one reserve. It re-ran `npx jest src/orders/paystack-webhook.service.spec.ts`: 31/31 passed. No blocking finding.

Findings and how they are handled:

1. **Medium — admin notification lost if `adminNotify.emit` fails after the commit** (`paystack-webhook.service.ts`, same pattern as TTW-088). The webhook answers 500, Paystack redelivers, the claim exists so the redelivery is a `duplicate` and the admin is never told. Logs and metrics are emitted before `emit`, so the capture stays visible there. **Decision (user, 2026-11-09): option B** — keep the log and the metric, and wire an alert on `charge.success.extra_capture` later; do not move the admin outbox write into the transaction here (TTW-088 has the same pattern, so a fix belongs in a separate ticket for both). Risk accepted until the alert exists.
2. **Medium — extra captures are invisible to reconciliation (TTW-015) and analytics**, which only read `Payment.status = SUCCEEDED`. This is the known cost of D4. The invariant "visible to reconciliation" stays **unmet**; acceptance criteria left unchecked.
3. **Low — the extra `Payment` could later be set to `FAILED`** by `failIfStillPendingOrInitiated` (`payments.service.ts`). Not shown reachable for a `PAID` order (initialisation is refused when the order is not `PENDING_PAYMENT`). The durable marker is the claim and the audit entry, not the status.
4. **Info — gaps in tests:** no test of `adminNotify.emit` failing, no assertion on the audit content, no real-database test.

**Not closable yet:** reconciliation listing, alert on `charge.success.extra_capture`, refund path (D1/D2), and a Postgres integration test remain open.

## Verification evidence

Environment: Node v24.22.1; `prisma generate` run in the worktree (generated client is not versioned).

- Failing first (before the code change), `npx jest src/orders/paystack-webhook.service.spec.ts`: 6 failed, 25 passed. Failures: `records the capture, counts it and notifies an admin when the order is PAID / PROCESSING / FULFILLED`, `still records and reports a capture whose amount differs from the order total`, `never opens a transaction while notifying…`, plus one TTW-088 test polluted by an unconsumed `mockRejectedValueOnce` from my new race test (passes once the code consumes it). Reason: no claim created, no admin notification, no metric.
- After the change: `npx jest src/orders src/observability` → 14 suites, 228 tests passed.
- Test replaced on purpose: `should skip when order already PAID` (asserted the silent drop this ticket removes) is replaced by the `extra capture` describe block in `apps/api/src/orders/paystack-webhook.service.spec.ts`.
- New tests: `records the capture, counts it and notifies an admin when the order is %s` (PAID, PROCESSING, FULFILLED), `still records and reports a capture whose amount differs…`, `treats a lost claim race as a duplicate: no second notification`, `ignores a redelivery once the extra capture is recorded`, `does not record a charge that Paystack did not report as successful`, `never opens a transaction while notifying…`.

Final gates (from `apps/api`, 2026-11-09):

- `npx tsc --noEmit` → exit 0, no output.
- `npx eslint` on the 3 touched source files → exit 0, no output.
- `npx prettier --check` on the touched files and this ticket → all formatted.
- `npx jest` (full API unit suite) → Test Suites: 148 passed, 148 total; Tests: 1371 passed, 1371 total.

**Not verified:** no Postgres/Docker in this session, so the integration/e2e test (two attempts paid, two webhooks, concurrent delivery against the real unique index) is **not written or run**. Reconciliation listing and an alert rule on `charge.success.extra_capture` are not built.

## Completion summary

Shipped: extra captures on non-`PENDING_PAYMENT`/non-`CANCELLED` orders are recorded (claim + audit), logged, counted (`charge.success.extra_capture`, settlement outcome `extra_capture`) and reported to an admin; the stray stock release on a non-pending order with a past `expiresAt` is gone. No migration, no OpenAPI change, no customer e-mail. Independent review: PASS for this scope (see Implementation reviews). Moved out: reconciliation visibility, alert, real-database test, `FAILED` guard → TTW-190; refund → TTW-191 (blocked on D1/D2). Unrelated follow-up for the user: TTW-088 and TTW-189 share the same "admin notification lost after commit" weakness.
