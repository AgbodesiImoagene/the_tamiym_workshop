# TTW-046 — Handle chargebacks and payment disputes

**Epic:** 4 — Fulfilment, support and business policy\
**Status:** Deferred — post-v1 pending provider policy approval\
**Risk:** Critical\
**Blocked by:** TTW-010, TTW-011, TTW-013, TTW-015, TTW-041, TTW-042\
**Blocks:** None

## Background

Payments and refunds model merchant-initiated money movement, but there is no representation of a bank/provider dispute, evidence deadline, provisional debit, win/loss, fee or recovery from campaign proceeds. A chargeback arriving after fulfilment or organiser payout could silently diverge Paystack, order, campaign ledger and accounting state.

## Proposal

After finance/legal approves Paystack's dispute requirements, add an append-only `PaymentDispute` lifecycle linked to the captured payment and order, with provider case identity, reason/category, disputed amount, currency, evidence deadline, status, fees and provider outcome. Process authenticated provider events idempotently and represent every provisional/final monetary consequence as an explicit exactly-once ledger effect, never by rewriting a payment or refund.

Place affected campaign value on hold immediately under approved policy, prevent new payouts from consuming disputed value, and model recovery/negative balances when proceeds were already paid. Add a restricted finance queue for evidence submission, deadline escalation, decision recording and reconciliation.

## Invariants

- A provider dispute event produces at most one dispute transition and one financial effect.
- Disputed principal, fees, reversals and recoveries are distinct immutable effects and preserve currency.
- Opening a dispute never masquerades as a refund or automatically restores inventory.
- Payout eligibility cannot use value placed on dispute hold; already-paid value follows an approved recovery policy.
- Only authorized finance roles access or submit evidence; sensitive evidence and raw provider data are private and retained per policy.
- A provider outcome is not final internally until reconciliation verifies the corresponding balance effect.

## Implementation plan

1. Record Paystack contract/API capabilities and legal/finance policy for categories, deadlines, evidence, customer contact, fees, holds, losses, recovery, tax and retention.
2. Add dispute, transition/effect, evidence-reference and deadline models with unique provider case/event keys, exact amounts and immutable audit history.
3. Add signed webhook/poll ingestion and a deterministic provider-to-domain state mapper; quarantine unknown references or invalid transitions.
4. Extend the campaign ledger with dispute hold/release/loss/recovery effects and make TTW-042 eligibility consume the held balance atomically.
5. Add restricted finance APIs/UI for queues, evidence, deadlines, submit/accept/challenge decisions and masked provider history with segregation of duties where required.
6. Integrate dispute cases with TTW-041 support resolutions without allowing duplicate customer reimbursement or stock restoration.
7. Extend TTW-015 comparisons and repair rules to dispute principal, fee and outcome; require reconciliation before closure.
8. Add deadline/outcome alerts, notifications, reports, Swagger/contracts and incident/negative-balance runbooks.

## Test and observability plan

- Unit/component: full transition matrix, deadline/timezone rules, ledger effects, access/redaction and evidence validation.
- Integration/e2e: signed provider simulator events, hold/release/loss after payout, refund overlap, reconciliation and finance RBAC.
- Failure, retry, and concurrency: duplicate/out-of-order events, simultaneous refund/dispute/payout, evidence upload timeout, provider ambiguity and reversal after apparent win.
- Playwright: finance reviews a dispute, submits evidence, sees a deadline/outcome, and an unauthorized admin cannot access it.
- Logs, metrics, traces, and alerts: open amount/cases by state/age, deadline burn, win/loss/fee, held/negative balance and reconciliation mismatch without evidence/PII.

## References

- `apps/api/prisma/schema.prisma:1336-1374` — payment/refund models have no provider dispute relation or fee/evidence lifecycle.
- `apps/api/src/orders/refunds.service.ts:60-170` — refund handling assumes a merchant-initiated request and cannot represent bank-driven debit/reversal.
- `apps/api/src/payouts/payouts.service.ts:279-319` — provider transfer events update payouts, illustrating the event-driven pattern but not dispute effects.
- `docs/tickets/ttw-041-encode-cancellation-refund-return-policy.md` — chargebacks and bank disputes are explicitly deferred from customer resolutions.

## Acceptance criteria

- [ ] Legal/finance approve provider dispute, hold, recovery, evidence, fee, notification and retention policy.
- [ ] Migration/rollback add an idempotent, append-only dispute lifecycle without rewriting payment/refund history.
- [ ] Duplicate/concurrent provider events, refunds and payouts preserve exact principal/fee/ledger invariants.
- [ ] Disputed value is held from payout eligibility and resolved through explicit release/loss/recovery effects.
- [ ] Finance evidence/deadline operations enforce RBAC, redaction, audit and required segregation.
- [ ] TTW-015 reconciliation covers all dispute outcomes and closure requires matching provider evidence.
- [ ] Critical design/security reviews and two independent implementation reviews pass with exact gate evidence.

## Out of scope

- Customer-initiated cancellation/refund/return cases → TTW-041.
- General fraud scoring or identity-risk engine → future fraud epic.
- Civil debt collection for negative organiser balances → separate legal/operations ticket.

## Design review

Pending. Include signed financial policy, threat/data-flow model, state/effect diagrams, refund/payout races, evidence security, reconciliation and incident recovery.

## Implementation reviews

Pending. Require two independent reviewers: financial/concurrency and security/privacy.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
