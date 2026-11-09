# TTW-088 — Refund payments captured after an order was cancelled

**Epic:** 8 — Client review delivery\
**Status:** Implemented, local commit only (not merged)\
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

- [x] An admin can refund a late payment from the system, and it settles exactly once.
- [x] Swagger, shared contracts, migrations and docs are updated where applicable.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Date: 2026-11-09. Author: implementing session. Status: **recorded before implementation; reviewed together with the implementation (see below)**.

**Finding confirmed on `main` (43cd1df).**

- `paystack-webhook.service.ts` (`charge.success`, cancelled branch): it logs "Manual refund required", notifies admins and returns. The `Payment` stays `INITIATED`, so no captured money is recorded.
- `refunds.service.ts` (`reserveRefundRow`) needs `Payment.status = SUCCEEDED` and an order in `REFUNDABLE_ORDER_STATUSES` (not `CANCELLED`). `evaluateRefundEligibility` refuses `CANCELLED` as terminal. So the refund can never start.
- The same dead end exists in the "expired but still `PENDING_PAYMENT`" branch of `charge.success`: the order is cancelled, the money is not recorded.

**Decision (Q16 default, approved by the user on 2026-11-09).** Keep the 30 min window. A captured late payment on a cancelled order becomes refundable by an admin, as its own eligibility case. No automatic refund, no order re-confirmation.

**Design.**

1. _Record the capture._ On `charge.success` for a `CANCELLED` order, or an expired one cancelled on the spot, with matching amount and currency, one transaction creates the `ChargeSettlementClaim` (unique `(provider, businessKey)`) and sets `Payment.status = SUCCEEDED`. The order stays `CANCELLED`. No inventory consumption, no campaign amount, no ledger entry: none of them was ever applied. Redelivery hits the existing claim check and counts as a duplicate. A mismatching amount or currency keeps today's behaviour (rejected, admin notified, nothing recorded).
2. _No schema change._ A `SUCCEEDED` payment on a `CANCELLED` order is itself the marker: cancellation is only allowed on unpaid orders, so a normal cancelled order never has one.
3. _Distinct eligibility case._ New reason code `LATE_PAYMENT_AFTER_CANCELLATION`, allowed only when the order is `CANCELLED` and `hasCapturedPayment` is true. Every other reason on a cancelled order stays `REFUND_NOT_ALLOWED_TERMINAL`. The reason is refused on any non-cancelled order.
4. _Full refund only._ For this case the amount must equal the captured amount. This keeps the cap logic and the order state simple.
5. _Settlement._ `settleRefundProcessed` already locks the order and enforces the at-most-once claim. When the locked order is `CANCELLED`, it skips the campaign `currentAmount` decrement and the `REFUND_APPLIED` ledger entry, because the matching credit never existed. The order ends `REFUNDED`.
6. _Admin notification_ keeps its event; its wording now says the payment is recorded and refundable.

**Invariants and how they are enforced.**

- At most one refund per captured payment: existing `reserveRefundRow` (`FOR UPDATE` on the order plus cumulative cap), the idempotency key unique constraint, `RefundSettlementClaim` and the `(provider, providerRef)` unique constraint (TTW-081). With a full-amount-only rule, a second reservation is refused by the cap.
- A cancelled order without captured money stays non-refundable: eligibility needs a captured payment.
- No transaction across Paystack: unchanged, `driveProviderForReservedRefund` calls Paystack outside any transaction.

**Threats and concurrency.**

- Duplicate or parallel `charge.success`: the claim unique key lets one win; the loser counts as duplicate.
- Late webhook racing the refund: the refund needs `SUCCEEDED`, which is only written in the transaction that holds the claim.
- Late webhook racing the expiry job: out of scope, unchanged (see Out of scope).
- Money reaching the campaign by mistake: covered by the skip in point 5 and an e2e assertion on `currentAmount` and ledger entries.

**Tests planned (written first).** Unit: eligibility matrix, webhook late-capture branches, refund reservation and settlement for cancelled orders. Integration on real Postgres: late charge webhook then refund, sequential and parallel duplicates of both the webhook and the refund call, Paystack refusal and timeout keeping the refund retryable, campaign totals untouched.

## Implementation reviews

**Review 1 (independent fresh-context reviewer, critical charter: financial, database, concurrency), 2026-11-09. Verdict: PASS (conditional).**

- Invariants confirmed by reading the code: one refund per captured payment under duplicates, no refund for a cancelled order without captured money, no transaction across Paystack, campaign and ledger untouched.
- Finding 1 (medium): an order can have several payments (one per attempt). If several are captured late, a full refund of the oldest one would make the order `REFUNDED` and strand the others. **Fixed:** the late-payment reservation refuses when more than one captured payment exists (`refunds.service.ts`, unit test and e2e `refuses the late refund when several captured payments exist`). The several-payments case stays a manual case: see Completion summary.
- Finding 2 (low): the gate checks "any captured payment" while the refund uses the oldest. Only differs in the several-payments case, now refused. `recordLateCapture` compares the webhook amount with `order.totalAmount`, and payments are created with that amount today. Not changed.
- Finding 3 (low, pre-existing): a locally `FAILED` refund can be reconciled to `SUCCEEDED` later; a second refund could then double-settle. Mitigated by TTW-081. Not in scope here.
- Finding 4 (test gaps): added e2e for the expired-but-pending branch. Not added: a test where `recordLateCapture` throws a non-unique error, and a provider `failed` then `processed` sequence.

## Verification evidence

Run in `.claude/worktrees/ttw-088` on Node v24.22.1, against a throwaway Postgres 17 on port 55432 (migrations applied with `prisma migrate deploy`) and the local Redis (`REDIS_DB=15`).

- Red first: with the tests written and no implementation, `jest` on `resolution-policy`, `refunds.service` and `paystack-webhook.service` specs gave `Tests: 7 failed, 89 passed`, each failure on the missing behaviour. The e2e file was written before the implementation but not run red separately.
- `pnpm --filter api test`: `Test Suites: 148 passed`, `Tests: 1363 passed` (before the last review fix); after it, `jest src/orders`: 12 suites, 213 tests passed.
- `pnpm --filter api test:e2e` on `paystack-late-payment-refund`, `paystack-refund-lifecycle`, `paystack-charge-settlement`, `refund-provider-ref-uniqueness`: `Test Suites: 4 passed`, `Tests: 23 passed`. The full e2e suite was not run.
- `pnpm typecheck`: 6 tasks successful. `pnpm lint`: 0 errors (api 14 warnings, admin 21; not compared with `main`).
- `pnpm format:check`, `pnpm docs:validate`, `pnpm openapi:check`, `pnpm observability:validate`, `pnpm playwright:validate`: passed.
- `pnpm --filter api test -- --coverage`, `pnpm coverage:ratchet`: passed (statements 83.13%, floors unchanged). `pnpm coverage:diff` vs `origin/main`: 38/41 lines (92.68%), floor 80%.
- Not run: `pnpm build`, `pnpm audit`, Playwright (no UI change).

## Completion summary

Done:

- `charge.success` on a cancelled order (or an expired one cancelled on the spot) now records the capture when amount and currency match: claim plus `Payment.SUCCEEDED`, order stays `CANCELLED`, no stock, campaign or ledger effect. Metric outcome `late_captured`.
- New refund reason `LATE_PAYMENT_AFTER_CANCELLATION` and code `REFUND_ALLOWED_LATE_PAYMENT`: only for a `CANCELLED` order with a captured payment, full amount only, one captured payment only. Other reasons on a cancelled order stay refused.
- Settlement of that refund skips the campaign decrement and `REFUND_APPLIED` entry; the order ends `REFUNDED`.
- OpenAPI and generated types regenerated (new enum value). `docs/orders/ttw-041-interim-policy.md` updated.

Deviations from the plan: none on the design. Added the several-payments guard after review.

Left for later:

- Several captured payments on one order (and a second capture on a `PAID` order, which is silently ignored today, pre-existing) need their own ticket or a client rule.
- Q16 is still open with the client; this implements the default. If the client prefers card-only payment, this ticket stays valid but is needed less.
- Frontends: no admin UI lists refund reasons today, so nothing changed there.
- Not merged, not pushed, no PR (by request).
