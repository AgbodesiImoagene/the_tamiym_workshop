# TTW-015 — Reconcile money and inventory on a schedule

**Epic:** 1 — Financial and inventory integrity  
**Status:** Not started  
**Risk:** Critical  
**Blocked by:** TTW-003, TTW-010, TTW-011, TTW-012, TTW-013, TTW-014  
**Blocks:** TTW-042, TTW-051, TTW-054

## Background

Tamiym records payments, refunds, campaign balances, payouts, orders and inventory in separate tables and updates denormalised values such as `Campaign.currentAmount`. There is no scheduled job or durable report that proves those representations agree with each other or with Paystack. The only repair-like behaviour is a payout retry check for a dangling reservation. A silent missed/duplicated event can therefore remain undetected until a customer, organiser or finance operator reports it.

## Proposal

Add a read-only reconciliation subsystem with durable `ReconciliationRun` and `ReconciliationFinding` records, cursor/window metadata and a reproducible input snapshot. Run internal reconciliation nightly and provider reconciliation daily after Paystack's reporting window. Check payment/order/ledger/campaign totals, cumulative refunds, payout/provider/ledger state, and inventory movements/counters. Expose run and finding detail plus CSV export to admins.

Repairs are never automatic. A finding may be acknowledged, linked to an incident, or resolved by invoking an idempotent domain repair command. Money or stock repairs require a second admin, record before/after evidence and create the normal ledger/inventory/audit effects. Direct SQL is an emergency runbook step requiring an incident record and a follow-up reconciliation run.

## Owner policy decisions

- Approve the recommended zero tolerance for currency and unit discrepancies; timestamp lag may use a documented provider-settlement grace window.
- Approve nightly internal and daily Paystack reconciliation schedules, the business timezone, reporting cutoff and maximum acceptable run duration.
- Name the finance/operations owner, on-call route, P0/P1 discrepancy thresholds and acknowledgement SLO.
- Approve report/evidence retention, export access and whether two-person approval is required for every repair or only money/stock changes.
- Confirm Paystack report/API data is the external payment, refund and transfer authority; bank-statement reconciliation is a later control.

## Invariants

- A reconciliation run is repeatable for the same cutoff/window and never changes business state.
- Every finding identifies the two values compared, currency/unit, source records, severity and deterministic fingerprint; reruns do not create duplicate open findings.
- Provider fetch failure or partial pagination marks the run incomplete, never reconciled.
- No finding is closed without immutable resolution evidence and a successful post-repair run.
- Repairs use the same exactly-once business-effect keys established by TTW-010 through TTW-014 and cannot create a second financial or inventory effect.
- Reports and logs mask account numbers, tokens, provider payload secrets and customer PII.

## Implementation plan

1. Record the approved reconciliation matrix, cutoff semantics, severity rules, operational ownership and repair authority in an ADR/runbook.
2. Add migration-backed run/finding/status/fingerprint models, foreign-reference metadata and indexes for open severity, domain and cutoff. Add audit events for run, acknowledge and repair actions.
3. Add paginated, timeout-bounded read-only Paystack provider methods for transaction, refund and transfer status/report retrieval; persist normalized evidence hashes and permitted identifiers rather than unrestricted raw payloads.
4. Implement internal checks for: succeeded payment versus paid order and settlement effect; campaign `currentAmount` versus settled refunds; refund total versus capture and refund ledger effects; payout state versus reserved/released/succeeded ledger net; inventory movement/reservation truth versus `stockOnHand` and `reserved`.
5. Implement provider comparisons with explicit `MATCHED`, `MISMATCH`, `MISSING_INTERNAL`, `MISSING_PROVIDER`, `PENDING_GRACE` and `UNVERIFIABLE` outcomes. Fail closed on incomplete provider pages.
6. Add a non-overlapping scheduled job with an advisory lock, deterministic window key, bounded batching, retry/backoff and resumable cursor. Prevent two workers from owning the same run.
7. Add admin APIs and UI for summary, filters, finding evidence, CSV export, acknowledgement, incident link and approved repair execution. Require two distinct admins for financial/inventory repair.
8. Implement idempotent repair commands through payment/refund/payout/inventory domain services, then automatically schedule a targeted verification run.
9. Add dashboards, alerts and runbooks for missed schedule, incomplete run, open critical discrepancy, stale acknowledgement and failed repair. Update Swagger, shared contracts and finance/operations documentation.

## Test and observability plan

- Unit/component: each comparison outcome, fingerprint, severity, masking, grace-window and policy rule; admin evidence and repair-confirmation UI.
- Integration/e2e: seed matched and mismatched PostgreSQL ledgers/orders/refunds/payouts/inventory; paginate simulated Paystack reports; verify durable results, admin authorization, CSV formula-injection defense and targeted repair.
- Failure, retry, and concurrency: two schedulers, worker crash/resume, provider timeout/429/5xx, missing page, changed provider result, duplicate repair request and failure between repair effect/audit/post-check.
- Playwright: finance admin reviews a critical finding, cannot self-approve a repair, second admin approves, repair succeeds and a post-run closes the finding.
- Logs, metrics, traces, and alerts: run duration/status/lag, records checked by domain/outcome, open findings by severity/age, provider request failures, repair outcomes; trace by run/finding without PII.

## References

- `apps/api/prisma/schema.prisma:1219-1374` — orders, payment attempts and refunds are separate representations.
- `apps/api/prisma/schema.prisma:1383-1468` — campaign display cache and ledger have no reconciliation records.
- `apps/api/prisma/schema.prisma:1547-1590` — payout/provider state is stored independently from ledger effects.
- `apps/api/src/payouts/campaign-ledger.service.ts:7-233` — balance aggregation and the only payout-local dangling-reservation check.
- `apps/api/src/payouts/payout-runs.service.ts:59-116` — payout eligibility is computed from the internal ledger only.
- `apps/api/src/orders/refunds.service.ts:116-170` — refund, order, campaign and ledger are mutated as distinct effects.
- `apps/api/src/payouts/payout-run-scheduler.service.ts:27-101` — existing scheduled-job and request-context pattern.

## Acceptance criteria

- [ ] Owner-approved reconciliation matrix, schedules, thresholds, access, retention and repair authority are recorded.
- [ ] A migration and rollback create durable, deduplicated run/finding records without altering existing financial data.
- [ ] Nightly internal and daily provider jobs cover payment, refund, payout, campaign and inventory invariants and cannot overlap for one window.
- [ ] Incomplete/failed provider input cannot produce a successful run.
- [ ] Admins can inspect/export masked evidence; no repair occurs without the required distinct approver and audit trail.
- [ ] At least one safe repair per domain is exercised end-to-end and verified by a subsequent targeted run.
- [ ] Alerts and runbooks cover every critical outcome and a missed schedule.
- [ ] Required critical design/security reviews and two independent implementation reviews pass with exact gate evidence.

## Out of scope

- Exactly-once source effects → TTW-010 through TTW-014.
- Payout eligibility/KYC/cadence policy → TTW-042.
- General observability dashboards and release operations → TTW-051, TTW-054.
- Bank statement or accounting-system reconciliation → follow-up ticket after the owner selects an accounting integration.

## Design review

Pending. Include finance/operations ownership, threat/concurrency analysis, database fingerprints/locks, provider pagination and failure semantics, repair segregation of duties, retention/PII, migration rollback and test fixtures.

## Implementation reviews

Pending. Require two independent reviewers; one must review financial/inventory invariants and one must review security/operations.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
