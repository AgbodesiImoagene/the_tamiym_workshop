# TTW-036 — Complete analytics contracts and operational drill-downs

**Epic:** 3 — Complete customer and fundraiser revenue journeys\
**Status:** In progress\
**Risk:** High\
**Blocked by:** TTW-003, TTW-010, TTW-013, TTW-015, TTW-031, TTW-034\
**Blocks:** TTW-051, TTW-053, TTW-054

## Background

Admin analytics expose aggregate order, revenue, campaign, payout and ledger values, plus order/campaign CSV exports. The definitions are embedded in queries and comments rather than an owner-approved metric contract. The overview accepts only a date window, exports silently treat unknown entities as orders, and there is no product/campaign segmentation or path from a KPI discrepancy to its source orders, settlements, refunds and reconciliation findings. Operators can see totals but cannot consistently explain or reproduce them.

## Proposal

Approve a versioned analytics metric catalogue and make API, admin UI, exports and operational documentation implement the same definitions. Add validated business-timezone date windows and product/campaign/status/channel filters to relevant metrics and exports. Provide permission-safe drill-downs from headline revenue, campaign and payout values to paginated source records and TTW-015 reconciliation findings. Return freshness, cutoff, currency and applied-filter metadata with every aggregate response.

Analytics remain read-only. Financial truth comes from settled payment/refund/ledger records established by TTW-010, TTW-013 and TTW-015; display caches are labelled and never substituted for reconciled values. Reject unknown filters, reversed windows, unsupported currencies and unbounded exports rather than silently changing semantics.

## Owner policy decisions

- Approve the KPI catalogue: gross order value, settled revenue, refunded value, net revenue, campaign gross raised, eligible ledger balance, paid-out value, order conversion/count and active-campaign count.
- Approve inclusion/exclusion rules for pending, failed, cancelled, refunded, test and manually adjusted records.
- Approve business timezone, inclusive/exclusive date boundaries, reporting cutoff, freshness SLO and currency policy.
- Approve allowed product, campaign, order-status, payment-status and sales-channel dimensions, including whether organiser access to any analytics is a later feature.
- Name the business owner who signs off fixture totals and metric-definition changes.

## Invariants

- A named metric has one versioned definition across API, UI, CSV and documentation.
- Money aggregates use integer/decimal database arithmetic and explicit currency grouping; no binary floating-point summation or implicit currency conversion is permitted.
- Applying the same cutoff and filters to an aggregate, export and drill-down produces reproducible totals from one documented source-of-truth set.
- Pending or failed provider events cannot be reported as settled revenue or completed payouts.
- Refunds and reversals affect the approved net metrics exactly once.
- Analytics endpoints are read-only, admin-authorized, paginated or bounded, and do not expose unnecessary customer PII.
- Response and export metadata identify metric version, generated-at time, data cutoff, timezone, currency and applied filters.

## Implementation plan

1. Record the owner-approved metric catalogue, source fields, lifecycle inclusion matrix, dimensions, cutoff/timezone rules, freshness SLO and worked fixture examples in a versioned ADR.
2. Introduce shared validated analytics query DTOs for date range, campaign, product, order/payment status, channel, currency, pagination and export limits. Reject unknown entities and invalid or excessive ranges.
3. Refactor repeated aggregate/filter construction into production analytics query modules with a single clock/cutoff and explicit money-source semantics. Preserve backwards compatibility only where it matches the approved catalogue.
4. Add segmented overview responses and paginated drill-down endpoints for orders, settlements/refunds, campaign ledger movements, payouts and TTW-015 reconciliation findings. Return filter/freshness/definition metadata.
5. Update CSV generation to use the same query contract and totals, stream or page bounded results, preserve formula-injection protection and audit privileged exports without logging PII.
6. Update the admin analytics experience with date and product/campaign filters, plain-language metric definitions, freshness/cutoff state, empty/error states and links from material totals or mismatches to their drill-downs.
7. Update Swagger, shared client contracts, analytics documentation and TTW-051 dashboard/alert inputs. Add a change-control requirement for future metric-definition changes.
8. Seed deterministic cross-lifecycle fixtures and obtain business-owner sign-off that API aggregates, UI labels, exports, drill-down sums and reconciliation evidence agree.

### Slice 1 progress (this branch)

- [x] Interim policy doc + design review (formal finance/ops sign-off deferred)
- [x] Shared validated query DTO + pure contract helpers (Lagos window, reject unknown entity/currency/channel/reversed/oversized)
- [x] Shared filter builders; overview/money metrics use catalogue definitions + `meta`
- [x] Drill-downs: orders, settlements, refunds, payouts, reconciliation findings
- [x] Export entity vocabulary, row cap, formula-injection escape, export audit
- [x] Docs (`08-analytics`, README index) + admin client filter/meta types
- [ ] Admin UI filter persistence / drill-down links / Playwright (later slices)
- [ ] Deterministic PostgreSQL fixture sign-off (later slices)
- [ ] Formal business-owner KPI sign-off

## Test and observability plan

- Unit/component: every KPI inclusion matrix; timezone and boundary handling; combined filters; currency grouping; refund/reversal semantics; invalid ranges/entities; UI definitions, filter persistence and freshness states.
- Integration/e2e: production analytics modules against PostgreSQL fixtures covering paid/pending/failed/cancelled/refunded orders, multiple products/campaigns, ledger holds and payouts; prove aggregate/export/drill-down parity and role/PII boundaries.
- Failure, retry, and concurrency: concurrent settlement/refund while a cutoff-bound query runs, empty dimensions, stale/incomplete reconciliation data, export limit exceeded, database timeout and cancellation.
- Playwright: admin selects a campaign and product/date range, verifies approved KPI fixture values, drills into a discrepancy, downloads a matching safe CSV, reloads with filters preserved and sees honest stale/error states.
- Logs, metrics, traces, and alerts: query/export latency and failures by operation (not filter values), result size, rejected/oversized query count, data-freshness lag and drill-down/export audit events; never record customer PII or raw search values.

## References

- `docs/17-backend-business-completeness-audit.md:45` — KPI sign-off, product/campaign filters and reconciliation drill-down are incomplete.
- `apps/api/src/analytics/dto/analytics-query.dto.ts` — validated multi-dimension query contract.
- `apps/api/src/analytics/analytics-contract.ts` — versioned definitions, Lagos window, freshness.
- `apps/api/src/analytics/analytics.controller.ts` — overview, money-metrics, drill-downs, export.
- `apps/admin/lib/dashboard.ts` — admin client overview/export filters + meta types.

## Acceptance criteria

- [ ] The business owner approves a versioned KPI catalogue with lifecycle, cutoff, timezone, currency and fixture examples.
- [x] Overview, exports and drill-downs accept the approved validated dimensions and reject unknown, reversed, unsupported or excessive queries. _(slice 1 API)_
- [ ] Deterministic integration fixtures prove aggregate, CSV and drill-down parity for settlement, partial/full refund, reversal, payout and ledger-hold paths.
- [ ] Admins can filter by product and campaign, understand each metric and navigate material values or discrepancies to bounded source evidence.
- [x] Every response/export exposes definition version, freshness/cutoff, timezone, currency and applied-filter metadata. _(aggregates/drill-downs; export audited with version)_
- [x] Authorization, PII minimization, export auditing and CSV formula-injection defenses have high-risk security and integration coverage. _(unit coverage in slice 1; e2e/Playwright deferred)_
- [x] Swagger, shared contracts, analytics documentation and TTW-051 observability inputs are updated together. _(Swagger + docs; TTW-051 alert wiring deferred)_
- [ ] Required quality gates and independent design, security and implementation reviews pass with exact evidence.

## Out of scope

- Repairing financial or inventory discrepancies → TTW-015.
- General infrastructure dashboards, alert routing and SLO response → TTW-051.
- Organiser-facing self-service analytics or custom report building → a separately approved post-release ticket.
- Cross-currency conversion and financial accounting integration → TTW-056 and TTW-057.

## Design review

### Slice 1 design review (2026-08-21)

**Date:** 2026-08-21\
**Risk:** High\
**Policy version:** `analytics-kpi/v1-interim-2026-08-21`\
**Verdict:** Proceed with interim policy (formal finance/operations business-owner sign-off deferred)

| Topic         | Decision                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Authority     | Server contract modules; clients never invent metric inclusion                                                    |
| Money truth   | Succeeded payments/refunds with settlement claims; ledger for eligible; payout SUCCEEDED for paid-out             |
| Gross cache   | `Campaign.currentAmount` labelled; never substituted for ledger                                                   |
| Timezone      | Africa/Lagos; inclusive start / exclusive next-day end                                                            |
| Dimensions    | date, campaign, product, orderStatus, paymentStatus, derived channel STORE/FUNDRAISER, NGN only                   |
| Export        | Reject unknown entity; max 10_000 rows; audit without new PII fields                                              |
| Drill-downs   | Orders / settlements / refunds / payouts / open reconciliation findings; id-centric, no email on JSON drill-downs |
| Freshness     | 26h SLO vs latest completed reconciliation run                                                                    |
| Compatibility | Legacy `totalRevenue` = settledRevenue; admin flat fields retained                                                |
| Deferred      | UI polish, Playwright, fixture sign-off, organiser analytics, TTW-051 alert inputs                                |

**Blast radius:** `apps/api/src/analytics/*`, admin dashboard client types, analytics docs. Callers: admin overview/export. No schema migration.

**Test plan:** Pure contract unit tests; service/controller specs for filters, meta, drill-downs, export audit/reject; diff coverage ≥80% on touched api src.

## Implementation reviews

Pending. Require an independent implementation review plus security review; finance/business ownership must sign off the final deterministic fixture totals. Dual reviews left for parent after slice 1 commit.

## Verification evidence

### Slice 1 gates (2026-08-21)

```text
pnpm --filter api exec tsc --noEmit
# pass
pnpm --filter api test:coverage
# 127 suites / 1102 tests pass
pnpm coverage:diff
# Diff coverage 125/154 lines (81.17%) — pass (floor 80%)
git diff --check
# clean
```

Policy: `docs/analytics/ttw-036-interim-policy.md` (`analytics-kpi/v1-interim-2026-08-21`)
Tests: `analytics-contract.spec.ts`, `analytics-filters.spec.ts`, `analytics.service.spec.ts`, `analytics.controller.spec.ts`

## Completion summary

Slice 1 interim analytics contracts shipped locally. Full ticket remains open for admin UI polish, Playwright, deterministic fixture sign-off, formal business-owner approval, and dual implementation/security reviews.
