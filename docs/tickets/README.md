# Tamiym delivery backlog

This is the ordered delivery map derived from the 2026-08-18 code/security review, the Playwright strategy, and the backend business-completeness audit. Every row links to a scoped implementation contract. `Scoped` means the current evidence, boundaries, dependencies, implementation sequence, tests, observability and acceptance criteria are recorded; owner policy decisions inside the ticket must still be approved at design review before implementation.

## Priority model

- **P0:** correctness/security/release foundation; blocks safe business use.
- **P1:** closes a core PRD actor journey or operating requirement.
- **P2:** hardening, scale, usability, or evidence needed before broad release.
- Within a priority, respect dependencies and avoid overlapping critical schema work in parallel.

## Epic 0 — Trustworthy delivery system

| Ticket                                                | Priority | Risk     | State    | Outcome                                                                                  |
| ----------------------------------------------------- | -------- | -------- | -------- | ---------------------------------------------------------------------------------------- |
| [TTW-001](ttw-001-align-supported-node-runtime.md)    | P0       | Standard | Complete | Align local/CI Node and pnpm contracts with Next 16 requirements                         |
| [TTW-002](ttw-002-restore-quality-gates.md)           | P0       | Standard | Complete | Restore lint, formatting and coverage gates with an explicit debt ratchet                |
| [TTW-003](ttw-003-repair-api-integration-harness.md)  | P0       | High     | Scoped   | Run real API E2E tests deterministically with PostgreSQL/Redis and clean shutdown        |
| [TTW-004](ttw-004-establish-playwright-foundation.md) | P0       | High     | Scoped   | Establish multi-app Playwright infrastructure, fixtures, provider simulator and smoke CI |

## Epic 1 — Financial and inventory integrity

| Ticket                                                  | Priority | Risk     | State  | Outcome                                                                      |
| ------------------------------------------------------- | -------- | -------- | ------ | ---------------------------------------------------------------------------- |
| [TTW-010](ttw-010-make-charge-settlement-idempotent.md) | P0       | Critical | Scoped | Settle each Paystack charge exactly once under duplicate/concurrent delivery |
| [TTW-011](ttw-011-make-payout-events-idempotent.md)     | P0       | Critical | Scoped | Apply each payout transition and ledger effect exactly once                  |
| [TTW-012](ttw-012-serialize-payment-initiation.md)      | P0       | Critical | Scoped | Permit at most one active payment attempt per order                          |
| [TTW-013](ttw-013-correct-refund-lifecycle.md)          | P0       | Critical | Scoped | Track provider-confirmed partial/full refunds and reconcile them once        |
| [TTW-014](ttw-014-complete-inventory-lifecycle.md)      | P0       | Critical | Scoped | Convert paid reservations to consumed stock or release them exactly once     |
| [TTW-015](ttw-015-reconcile-money-and-inventory.md)     | P1       | Critical | Scoped | Add scheduled financial/inventory reconciliation reports and repair runbooks |

## Epic 2 — Security and trust boundaries

| Ticket                                                           | Priority | Risk | State  | Outcome                                                                        |
| ---------------------------------------------------------------- | -------- | ---- | ------ | ------------------------------------------------------------------------------ |
| [TTW-020](ttw-020-isolate-admin-customer-sessions.md)            | P0       | High | Scoped | Enforce admin/customer session isolation and a deliberate CSRF model           |
| [TTW-021](ttw-021-secure-media-ingestion.md)                     | P0       | High | Scoped | Add real malware scanning and redirect/DNS-safe remote ingestion               |
| [TTW-022](ttw-022-remediate-production-dependency-advisories.md) | P0       | High | Scoped | Remediate critical/high production dependency advisories and add audit policy  |
| [TTW-023](ttw-023-enforce-account-and-privileged-auth-policy.md) | P1       | High | Scoped | Enforce verification, rate-limit, revocable-session and privileged-auth policy |

## Epic 3 — Complete customer and fundraiser revenue journeys

| Ticket                                                            | Priority | Risk | State  | Outcome                                                            |
| ----------------------------------------------------------------- | -------- | ---- | ------ | ------------------------------------------------------------------ |
| [TTW-030](ttw-030-add-organiser-onboarding-and-campaign-entry.md) | P1       | High | Scoped | Implement organiser eligibility, approval and campaign entry       |
| [TTW-031](ttw-031-render-real-fundraiser-offers.md)               | P1       | High | Scoped | Replace placeholder public options with sellable API-backed offers |
| [TTW-032](ttw-032-complete-web-fundraiser-checkout.md)            | P1       | High | Scoped | Preserve supporter intent through auth and complete web checkout   |
| [TTW-033](ttw-033-add-customer-order-detail.md)                   | P1       | High | Scoped | Add immutable, redacted customer order detail and honest states    |
| [TTW-034](ttw-034-enforce-campaign-readiness-and-decisions.md)    | P1       | High | Scoped | Enforce activation readiness and notify organisers of decisions    |
| [TTW-035](ttw-035-build-organiser-campaign-authoring.md)          | P1       | High | Scoped | Complete organiser product, design, price and submission authoring |

## Epic 4 — Fulfilment, support and business policy

| Ticket                                                         | Priority | Risk     | State  | Outcome                                                                |
| -------------------------------------------------------------- | -------- | -------- | ------ | ---------------------------------------------------------------------- |
| [TTW-040](ttw-040-add-shipment-lifecycle.md)                   | P1       | High     | Scoped | Add shipment/tracking and delivery-exception lifecycle                 |
| [TTW-041](ttw-041-encode-cancellation-refund-return-policy.md) | P1       | Critical | Scoped | Approve and encode cancellation, refund, return and fee policies       |
| [TTW-042](ttw-042-enforce-payout-policy-and-kyc.md)            | P1       | Critical | Scoped | Approve and enforce payout/KYC/cadence/minimum/reversal policy         |
| [TTW-043](ttw-043-operationalize-notification-delivery.md)     | P2       | High     | Scoped | Add notification preferences, dead-letter operations and delivery SLOs |

## Epic 5 — Contracts, observability and release proof

| Ticket                                                | Priority | Risk     | State  | Outcome                                                              |
| ----------------------------------------------------- | -------- | -------- | ------ | -------------------------------------------------------------------- |
| [TTW-050](ttw-050-gate-openapi-contracts.md)          | P1       | High     | Scoped | Gate generated OpenAPI and shared client contracts against drift     |
| [TTW-051](ttw-051-operationalize-observability.md)    | P1       | High     | Scoped | Add dashboards, alerts, SLOs and response runbooks                   |
| [TTW-052](ttw-052-reconcile-project-documentation.md) | P1       | Standard | Scoped | Reconcile documentation with implemented and verified state          |
| [TTW-053](ttw-053-complete-release-browser-uat.md)    | P2       | High     | Scoped | Complete browser matrix, accessibility, visuals and staging UAT      |
| [TTW-054](ttw-054-rehearse-controlled-release.md)     | P2       | High     | Scoped | Rehearse migrations, backup/restore, rollback and controlled release |

## Recommended first sequence

1. Establish truthful gates: `TTW-001 → TTW-002 → TTW-003 → TTW-004`; `TTW-052` may start independently.
2. Protect release truth: implement `TTW-010`–`TTW-014` sequentially where migrations overlap; run `TTW-020`–`TTW-022` in parallel when their foundations are ready, then `TTW-023`.
3. Close operational controls: `TTW-015`, `TTW-043`, `TTW-050`, then the relevant `TTW-051` dashboards/alerts.
4. Close actor journeys: `TTW-030 → TTW-035 → TTW-034`, `TTW-031 → TTW-032`, and `TTW-040 → TTW-033 → TTW-041`; `TTW-042` supplies payout readiness to campaign activation.
5. Run `TTW-053` only when its product/security/contract/observability dependencies are complete, then use `TTW-054` as the terminal rehearsal and human-approved release gate.
