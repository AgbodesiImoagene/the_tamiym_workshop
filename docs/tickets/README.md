# Tamiym delivery backlog

This is the ordered delivery map derived from the 2026-08-18 code/security review, the Playwright strategy, and the backend business-completeness audit. Every row links to a scoped implementation contract. `Scoped` means the current evidence, boundaries, dependencies, implementation sequence, tests, observability and acceptance criteria are recorded; owner policy decisions inside the ticket must still be approved at design review before implementation.

## Client review mapping

From 2026-11-04, new work starts from the client review workbook `revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx` (sheet "Findings"). Each new feature or fix gets its own ticket that cites the row ID it closes. The `Review` column links existing tickets to that workbook:

- a row ID (for example `4.3`): the ticket is the work for that review row;
- `Rest: <IDs>`: the ticket's shipped slice stands; its remaining scope is tracked by those review rows and will get new tickets;
- `Not in review`: the review does not cover this ticket (CI, tooling, infrastructure handled by the client, or deferred post-v1 work), so the ticket stays the only record;
- `—`: complete, nothing left in the review.

The working order for this review lives in [ROADMAP.md](ROADMAP.md).

## Priority model

- **P0:** correctness/security/release foundation; blocks safe business use.
- **P1:** closes a core PRD actor journey or operating requirement.
- **P2:** hardening, scale, usability, or evidence needed before broad release.
- Within a priority, respect dependencies and avoid overlapping critical schema work in parallel.

## Epic 0 — Trustworthy delivery system

| Ticket                                                           | Priority | Risk     | State    | Outcome                                                                                  | Review        |
| ---------------------------------------------------------------- | -------- | -------- | -------- | ---------------------------------------------------------------------------------------- | ------------- |
| [TTW-001](ttw-001-align-supported-node-runtime.md)               | P0       | Standard | Complete | Align local/CI Node and pnpm contracts with Next 16 requirements                         | —             |
| [TTW-002](ttw-002-restore-quality-gates.md)                      | P0       | Standard | Complete | Restore lint, formatting and coverage gates with an explicit debt ratchet                | —             |
| [TTW-003](ttw-003-repair-api-integration-harness.md)             | P0       | High     | Complete | Run real API E2E tests deterministically with PostgreSQL/Redis and clean shutdown        | —             |
| [TTW-004](ttw-004-establish-playwright-foundation.md)            | P0       | High     | Complete | Establish multi-app Playwright infrastructure, fixtures, provider simulator and smoke CI | —             |
| [TTW-005](ttw-005-reconcile-prisma-schema-with-migrations.md)    | P1       | High     | Complete | Reconcile the Prisma schema with migrations and guard against drift                      | Not in review |
| [TTW-006](ttw-006-fix-release-candidate-workflow-syntax.md)      | P1       | Low      | Complete | Fix the invalid YAML that stops the release-candidate workflow                           | —             |
| [TTW-007](ttw-007-upgrade-vulnerable-production-dependencies.md) | P0       | High     | Complete | Upgrade vulnerable production dependencies so the audit gate passes                      | Not in review |
| [TTW-008](ttw-008-regenerate-shared-enums-and-gate-drift.md)     | P1       | Low      | Complete | Regenerate the shared enums and fail CI when they drift from the Prisma schema           | Not in review |
| [TTW-009](ttw-009-upgrade-eslint-config-next.md)                 | P2       | Standard | Complete | Upgrade eslint-config-next to match next 16.4 and fix the new React hooks lint errors    | Not in review |
| [TTW-079](ttw-079-unique-refund-e2e-provider-ids.md)             | P0       | Low      | Complete | Give refund e2e tests unique Paystack refund ids so API Integration stops flaking        | Not in review |
| [TTW-080](ttw-080-make-open-handle-proof-fail-fast.md)           | P2       | Low      | Complete | Make the open-handle proof kill its whole process tree and fail fast on timeout          | Not in review |
| [TTW-164](ttw-164-ignore-generated-files-in-format-check.md)     | P1       | Low      | Complete | Stop the format check failing on generated files so `pnpm verify` runs in full           | Not in review |
| [TTW-165](ttw-165-fix-image-variant-select-crash.md)             | P1       | Low      | Complete | Stop the admin product page crashing on products with images                             | Not in review |
| [TTW-168](ttw-168-report-failed-admin-product-saves.md)          | P2       | Low      | Scoped   | Tell admins when a change on the product page fails                                      | Not in review |
| [TTW-169](ttw-169-tighten-image-variant-journey.md)              | P2       | Low      | Scoped   | Tighten the image variant journey and remove its dead placeholder                        | Not in review |
| [TTW-170](ttw-170-align-playwright-gates-with-strategy.md)       | P2       | Standard | Complete | Align the Playwright CI gates with the written strategy                                  | Not in review |
| [TTW-176](ttw-176-run-browser-matrix-in-ci.md)                   | P2       | Standard | Scoped   | Run the Playwright browser matrix (Firefox, WebKit, mobile, visual) in CI                | Not in review |

## Epic 1 — Financial and inventory integrity

| Ticket                                                   | Priority | Risk     | State    | Outcome                                                                      | Review        |
| -------------------------------------------------------- | -------- | -------- | -------- | ---------------------------------------------------------------------------- | ------------- |
| [TTW-010](ttw-010-make-charge-settlement-idempotent.md)  | P0       | Critical | Complete | Settle each Paystack charge exactly once under duplicate/concurrent delivery | —             |
| [TTW-011](ttw-011-make-payout-events-idempotent.md)      | P0       | Critical | Complete | Apply each payout transition and ledger effect exactly once                  | —             |
| [TTW-012](ttw-012-serialize-payment-initiation.md)       | P0       | Critical | Complete | Permit at most one active payment attempt per order                          | —             |
| [TTW-013](ttw-013-correct-refund-lifecycle.md)           | P0       | Critical | Complete | Track provider-confirmed partial/full refunds and reconcile them once        | —             |
| [TTW-014](ttw-014-complete-inventory-lifecycle.md)       | P0       | Critical | Complete | Convert paid reservations to consumed stock or release them exactly once     | —             |
| [TTW-015](ttw-015-reconcile-money-and-inventory.md)      | P1       | Critical | Complete | Add scheduled financial/inventory reconciliation reports and repair runbooks | —             |
| [TTW-081](ttw-081-enforce-unique-refund-provider-ref.md) | P2       | Critical | Complete | Enforce one local refund per Paystack refund id in the database              | Not in review |

## Epic 2 — Security and trust boundaries

| Ticket                                                              | Priority | Risk | State    | Outcome                                                                        | Review                 |
| ------------------------------------------------------------------- | -------- | ---- | -------- | ------------------------------------------------------------------------------ | ---------------------- |
| [TTW-020](ttw-020-isolate-admin-customer-sessions.md)               | P0       | High | Complete | Enforce admin/customer session isolation and a deliberate CSRF model           | —                      |
| [TTW-021](ttw-021-secure-media-ingestion.md)                        | P0       | High | Complete | Add real malware scanning and redirect/DNS-safe remote ingestion               | —                      |
| [TTW-022](ttw-022-remediate-production-dependency-advisories.md)    | P0       | High | Complete | Remediate critical/high production dependency advisories and add audit policy  | —                      |
| [TTW-023](ttw-023-enforce-account-and-privileged-auth-policy.md)    | P1       | High | Complete | Enforce verification, rate-limit, revocable-session and privileged-auth policy | Rest: 1.4, 1.5, 1.10   |
| [TTW-024](ttw-024-enforce-pricing-discount-and-tax-policy.md)       | P0       | High | Complete | Enforce reproducible price, discount, VAT and rounding policy                  | —                      |
| [TTW-025](ttw-025-implement-privacy-data-lifecycle.md)              | P0       | High | Complete | Implement auditable export, retention, deletion and anonymisation workflows    | Rest: 11.1, 11.2, 11.6 |
| [TTW-026](ttw-026-secure-design-share-links.md)                     | P1       | High | Complete | Replace permanent plaintext shares with expiring, revocable, digest-only links | Rest: 3.6              |
| [TTW-027](ttw-027-add-moderation-appeals-and-evidence-retention.md) | P1       | High | Complete | Add revision-bound moderation decisions, appeals and evidence retention        | Rest: 9.1              |
| [TTW-163](ttw-163-bound-bulk-tier-quantities.md)                    | P2       | Low  | Complete | Reject bulk tier quantities the database cannot store                          | Not in review          |
| [TTW-171](ttw-171-limit-bulk-tier-prices.md)                        | P2       | Low  | Scoped   | Reject bulk tier prices the database cannot store                              | Not in review          |
| [TTW-172](ttw-172-reject-unknown-bulk-tier-references.md)           | P2       | Low  | Scoped   | Reject unknown currencies, products and variants on bulk tiers                 | Not in review          |

## Epic 3 — Complete customer and fundraiser revenue journeys

| Ticket                                                                    | Priority | Risk     | State    | Outcome                                                                      | Review                      |
| ------------------------------------------------------------------------- | -------- | -------- | -------- | ---------------------------------------------------------------------------- | --------------------------- |
| [TTW-030](ttw-030-add-organiser-onboarding-and-campaign-entry.md)         | P1       | High     | Complete | Implement organiser eligibility, approval and campaign entry                 | Rest: 6.1                   |
| [TTW-031](ttw-031-render-real-fundraiser-offers.md)                       | P1       | High     | Complete | Replace placeholder public options with sellable API-backed offers           | Rest: 13.3                  |
| [TTW-032](ttw-032-complete-web-fundraiser-checkout.md)                    | P1       | High     | Complete | Preserve supporter intent through auth and complete web checkout             | Rest: 4.5, 4.7, 13.3        |
| [TTW-033](ttw-033-add-customer-order-detail.md)                           | P1       | High     | Complete | Add immutable, redacted customer order detail and honest states              | Rest: 4.8, 13.3             |
| [TTW-034](ttw-034-enforce-campaign-readiness-and-decisions.md)            | P1       | High     | Complete | Enforce activation readiness and notify organisers of decisions              | Rest: 6.10, 6.11, 6.12, 9.5 |
| [TTW-035](ttw-035-build-organiser-campaign-authoring.md)                  | P1       | High     | Complete | Complete organiser product, design, price and submission authoring           | Rest: 6.3                   |
| [TTW-036](ttw-036-complete-analytics-contracts.md)                        | P1       | High     | Complete | Interim analytics KPI contracts encoded (slice 1)                            | Rest: 10.3, 10.7            |
| [TTW-037](ttw-037-prevent-duplicate-standard-checkout-orders.md)          | P0       | Critical | Complete | Keep one order per cart revision across retries, tabs and concurrent creates | 4.3                         |
| [TTW-038](ttw-038-fix-invalid-pricing-quote-query.md)                     | P0       | High     | Complete | Fix the invalid pricing query that breaks every quote and order              | —                           |
| [TTW-039](ttw-039-seed-sellable-fundraiser-offer-and-checkout-journey.md) | P1       | Standard | Scoped   | Seed a sellable fundraiser offer and automate the supporter checkout journey | 13.3                        |
| [TTW-058](ttw-058-order-saved-designs-from-the-workshop.md)               | P0       | High     | Scoped   | Let customers order their saved designs from the Design Workshop             | 3.1, 3.8                    |
| [TTW-167](ttw-167-filter-banks-without-a-code.md)                         | P2       | High     | Complete | Keep banks without a code out of the bank list                               | Not in review               |
| [TTW-175](ttw-175-fix-bank-selector-choices.md)                           | P2       | High     | Scoped   | Show organisers only banks they can be paid at                               | Not in review               |

## Epic 4 — Fulfilment, support and business policy

| Ticket                                                         | Priority | Risk     | State    | Outcome                                                      | Review                        |
| -------------------------------------------------------------- | -------- | -------- | -------- | ------------------------------------------------------------ | ----------------------------- |
| [TTW-040](ttw-040-add-shipment-lifecycle.md)                   | P1       | High     | Complete | Add shipment/tracking and delivery-exception lifecycle       | Rest: 5.1                     |
| [TTW-041](ttw-041-encode-cancellation-refund-return-policy.md) | P1       | Critical | Complete | Cancellation/refund/return eligibility encoded (slice 1)     | Rest: 4.6, 5.2, 5.3, 6.13     |
| [TTW-042](ttw-042-enforce-payout-policy-and-kyc.md)            | P1       | Critical | Complete | Interim payout eligibility/KYC gates encoded (slice 1)       | Rest: 7.1, 7.2, 7.3, 7.8, 7.9 |
| [TTW-043](ttw-043-operationalize-notification-delivery.md)     | P2       | High     | Complete | Interim notification prefs/dead-letter/SLO encoded (slice 1) | Rest: 10.2                    |

## Epic 5 — Contracts, observability and release proof

| Ticket                                                | Priority | Risk     | State    | Outcome                                                                  | Review        |
| ----------------------------------------------------- | -------- | -------- | -------- | ------------------------------------------------------------------------ | ------------- |
| [TTW-050](ttw-050-gate-openapi-contracts.md)          | P1       | High     | Complete | OpenAPI generation + drift gate encoded (slice 1)                        | —             |
| [TTW-051](ttw-051-operationalize-observability.md)    | P1       | High     | Complete | Observability dashboards, alerts, runbooks encoded (slice 1)             | —             |
| [TTW-052](ttw-052-reconcile-project-documentation.md) | P1       | Standard | Complete | Documentation validation + key state reconciliation (slice 1)            | —             |
| [TTW-053](ttw-053-complete-release-browser-uat.md)    | P2       | High     | Complete | Comprehensive Playwright UAT, viewport matrix, nightly shard (slice 2)   | —             |
| [TTW-054](ttw-054-rehearse-controlled-release.md)     | P2       | High     | Complete | Migration baseline CI, stop/go rehearsal, release manifest (slice 2)     | —             |
| [TTW-173](ttw-173-document-image-update-contract.md)  | P2       | Low      | Scoped   | Document how the admin image update unlinks a variant, and its responses | Not in review |

## Epic 6 — Production infrastructure as code

See [the epic contract](../epics/06-production-infrastructure-as-code.md) and [provider decision brief](../18-production-infrastructure-options.md).

| Ticket                                                            | Priority | Risk     | State    | Outcome                                                                    | Review                |
| ----------------------------------------------------------------- | -------- | -------- | -------- | -------------------------------------------------------------------------- | --------------------- |
| [TTW-060](ttw-060-select-production-platform.md)                  | P0       | High     | Complete | Finalize DigitalOcean architecture, cost model and ADR evidence            | —                     |
| [TTW-061](ttw-061-establish-iac-foundation.md)                    | P0       | High     | Complete | Establish OpenTofu state, provider controls and reviewed plan/apply        | Not in review (infra) |
| [TTW-062](ttw-062-provision-network-dns-edge.md)                  | P1       | High     | Complete | Provision private networking, DNS, TLS, ingress and edge controls          | Not in review (infra) |
| [TTW-063](ttw-063-deploy-production-runtime.md)                   | P1       | High     | Complete | Build immutable images and deploy public, API, worker and scheduler roles  | Not in review (infra) |
| [TTW-064](ttw-064-provision-managed-data-services.md)             | P0       | Critical | Complete | Provision recoverable PostgreSQL, queue storage and private object storage | —                     |
| [TTW-065](ttw-065-enforce-infrastructure-security.md)             | P0       | High     | Complete | Enforce workload identity, secrets, encryption and break-glass controls    | —                     |
| [TTW-066](ttw-066-operationalize-infrastructure-observability.md) | P1       | High     | Complete | Route infrastructure telemetry, alerts and cost controls                   | —                     |
| [TTW-067](ttw-067-prove-backup-disaster-recovery.md)              | P1       | Critical | Complete | Automate backups and prove recovery objectives through exercises           | —                     |
| [TTW-068](ttw-068-validate-ephemeral-release-infrastructure.md)   | P2       | High     | Complete | Validate ephemeral release infrastructure and integrate CI/CD              | —                     |

## Epic 7 — Organic discovery: SEO, AEO and GEO

See [the epic contract](../epics/07-organic-discovery-seo-aeo-geo.md).

| Ticket                                                       | Priority | Risk     | State    | Outcome                                                               | Review |
| ------------------------------------------------------------ | -------- | -------- | -------- | --------------------------------------------------------------------- | ------ |
| [TTW-070](ttw-070-establish-organic-discovery-strategy.md)   | P1       | Standard | Complete | Organic discovery strategy brief published (slice 1)                  | —      |
| [TTW-071](ttw-071-implement-search-technical-foundations.md) | P1       | High     | Complete | Crawl/index/canonical/robots/sitemap foundations (slice 1)            | —      |
| [TTW-072](ttw-072-build-public-content-architecture.md)      | P1       | Standard | Complete | Public IA registry, nav, breadcrumbs, bulk landing (slice 1)          | —      |
| [TTW-073](ttw-073-publish-trustworthy-structured-data.md)    | P1       | High     | Complete | Organization/WebSite/Breadcrumb JSON-LD foundations (slice 1)         | —      |
| [TTW-074](ttw-074-publish-answer-ready-content.md)           | P2       | Standard | Complete | Answer library, corrected claims, FAQ markup (slice 1)                | —      |
| [TTW-075](ttw-075-govern-generative-discovery.md)            | P2       | High     | Complete | Govern AI crawlers, content rights and generative discovery (slice 1) | —      |
| [TTW-076](ttw-076-improve-search-performance-media.md)       | P2       | Standard | Complete | Core Web Vitals budgets, OG/social media contracts (slice 1)          | —      |
| [TTW-077](ttw-077-measure-organic-discovery.md)              | P2       | High     | Complete | Discovery metrics catalogue, privacy-safe events (slice 1)            | —      |
| [TTW-078](ttw-078-gate-discovery-regressions.md)             | P2       | High     | Complete | Discovery regression manifest, validators, Playwright smoke (slice 1) | —      |

## Epic 8 — Client review delivery

One ticket per piece of work from the client review, in the order of [ROADMAP.md](ROADMAP.md).

| Ticket                                                             | Priority | Risk     | State  | Outcome                                                   | Review         |
| ------------------------------------------------------------------ | -------- | -------- | ------ | --------------------------------------------------------- | -------------- |
| [TTW-082](ttw-082-link-google-sign-in-to-confirmed-emails.md)      | P0       | High     | Scoped | Link Google sign-in only to confirmed emails              | 1.8            |
| [TTW-083](ttw-083-hash-password-reset-and-verification-tokens.md)  | P0       | High     | Scoped | Hash password-reset and email-verification tokens         | 1.7            |
| [TTW-084](ttw-084-create-default-site-settings.md)                 | P0       | High     | Scoped | Create default site settings so VAT is never silently 0%  | 8.6            |
| [TTW-085](ttw-085-validate-production-mail-settings.md)            | P0       | Standard | Scoped | Validate production mail settings at startup              | 10.5           |
| [TTW-086](ttw-086-reject-addresses-outside-shipping-zones.md)      | P0       | High     | Scoped | Reject addresses outside every shipping zone              | 5.6            |
| [TTW-087](ttw-087-offer-states-and-lgas-at-checkout.md)            | P0       | High     | Scoped | Offer Nigerian states and LGAs as lists at checkout       | 4.9            |
| [TTW-088](ttw-088-refund-payments-captured-after-cancellation.md)  | P0       | Critical | Scoped | Refund payments captured after an order was cancelled     | 4.6            |
| [TTW-089](ttw-089-add-forgot-and-reset-password-pages.md)          | P1       | High     | Scoped | Add forgot-password and reset-password pages              | 1.1            |
| [TTW-090](ttw-090-show-email-verification-state-and-resend.md)     | P1       | High     | Scoped | Show the email-verification state and offer a resend      | 1.4            |
| [TTW-091](ttw-091-remove-fake-profile-picture.md)                  | P1       | Low      | Scoped | Remove the fake profile picture and its button            | 1.2            |
| [TTW-092](ttw-092-build-product-detail-page.md)                    | P0       | Standard | Scoped | Build the product detail page                             | 2.2, 2.1       |
| [TTW-093](ttw-093-use-real-categories-and-paginate-catalogue.md)   | P1       | Standard | Scoped | Use real categories and paginate the customer catalogue   | 2.3            |
| [TTW-094](ttw-094-let-admins-enter-size-and-print-surcharges.md)   | P1       | High     | Scoped | Let admins enter size and print-side surcharges           | 2.7            |
| [TTW-095](ttw-095-compute-bulk-tiers-on-total-product-quantity.md) | P1       | High     | Scoped | Compute bulk tiers on a product's total quantity          | 8.5            |
| [TTW-096](ttw-096-apply-product-and-order-discounts.md)            | P1       | High     | Scoped | Apply product, variant and order discounts                | 8.1            |
| [TTW-097](ttw-097-complete-shipping-zone-administration.md)        | P1       | High     | Scoped | Complete shipping zone and rate administration            | 8.2            |
| [TTW-098](ttw-098-make-shipping-rates-weight-or-quantity-based.md) | P1       | High     | Scoped | Make shipping rates configurable by weight or quantity    | 5.7            |
| [TTW-099](ttw-099-make-customer-uploads-private.md)                | P1       | High     | Scoped | Make customer uploads private with signed links           | 11.3, 9.7      |
| [TTW-100](ttw-100-validate-design-content-on-the-server.md)        | P0       | High     | Scoped | Validate design content on the server                     | 3.7            |
| [TTW-101](ttw-101-give-the-workshop-its-print-files.md)            | P0       | High     | Scoped | Give the print shop its print files                       | 3.2            |
| [TTW-102](ttw-102-add-delete-undo-and-layers-to-the-workshop.md)   | P1       | Standard | Scoped | Add delete, undo and a layer list to the Design Workshop  | 3.3            |
| [TTW-103](ttw-103-load-the-fonts-the-workshop-offers.md)           | P1       | Standard | Scoped | Load the fonts the Design Workshop offers                 | 3.11           |
| [TTW-104](ttw-104-warn-about-low-resolution-images.md)             | P1       | Standard | Scoped | Warn about low-resolution images in the workshop          | 3.10           |
| [TTW-105](ttw-105-align-workshop-layout-with-figma.md)             | P1       | Standard | Scoped | Align the Design Workshop layout with Figma               | 3.4            |
| [TTW-106](ttw-106-build-the-admin-shipment-screen.md)              | P0       | High     | Scoped | Build the admin shipment screen                           | 5.1            |
| [TTW-107](ttw-107-let-customers-cancel-unpaid-orders.md)           | P1       | Critical | Scoped | Let customers cancel their unpaid orders                  | 5.2            |
| [TTW-108](ttw-108-add-downloadable-vat-invoices.md)                | P1       | High     | Scoped | Add downloadable VAT invoices                             | 4.8            |
| [TTW-109](ttw-109-send-design-approved-and-rejected-emails.md)     | P1       | Standard | Scoped | Send design approved and rejected emails                  | 9.2            |
| [TTW-110](ttw-110-build-failed-email-screens.md)                   | P1       | High     | Scoped | Build the failed-email screens                            | 10.2           |
| [TTW-111](ttw-111-let-admins-suspend-users.md)                     | P1       | High     | Scoped | Let admins suspend and reinstate users                    | 1.9            |
| [TTW-112](ttw-112-add-admin-two-factor-reset-screen.md)            | P1       | High     | Scoped | Add the admin two-factor reset screen                     | 1.10           |
| [TTW-113](ttw-113-fix-admin-google-sign-in.md)                     | P1       | High     | Scoped | Fix or remove admin Google sign-in                        | 1.3            |
| [TTW-114](ttw-114-build-paystack-reconciliation-screens.md)        | P1       | High     | Scoped | Build the Paystack reconciliation screens                 | 10.1           |
| [TTW-115](ttw-115-show-queue-counters-on-admin-dashboard.md)       | P1       | Standard | Scoped | Show moderation queue counters on the admin dashboard     | 9.6            |
| [TTW-116](ttw-116-add-missing-admin-alerts.md)                     | P1       | Standard | Scoped | Add the missing admin alerts                              | 10.8           |
| [TTW-117](ttw-117-draft-and-publish-legal-texts.md)                | P0       | Standard | Scoped | Draft and publish the legal texts                         | 11.4           |
| [TTW-118](ttw-118-remove-unproven-about-page-figures.md)           | P0       | Low      | Scoped | Remove the unproven About page figures                    | 12.6           |
| [TTW-119](ttw-119-build-data-rights-screens.md)                    | P1       | High     | Scoped | Build the data-rights and preference screens              | 11.1           |
| [TTW-120](ttw-120-erase-files-of-deleted-accounts.md)              | P1       | High     | Scoped | Erase stored files of deleted accounts                    | 11.2           |
| [TTW-121](ttw-121-recalibrate-account-deletion-blockers.md)        | P1       | High     | Scoped | Recalibrate account-deletion blockers                     | 11.6           |
| [TTW-122](ttw-122-add-unsubscribe-links.md)                        | P1       | Standard | Scoped | Add unsubscribe links to marketing emails                 | 10.9           |
| [TTW-123](ttw-123-add-public-catalogue-and-site-menu.md)           | P1       | Standard | Scoped | Add the public catalogue and align the site menu          | 2.4            |
| [TTW-124](ttw-124-add-audience-measurement.md)                     | P1       | Standard | Scoped | Add audience measurement to the public site               | 12.4           |
| [TTW-125](ttw-125-replace-fake-social-links.md)                    | P1       | Low      | Scoped | Replace the fake social links                             | 12.2           |
| [TTW-126](ttw-126-compress-homepage-photos.md)                     | P1       | Low      | Scoped | Compress the homepage photos                              | 12.5           |
| [TTW-127](ttw-127-add-global-error-page.md)                        | P1       | Low      | Scoped | Add a global error page to the public site                | 12.7           |
| [TTW-128](ttw-128-build-organiser-approval-screen.md)              | P0       | High     | Scoped | Build the organiser approval screen                       | 6.1, 7.7       |
| [TTW-129](ttw-129-build-bank-account-verification-queue.md)        | P0       | Critical | Scoped | Build the bank-account verification queue                 | 7.1, 6.11      |
| [TTW-130](ttw-130-check-account-holder-name-with-paystack.md)      | P1       | High     | Scoped | Check the account holder name with Paystack               | 7.2            |
| [TTW-131](ttw-131-correct-the-campaign-money-split.md)             | P0       | Critical | Scoped | Correct the campaign money split                          | 6.2, 6.14, 7.6 |
| [TTW-132](ttw-132-define-refund-recovery-after-payout.md)          | P0       | Critical | Scoped | Define refund recovery after a payout                     | 6.13           |
| [TTW-133](ttw-133-cap-one-off-payouts.md)                          | P0       | Critical | Scoped | Cap one-off payouts and require a second admin            | 7.8            |
| [TTW-134](ttw-134-show-organisers-their-money.md)                  | P1       | High     | Scoped | Show organisers their balance and payouts                 | 7.9            |
| [TTW-135](ttw-135-let-organisers-edit-bank-accounts.md)            | P1       | High     | Scoped | Let organisers edit or delete their bank account          | 7.3            |
| [TTW-136](ttw-136-allow-guest-fundraiser-checkout.md)              | P1       | Critical | Scoped | Allow guest checkout for fundraiser supporters            | 4.7            |
| [TTW-137](ttw-137-add-fundraiser-donations.md)                     | P1       | Critical | Scoped | Add donations to fundraiser checkout                      | 4.5            |
| [TTW-138](ttw-138-add-campaign-delivery-options.md)                | P1       | High     | Scoped | Add campaign delivery options                             | 5.4            |
| [TTW-139](ttw-139-show-organisers-their-campaign-orders.md)        | P1       | High     | Scoped | Show organisers their campaign orders                     | 5.9            |
| [TTW-140](ttw-140-add-campaign-resume-button.md)                   | P1       | Low      | Scoped | Add the admin button to resume a paused campaign          | 6.10           |
| [TTW-141](ttw-141-complete-campaign-end-handling.md)               | P1       | High     | Scoped | Complete campaign end handling                            | 6.12           |
| [TTW-142](ttw-142-freeze-live-campaigns.md)                        | P1       | High     | Scoped | Freeze live campaigns and their approved designs          | 9.5            |
| [TTW-143](ttw-143-show-moderators-a-real-render.md)                | P1       | High     | Scoped | Show moderators a real design render                      | 9.3            |
| [TTW-144](ttw-144-show-campaign-end-date-and-sales.md)             | P2       | Standard | Scoped | Show end date and sales on the public campaign page       | 6.9            |
| [TTW-145](ttw-145-add-campaign-headline-and-video.md)              | P2       | Standard | Scoped | Add a campaign headline and optional video                | 6.8            |
| [TTW-146](ttw-146-hide-fundraising-until-launch.md)                | P0       | High     | Scoped | Hide fundraising and payouts for launch                   | Not in review  |
| [TTW-147](ttw-147-choose-and-configure-email-provider.md)          | P0       | High     | Scoped | Choose and configure the production email provider        | Not in review  |
| [TTW-148](ttw-148-run-end-to-end-tests-and-client-acceptance.md)   | P0       | High     | Scoped | Run end-to-end tests and client acceptance                | 13.3           |
| [TTW-149](ttw-149-add-returns-and-claims.md)                       | P2       | Critical | Scoped | Add returns and claims                                    | 5.3            |
| [TTW-150](ttw-150-build-moderation-appeal-screens.md)              | P2       | High     | Scoped | Build the moderation appeal screens                       | 9.1            |
| [TTW-151](ttw-151-complete-admin-analytics.md)                     | P2       | Standard | Scoped | Complete the admin analytics screens                      | 10.3           |
| [TTW-152](ttw-152-add-workshop-earnings-metric.md)                 | P2       | Standard | Scoped | Add a workshop earnings metric                            | 10.7           |
| [TTW-153](ttw-153-show-delivery-estimate-and-express-option.md)    | P2       | High     | Scoped | Show the delivery estimate and express option at checkout | 8.7            |
| [TTW-154](ttw-154-add-audit-log-screen.md)                         | P2       | High     | Scoped | Add the audit log route and screen                        | 10.4           |
| [TTW-155](ttw-155-paginate-admin-orders.md)                        | P2       | Standard | Scoped | Paginate the admin order list                             | 5.8            |
| [TTW-156](ttw-156-add-search-to-admin-products.md)                 | P2       | Low      | Scoped | Add search and pagination to the admin product list       | 2.8            |
| [TTW-157](ttw-157-expose-catalogue-search-and-filters.md)          | P2       | Low      | Scoped | Expose catalogue search, sort and price filter            | 2.6            |
| [TTW-158](ttw-158-add-active-sessions-screen.md)                   | P2       | High     | Scoped | Add the active sessions screen                            | 1.5            |
| [TTW-159](ttw-159-add-share-link-management.md)                    | P2       | Standard | Scoped | Add the share-link management screen                      | 3.6            |
| [TTW-160](ttw-160-align-order-summary-with-figma.md)               | P2       | Low      | Scoped | Align the order summary and confirmation with Figma       | 4.4            |
| [TTW-161](ttw-161-allow-local-courier-tracking-links.md)           | P2       | Standard | Scoped | Allow local courier tracking links                        | 5.10           |
| [TTW-162](ttw-162-darken-green-button-colour.md)                   | P2       | Low      | Scoped | Darken the green buttons for contrast                     | 12.8           |
| [TTW-166](ttw-166-stop-variant-changes-deleting-images.md)         | P1       | High     | Scoped | Stop variant changes silently deleting linked images      | Not in review  |
| [TTW-174](ttw-174-keep-variants-when-adding-an-option.md)          | P1       | High     | Scoped | Keep existing variants when an option is added            | Not in review  |

## Explicitly deferred post-v1 backlog

These tickets are scoped so deferred work is owned and discoverable. They do not block the current v1 release unless an owner promotes them through design review and updates the dependency map.

| Ticket                                                            | Risk     | State    | Outcome                                                                | Review                                        |
| ----------------------------------------------------------------- | -------- | -------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| [TTW-044](ttw-044-integrate-carrier-labels-and-webhooks.md)       | High     | Deferred | Integrate carrier rates, label purchasing and tracking webhooks        | Launch part: TTW-161                          |
| [TTW-045](ttw-045-support-partial-and-multi-package-shipments.md) | High     | Deferred | Support partial fulfilment and multiple shipment packages              | Not in review                                 |
| [TTW-046](ttw-046-handle-chargebacks-and-payment-disputes.md)     | Critical | Deferred | Reconcile chargebacks, disputes and their accounting effects           | Not in review                                 |
| [TTW-047](ttw-047-automate-reverse-logistics.md)                  | High     | Deferred | Automate returns labels, receipts and reverse logistics                | Launch part: TTW-149                          |
| [TTW-048](ttw-048-productionize-notification-providers.md)        | High     | Deferred | Select production providers and implement controlled delivery failover | Launch part: TTW-147                          |
| [TTW-049](ttw-049-add-consented-marketing-segmentation.md)        | High     | Deferred | Add consented marketing segmentation and campaign delivery             | Not in review (10.9 is unsubscribe only)      |
| [TTW-055](ttw-055-unify-standard-catalogue-cart-and-checkout.md)  | High     | Deferred | Unify standard catalogue discovery, cart and checkout across surfaces  | Launch part: TTW-123                          |
| [TTW-056](ttw-056-reconcile-bank-and-accounting-records.md)       | Critical | Deferred | Reconcile provider, bank and accounting-system records                 | Not in review (10.1 is Paystack screens only) |
| [TTW-057](ttw-057-support-international-money-and-payouts.md)     | Critical | Deferred | Add international currencies, payouts and withholding controls         | Not in review                                 |

## Recommended first sequence

1. Establish truthful gates: `TTW-001 → TTW-002 → TTW-003 → TTW-004`; `TTW-052` may start independently.
2. Complete the approved DigitalOcean cost/architecture evidence without provisioning production: `TTW-060 → TTW-061`, then run `TTW-062`, `TTW-064` and `TTW-065` in parallel where changes do not overlap.
3. Protect release truth: implement `TTW-010`–`TTW-014` sequentially where migrations overlap; run `TTW-020`–`TTW-022`, `TTW-024` and `TTW-025` in parallel when their foundations are ready, then `TTW-023`, `TTW-026` and `TTW-027` according to dependencies.
4. Close operational controls: `TTW-015`, `TTW-036`, `TTW-043`, `TTW-050`, then the relevant `TTW-051` dashboards/alerts.
5. Close actor journeys: `TTW-030 → TTW-035 → TTW-034`, `TTW-031 → TTW-032`, and `TTW-040 → TTW-033 → TTW-041`; `TTW-042` supplies payout readiness to campaign activation.
6. Complete `TTW-063`, `TTW-066` and `TTW-067`; run `TTW-053` against the immutable temporary release candidate, then `TTW-068`.
7. Use `TTW-054` as the terminal rehearsal and explicit human-approved production release gate. Deferred tickets remain outside this critical path.
