# TTW-057 — Support international currencies, payouts and withholding

**Epic:** 4 — Fulfilment, support and business policy\
**Status:** Deferred — future market expansion\
**Risk:** Critical\
**Blocked by:** TTW-010, TTW-011, TTW-013, TTW-015, TTW-023, TTW-042, TTW-056\
**Blocks:** None

## Background

The schema and services are explicitly Nigeria/NGN/Paystack oriented. Although currency columns exist, defaults, minor-unit conversion, recipient type, bank validation, tax treatment and payout eligibility assume NGN and Nigerian bank accounts. Enabling another currency by configuration would risk incorrect decimal conversion, unsupported refunds/transfers, tax/withholding errors and cross-currency ledger imbalance.

## Proposal

Treat each new country/currency/payout rail as an independently approved market capability. Add a market/currency policy registry covering ISO code, minor units, rounding, supported commerce/payment/refund/payout rails, settlement currency, FX responsibility, tax/withholding and destination/KYC requirements. Orders remain single-currency and every financial effect carries its original currency; do not introduce conversion until a separately approved FX model exists.

Implement one pilot market behind a disabled-by-default feature flag only after legal/tax/provider selection. Version payout destination types and eligibility by market, calculate/store explicit withholding liabilities and statements, and extend reconciliation/accounting before accepting production value.

## Invariants

- No cross-currency arithmetic, ledger netting or payout occurs without an explicit separately balanced conversion transaction.
- Every monetary amount uses the currency's configured minor unit/rounding consistently at UI, API, provider and database boundaries.
- An order, capture, refund, campaign ledger and payout effect agree on currency; provider capability is checked before intent creation.
- Payout destination/KYC/tax eligibility is market-specific, current and snapshotted before execution.
- Withholding is an explicit liability/effect with legal basis, rate/version, taxable basis and statement evidence; it is not hidden in payout rounding.
- An unsupported market/currency fails closed and cannot fall back silently to NGN or a default provider.
- A market cannot launch until payment/refund/payout, reconciliation/accounting, support and rollback evidence pass end to end.

## Implementation plan

1. Select one pilot market and obtain legal/tax/finance/provider approval for selling entity, customer/organiser eligibility, payment methods, payout rails, KYC, VAT/sales tax, withholding, FX, fees, statements and retention.
2. Add versioned market/currency/provider capability and tax/withholding policy records; replace global/default assumptions with explicit requested market context and fail-closed validation.
3. Audit all number/minor-unit/formatting paths; use exact decimal/integer-minor-unit boundaries and currency-specific provider conversion helpers with contract tests.
4. Add market-versioned payout destinations and TTW-042 eligibility, verification, limits, cadence and policy snapshots; keep existing NGN destinations immutable.
5. Add withholding assessment/liability/release/remittance/statement models and exactly-once ledger effects with approved rounding and correction strategy.
6. Implement selected payment/refund/payout adapters and signed webhooks with capability/idempotency rules from TTW-010 through TTW-013.
7. Extend TTW-015 and TTW-056 reconciliation/journals by currency/provider/bank; prohibit close or launch when any currency is incomplete/unbalanced.
8. Add localized, accessible UI and contracts for prices, addresses, payment, payout eligibility, tax/withholding statements and safe unsupported-market messaging.
9. Add per-market feature flags, limits, dashboards/alerts, support/finance runbooks, sandbox certification, staged rollout and rehearsed market kill switch.

## Test and observability plan

- Unit/component: ISO/minor units, rounding boundaries, market capability, addresses, withholding examples/corrections and localized accessible UI.
- Integration/e2e: pilot provider simulators, currency-preserving order-to-refund/payout, destination/KYC, signed events, reconciliation and balanced journals.
- Failure, retry, and concurrency: unsupported capability, provider timeout, duplicate event, rate change, payout/refund race, rounding edge and market disabled mid-flow.
- Playwright: pilot customer completes priced checkout/refund; eligible organiser receives correctly withheld payout/statement; unsupported user is blocked before intent.
- Logs, metrics, traces, and alerts: amounts/counts by currency/market/provider, capability denial, rounding/reconciliation/withholding mismatch and rollout health without financial PII.

## References

- `apps/api/prisma/schema.prisma:9` — schema documents Nigeria-only, NGN-default and Paystack-only v1 assumptions.
- `apps/api/prisma/schema.prisma:178` — the supported-currency enum is documented as NGN-only v1.
- `apps/api/src/orders/payments.service.ts:53-89` — payment initiation converts every total to kobo and calls Paystack directly.
- `apps/api/src/payouts/payouts.service.ts:63-133` — payout recipients use Nigerian `nuban` and transfers convert amounts to kobo.
- `apps/api/src/pricing/currency-rounding.ts:44-57` — currency rounding has a default fallback that must fail closed for money-moving expansion.
- `docs/tickets/ttw-042-enforce-payout-policy-and-kyc.md` — international payouts/currencies and withholding are explicitly deferred.

## Acceptance criteria

- [ ] Legal/tax/finance/product/security approve one pilot market's entity, currencies, rails, KYC, tax/withholding, FX, fees, statements and retention.
- [ ] Unsupported market/currency/provider combinations fail closed; no implicit NGN/default fallback reaches a money-moving command.
- [ ] Exact currency-preserving order, payment, refund, ledger, withholding and payout invariants pass provider and concurrency tests.
- [ ] Market-specific destinations/eligibility and withholding liabilities/statements are immutable, versioned and auditable.
- [ ] TTW-015/056 reconciliation and accounting balance every pilot currency through provider/bank/journal evidence.
- [ ] Pilot Playwright, provider sandbox certification, staged limits/alerts/support and kill-switch rehearsal pass before production enablement.
- [ ] Critical design/security reviews and two independent implementation reviews pass with exact gate evidence.

## Out of scope

- More than one pilot market → one follow-up ticket per market after pilot review.
- Currency conversion/FX trading or cross-currency settlement → separate critical financial epic.
- Statutory filing/remittance automation → separately counselled compliance ticket.

## Design review

Pending. Include signed market/legal/tax decision, currency/effect invariants, provider capability matrix, KYC/data flows, withholding examples, reconciliation/accounting lineage, threat/concurrency analysis, staged rollout and kill switch.

## Implementation reviews

Pending. Require two independent reviewers: financial/tax/concurrency and security/privacy/compliance.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
