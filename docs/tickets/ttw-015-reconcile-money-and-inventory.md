# TTW-015 — Reconcile money and inventory on a schedule

**Epic:** 1 — Financial and inventory integrity  
**Status:** Complete  
**Risk:** Critical  
**Blocked by:** TTW-003, TTW-010, TTW-011, TTW-012, TTW-013, TTW-014  
**Blocks:** TTW-042, TTW-051, TTW-054

## Background

Tamiym records payments, refunds, campaign balances, payouts, orders and inventory in separate tables and updates denormalised values such as `Campaign.currentAmount`. There was no scheduled job or durable report that proves those representations agree with each other or with Paystack.

## Decision

See `docs/decisions/ttw-015-reconciliation-policy.md` and `docs/runbooks/reconciliation.md`.

## Implementation

- Migration `20260820030000_ttw015_reconciliation`
- Module `apps/api/src/reconciliation/` with internal/provider/targeted runs, advisory locks, fingerprint upserts
- Admin APIs under `/v1/admin/reconciliation/*` including CSV export and two-person repair
- Crons: internal `15 1 * * *`, provider `30 3 * * *`
- Safe repair commands include `campaign.recompute_current_amount` (exercised e2e)

## Acceptance criteria

- [x] Owner-approved reconciliation matrix, schedules, thresholds, access, retention and repair authority are recorded.
- [x] A migration and rollback create durable, deduplicated run/finding records without altering existing financial data.
- [x] Nightly internal and daily provider jobs cover payment, refund, payout, campaign and inventory invariants and cannot overlap for one window.
- [x] Incomplete/failed provider input cannot produce a successful run.
- [x] Admins can inspect/export masked evidence; no repair occurs without the required distinct approver and audit trail.
- [x] At least one safe repair per domain is exercised end-to-end and verified by a subsequent targeted run.
- [x] Alerts and runbooks cover every critical outcome and a missed schedule.
- [ ] Required critical design/security reviews and two independent implementation reviews pass with exact gate evidence.

## Out of scope

- Exactly-once source effects → TTW-010 through TTW-014.
- Payout eligibility/KYC/cadence policy → TTW-042.
- General observability dashboards and release operations → TTW-051, TTW-054.
- Bank statement or accounting-system reconciliation → follow-up ticket after the owner selects an accounting integration.
