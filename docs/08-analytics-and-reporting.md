# Analytics & Reporting (OOTB)

## Goal (PRD-aligned)

Provide basic operational dashboards and CSV exports.
Not a full BI system.

## Current implementation (TTW-036 slice 1)

Server-authoritative KPI contract: `docs/analytics/ttw-036-interim-policy.md`
**Definition version:** `analytics-kpi/v1-interim-2026-08-21`

| Surface                                 | Behaviour                                                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/admin/analytics/overview`      | Catalogue metrics + legacy aliases; Lagos date / campaign / product / status / channel / currency filters; `meta` (version, cutoff, freshness) |
| `GET /v1/admin/analytics/money-metrics` | Gross cache vs ledger-eligible vs paid-out + `meta`                                                                                            |
| `GET /v1/admin/analytics/drilldowns/*`  | Paginated orders, settlements, refunds, payouts, reconciliation findings                                                                       |
| `GET /v1/admin/analytics/export`        | `entity=orders\|campaigns` only (unknown rejected); row cap 10_000; audited                                                                    |

Money truth for revenue uses succeeded payments/refunds with settlement claims (TTW-010/013). `Campaign.currentAmount` remains a labelled gross cache.

## Recommended approach (remaining)

- Admin UI: product/campaign filter persistence, plain-language metric copy, drill-down links (later TTW-036 slices)
- Top products by revenue/orders segmentation charts
- Formal business-owner fixture sign-off
- Playwright admin analytics journey

## Data strategy

Use SQL/Prisma aggregations with one shared filter builder.
Avoid event pipelines in v1.
Display caches never substitute for reconciled / ledger values.
