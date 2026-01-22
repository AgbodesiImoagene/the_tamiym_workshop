# Analytics & Reporting (OOTB)

## Goal (PRD-aligned)

Provide basic operational dashboards and CSV exports.
Not a full BI system.

## Recommended approach

- Implement 5–10 core metrics in the admin UI:
  - Orders per day/week
  - Revenue per day/week
  - Top products by revenue/orders
  - Refund count/value
  - Fundraiser performance snapshot (total raised, orders, goal progress)
- Support filters:
  - date range
  - campaign
  - product
- CSV exports for key tables (orders, payouts, campaigns)

## Data strategy

Use SQL queries with basic aggregation.
Avoid event pipelines in v1.
