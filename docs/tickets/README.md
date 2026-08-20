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
| [TTW-003](ttw-003-repair-api-integration-harness.md)  | P0       | High     | Complete | Run real API E2E tests deterministically with PostgreSQL/Redis and clean shutdown        |
| [TTW-004](ttw-004-establish-playwright-foundation.md) | P0       | High     | Complete | Establish multi-app Playwright infrastructure, fixtures, provider simulator and smoke CI |

## Epic 1 — Financial and inventory integrity

| Ticket                                                  | Priority | Risk     | State    | Outcome                                                                      |
| ------------------------------------------------------- | -------- | -------- | -------- | ---------------------------------------------------------------------------- |
| [TTW-010](ttw-010-make-charge-settlement-idempotent.md) | P0       | Critical | Complete | Settle each Paystack charge exactly once under duplicate/concurrent delivery |
| [TTW-011](ttw-011-make-payout-events-idempotent.md)     | P0       | Critical | Complete | Apply each payout transition and ledger effect exactly once                  |
| [TTW-012](ttw-012-serialize-payment-initiation.md)      | P0       | Critical | Complete | Permit at most one active payment attempt per order                          |
| [TTW-013](ttw-013-correct-refund-lifecycle.md)          | P0       | Critical | Complete | Track provider-confirmed partial/full refunds and reconcile them once        |
| [TTW-014](ttw-014-complete-inventory-lifecycle.md)      | P0       | Critical | Complete | Convert paid reservations to consumed stock or release them exactly once     |
| [TTW-015](ttw-015-reconcile-money-and-inventory.md)     | P1       | Critical | Complete | Add scheduled financial/inventory reconciliation reports and repair runbooks |

## Epic 2 — Security and trust boundaries

| Ticket                                                              | Priority | Risk | State       | Outcome                                                                        |
| ------------------------------------------------------------------- | -------- | ---- | ----------- | ------------------------------------------------------------------------------ |
| [TTW-020](ttw-020-isolate-admin-customer-sessions.md)               | P0       | High | Complete    | Enforce admin/customer session isolation and a deliberate CSRF model           |
| [TTW-021](ttw-021-secure-media-ingestion.md)                        | P0       | High | Complete    | Add real malware scanning and redirect/DNS-safe remote ingestion               |
| [TTW-022](ttw-022-remediate-production-dependency-advisories.md)    | P0       | High | Complete    | Remediate critical/high production dependency advisories and add audit policy  |
| [TTW-023](ttw-023-enforce-account-and-privileged-auth-policy.md)    | P1       | High | Complete    | Enforce verification, rate-limit, revocable-session and privileged-auth policy |
| [TTW-024](ttw-024-enforce-pricing-discount-and-tax-policy.md)       | P0       | High | Complete    | Enforce reproducible price, discount, VAT and rounding policy                  |
| [TTW-025](ttw-025-implement-privacy-data-lifecycle.md)              | P0       | High | Complete    | Implement auditable export, retention, deletion and anonymisation workflows    |
| [TTW-026](ttw-026-secure-design-share-links.md)                     | P1       | High | In progress | Replace permanent plaintext shares with expiring, revocable, digest-only links |
| [TTW-027](ttw-027-add-moderation-appeals-and-evidence-retention.md) | P1       | High | Scoped      | Add revision-bound moderation decisions, appeals and evidence retention        |

## Epic 3 — Complete customer and fundraiser revenue journeys

| Ticket                                                            | Priority | Risk | State  | Outcome                                                            |
| ----------------------------------------------------------------- | -------- | ---- | ------ | ------------------------------------------------------------------ |
| [TTW-030](ttw-030-add-organiser-onboarding-and-campaign-entry.md) | P1       | High | Scoped | Implement organiser eligibility, approval and campaign entry       |
| [TTW-031](ttw-031-render-real-fundraiser-offers.md)               | P1       | High | Scoped | Replace placeholder public options with sellable API-backed offers |
| [TTW-032](ttw-032-complete-web-fundraiser-checkout.md)            | P1       | High | Scoped | Preserve supporter intent through auth and complete web checkout   |
| [TTW-033](ttw-033-add-customer-order-detail.md)                   | P1       | High | Scoped | Add immutable, redacted customer order detail and honest states    |
| [TTW-034](ttw-034-enforce-campaign-readiness-and-decisions.md)    | P1       | High | Scoped | Enforce activation readiness and notify organisers of decisions    |
| [TTW-035](ttw-035-build-organiser-campaign-authoring.md)          | P1       | High | Scoped | Complete organiser product, design, price and submission authoring |
| [TTW-036](ttw-036-complete-analytics-contracts.md)                | P1       | High | Scoped | Approve KPI contracts, filters and reconciliation drill-downs      |

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
| [TTW-053](ttw-053-complete-release-browser-uat.md)    | P2       | High     | Scoped | Complete browser matrix, accessibility, visuals and release UAT      |
| [TTW-054](ttw-054-rehearse-controlled-release.md)     | P2       | High     | Scoped | Rehearse migrations, backup/restore, rollback and controlled release |

## Epic 6 — Production infrastructure as code

See [the epic contract](../epics/06-production-infrastructure-as-code.md) and [provider decision brief](../18-production-infrastructure-options.md).

| Ticket                                                            | Priority | Risk     | State    | Outcome                                                                    |
| ----------------------------------------------------------------- | -------- | -------- | -------- | -------------------------------------------------------------------------- |
| [TTW-060](ttw-060-select-production-platform.md)                  | P0       | High     | Complete | Finalize DigitalOcean architecture, cost model and ADR evidence            |
| [TTW-061](ttw-061-establish-iac-foundation.md)                    | P0       | High     | Complete | Establish OpenTofu state, provider controls and reviewed plan/apply        |
| [TTW-062](ttw-062-provision-network-dns-edge.md)                  | P1       | High     | Complete | Provision private networking, DNS, TLS, ingress and edge controls          |
| [TTW-063](ttw-063-deploy-production-runtime.md)                   | P1       | High     | Complete | Build immutable images and deploy public, API, worker and scheduler roles  |
| [TTW-064](ttw-064-provision-managed-data-services.md)             | P0       | Critical | Complete | Provision recoverable PostgreSQL, queue storage and private object storage |
| [TTW-065](ttw-065-enforce-infrastructure-security.md)             | P0       | High     | Complete | Enforce workload identity, secrets, encryption and break-glass controls    |
| [TTW-066](ttw-066-operationalize-infrastructure-observability.md) | P1       | High     | Complete | Route infrastructure telemetry, alerts and cost controls                   |
| [TTW-067](ttw-067-prove-backup-disaster-recovery.md)              | P1       | Critical | Complete | Automate backups and prove recovery objectives through exercises           |
| [TTW-068](ttw-068-validate-ephemeral-release-infrastructure.md)   | P2       | High     | Complete | Validate ephemeral release infrastructure and integrate CI/CD              |

## Epic 7 — Organic discovery: SEO, AEO and GEO

See [the epic contract](../epics/07-organic-discovery-seo-aeo-geo.md).

| Ticket                                                       | Priority | Risk     | State  | Outcome                                                                   |
| ------------------------------------------------------------ | -------- | -------- | ------ | ------------------------------------------------------------------------- |
| [TTW-070](ttw-070-establish-organic-discovery-strategy.md)   | P1       | Standard | Scoped | Establish discovery strategy, entities, query map and measurable baseline |
| [TTW-071](ttw-071-implement-search-technical-foundations.md) | P1       | High     | Scoped | Implement crawl, index, canonical, robots and sitemap foundations         |
| [TTW-072](ttw-072-build-public-content-architecture.md)      | P1       | Standard | Scoped | Build governed public information architecture and content system         |
| [TTW-073](ttw-073-publish-trustworthy-structured-data.md)    | P1       | High     | Scoped | Publish truthful entity, content and commerce structured data             |
| [TTW-074](ttw-074-publish-answer-ready-content.md)           | P2       | Standard | Scoped | Publish useful, evidence-backed answer-ready content                      |
| [TTW-075](ttw-075-govern-generative-discovery.md)            | P2       | High     | Scoped | Govern AI crawlers, content rights and generative discovery               |
| [TTW-076](ttw-076-improve-search-performance-media.md)       | P2       | Standard | Scoped | Improve Core Web Vitals and public-media discoverability                  |
| [TTW-077](ttw-077-measure-organic-discovery.md)              | P2       | High     | Scoped | Measure privacy-safe organic and answer-engine outcomes                   |
| [TTW-078](ttw-078-gate-discovery-regressions.md)             | P2       | High     | Scoped | Gate metadata, schema, crawlability, performance and privacy regressions  |

## Explicitly deferred post-v1 backlog

These tickets are scoped so deferred work is owned and discoverable. They do not block the current v1 release unless an owner promotes them through design review and updates the dependency map.

| Ticket                                                            | Risk     | State    | Outcome                                                                |
| ----------------------------------------------------------------- | -------- | -------- | ---------------------------------------------------------------------- |
| [TTW-044](ttw-044-integrate-carrier-labels-and-webhooks.md)       | High     | Deferred | Integrate carrier rates, label purchasing and tracking webhooks        |
| [TTW-045](ttw-045-support-partial-and-multi-package-shipments.md) | High     | Deferred | Support partial fulfilment and multiple shipment packages              |
| [TTW-046](ttw-046-handle-chargebacks-and-payment-disputes.md)     | Critical | Deferred | Reconcile chargebacks, disputes and their accounting effects           |
| [TTW-047](ttw-047-automate-reverse-logistics.md)                  | High     | Deferred | Automate returns labels, receipts and reverse logistics                |
| [TTW-048](ttw-048-productionize-notification-providers.md)        | High     | Deferred | Select production providers and implement controlled delivery failover |
| [TTW-049](ttw-049-add-consented-marketing-segmentation.md)        | High     | Deferred | Add consented marketing segmentation and campaign delivery             |
| [TTW-055](ttw-055-unify-standard-catalogue-cart-and-checkout.md)  | High     | Deferred | Unify standard catalogue discovery, cart and checkout across surfaces  |
| [TTW-056](ttw-056-reconcile-bank-and-accounting-records.md)       | Critical | Deferred | Reconcile provider, bank and accounting-system records                 |
| [TTW-057](ttw-057-support-international-money-and-payouts.md)     | Critical | Deferred | Add international currencies, payouts and withholding controls         |

## Recommended first sequence

1. Establish truthful gates: `TTW-001 → TTW-002 → TTW-003 → TTW-004`; `TTW-052` may start independently.
2. Complete the approved DigitalOcean cost/architecture evidence without provisioning production: `TTW-060 → TTW-061`, then run `TTW-062`, `TTW-064` and `TTW-065` in parallel where changes do not overlap.
3. Protect release truth: implement `TTW-010`–`TTW-014` sequentially where migrations overlap; run `TTW-020`–`TTW-022`, `TTW-024` and `TTW-025` in parallel when their foundations are ready, then `TTW-023`, `TTW-026` and `TTW-027` according to dependencies.
4. Close operational controls: `TTW-015`, `TTW-036`, `TTW-043`, `TTW-050`, then the relevant `TTW-051` dashboards/alerts.
5. Close actor journeys: `TTW-030 → TTW-035 → TTW-034`, `TTW-031 → TTW-032`, and `TTW-040 → TTW-033 → TTW-041`; `TTW-042` supplies payout readiness to campaign activation.
6. Complete `TTW-063`, `TTW-066` and `TTW-067`; run `TTW-053` against the immutable temporary release candidate, then `TTW-068`.
7. Use `TTW-054` as the terminal rehearsal and explicit human-approved production release gate. Deferred tickets remain outside this critical path.
