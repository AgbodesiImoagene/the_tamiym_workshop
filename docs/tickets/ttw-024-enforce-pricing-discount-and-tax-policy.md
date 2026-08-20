# TTW-024 — Enforce pricing, discount and tax policy

**Epic:** 2 — Security and trust boundaries\
**Status:** Not started\
**Risk:** High\
**Blocked by:** TTW-003\
**Blocks:** TTW-031, TTW-032, TTW-034, TTW-035, TTW-041, TTW-053, TTW-054

## Background

The central pricing pipeline computes standard and campaign quotes, bulk tiers, discounts, shipping, VAT and rounding. However, discount exclusivity and bulk-tier overlap are enforced with application reads rather than database constraints, so concurrent admin writes can create conflicting active rules. Tax settings are mutable global values without an effective-dated policy version, and orders do not persist the quoted VAT, display-rounding adjustment or tax-policy inputs needed to reproduce a historical charge. Campaign discounts are selected with an unordered `findFirst`, making an invalid overlap resolve non-deterministically. The owner has not approved Nigeria VAT inclusivity, shipping treatment, receipts/invoices or accounting-export requirements.

## Proposal

Approve a versioned NGN v1 pricing and tax policy, then make one server pricing authority serve quote, order creation, refund allocation and display contracts. Represent mutually exclusive discount subjects and quantity-tier ranges in a form PostgreSQL can constrain under concurrent writes; reject overlapping effective windows and bulk ranges at the database boundary as well as through useful API validation. Version and effective-date tax/pricing configuration, and snapshot policy version, VAT basis/rate/amount, component totals and an explicit rounding adjustment on every order.

Keep JavaScript-number pricing only if exhaustive boundary/reconciliation evidence proves it safe for the signed NGN policy; otherwise move internal arithmetic to exact decimal/minor-unit operations in this ticket. Do not silently reinterpret historical orders when policy changes. Admin changes require preview, effective time, authorization and audit evidence; already-effective policy versions are immutable.

## Owner policy decisions

- Approve allowed discount scopes, stacking/exclusivity, priority, effective-window boundaries, redemption semantics and treatment of a discount larger than the eligible amount.
- Approve whether a bulk tier replaces base price or discounts it, product-versus-variant precedence, boundary inclusivity and whether any discounts may stack with bulk pricing.
- Approve Nigeria VAT rate/source, price inclusivity, taxable components, shipping treatment, rounding order, receipt/invoice fields and correction/effective-date process.
- Approve campaign price-floor inputs, who may schedule price changes and how carts/quotes react to a policy or price change.
- Approve accounting export fields and retention; TTW-015 remains responsible for operational reconciliation.

## Invariants

- For a subject, currency and instant, the database cannot contain discount or bulk-pricing rules that the approved policy says are mutually exclusive or overlapping.
- The authoritative order total equals its immutable component snapshots plus an explicit rounding adjustment; VAT is reproducible from the snapshotted policy and taxable basis.
- Quote and order creation use the same policy version and inputs, or creation returns a stable price-change response and creates no order/payment attempt.
- A rule/policy mutation cannot alter a historical order, refund allocation or accounting record.
- Money never uses binary floating-point unless the design review demonstrates every supported operation and boundary is exact under the signed policy.
- Admin preview and persisted activation evaluate the same validation and precedence rules.

## Implementation plan

1. Record product/finance/legal approval of the pricing, discount, bulk, campaign-floor, VAT, rounding, receipt/invoice and effective-date matrix with worked examples.
2. Inventory and report existing conflicting/invalid rows. Add versioned pricing/tax policy and normalized subject/range data that supports PostgreSQL uniqueness/exclusion/check constraints; document reversible migration and conflict remediation.
3. Make admin discount, bulk-pricing, site-setting and campaign-price mutations transactional, authorized and audited. Add immutable effective versions, dry-run/preview responses, stable validation codes and concurrency-safe activation.
4. Refactor standard/campaign quote and order creation to one deterministic rule resolver. Define bulk/discount precedence explicitly and remove unordered or first-row-wins behavior.
5. Add order snapshots for policy version, VAT rate/basis/amount, pre-round total and rounding adjustment. Backfill only values that can be derived truthfully; mark unreproducible legacy rows explicitly.
6. Make checkout detect quote/policy drift before order/payment creation and return a versioned replacement quote requiring the approved customer confirmation behavior.
7. Update refund allocation inputs in TTW-041, campaign floor/readiness in TTW-034/TTW-035, admin/customer price presentation, receipts/invoices and accounting/reconciliation exports.
8. Update Swagger, shared types, pricing/fundraising/finance docs, operator runbook, seed fixtures, metrics/alerts and PRD-to-test traceability.

## Test and observability plan

- Unit/component: signed worked examples for standard/campaign prices, discount/bulk precedence, effective-window and quantity boundaries, VAT inclusivity/shipping, fixed/percentage caps, campaign floors, rounding adjustment and admin/customer displays.
- Integration/e2e: PostgreSQL constraints, transactional admin mutations, immutable policy versions, quote-to-order snapshots, receipt/invoice output, legacy-row handling and TTW-041 allocation inputs.
- Failure, retry, and concurrency: simultaneous conflicting discounts/tiers, activate-versus-quote/order, policy effective-time boundary, duplicate admin request, stale quote, decimal extremes and rollback after a partial migration.
- Playwright: admin previews/schedules rules and sees conflict guidance; customer sees deterministic totals and explicitly handles price drift; receipt/order detail matches persisted components.
- Logs, metrics, traces, and alerts: policy/rule mutations, constraint conflicts by safe code, quote-drift rate, pricing failures, negative/irreconcilable component invariant, tax-policy version usage and rounding-adjustment distribution; no customer/order PII in labels.

## References

- `docs/17-backend-business-completeness-audit.md:32,72-73` — database constraints and signed price/VAT policy remain release-significant decisions.
- `docs/pricing-strategy.md:101-154` — bulk overlap and discount exclusivity are currently application-enforced.
- `docs/pricing-strategy.md:241-262` — VAT and rounding snapshots are insufficient to reproduce an order.
- `apps/api/prisma/schema.prisma:464-469` — one mutable site-settings row holds VAT behavior without policy version/effective dates.
- `apps/api/prisma/schema.prisma:1633-1745` — discount and bulk rules document invariants that the schema does not fully enforce.
- `apps/api/src/discounts/discounts.service.ts:69-247` — active-rule conflict detection is read-before-write application logic.
- `apps/api/src/pricing/pricing.service.ts:158-207` — VAT and display rounding are computed for the quote.
- `apps/api/src/pricing/pricing.service.ts:579-617` — campaign discount resolution uses an unordered first match.

## Acceptance criteria

- [ ] Product/finance/legal approve a versioned policy and worked examples covering every owner decision above.
- [ ] PostgreSQL rejects every prohibited concurrent discount/effective-window and bulk-range overlap; invalid legacy data has an approved report and remediation path.
- [ ] Quote, order, receipt/invoice, refund inputs and admin preview share one deterministic, versioned resolver and stable error codes.
- [ ] Every new order snapshots sufficient policy, tax, component and rounding data to reproduce its charged total exactly.
- [ ] Stale quotes and concurrent rule changes never create an order/payment using an unconfirmed replacement price.
- [ ] Admin changes are effective-dated, authorized, immutable after effect and correlated with redacted audit evidence.
- [ ] Integration and Playwright suites cover the signed examples, boundaries, conflicts, drift and migration behavior against production modules.
- [ ] Swagger/shared contracts, migrations/rollback, finance/pricing docs, receipts, observability and PRD traceability are updated.
- [ ] High-risk design, security/financial and independent implementation reviews pass with exact gate evidence.

## Out of scope

- Provider payment settlement and payment-attempt concurrency → TTW-010 and TTW-012.
- Refund settlement and policy allocation lifecycle → TTW-013 and TTW-041.
- Multi-currency, foreign tax and tax-withholding support → future international-market ticket.
- External accounting-system integration and bank-statement ingestion → follow-up after the accounting platform is selected.

## Design review

Pending. Include signed worked examples, financial data flow, exact-arithmetic decision, precedence/effective-time model, PostgreSQL constraint design, migration conflict report, quote-drift UX, receipt/invoice requirements, authorization, concurrency tests and verdict.

## Implementation reviews

Pending. Require independent implementation and financial-correctness review; add security/privacy review for exposed receipt/accounting contracts.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
