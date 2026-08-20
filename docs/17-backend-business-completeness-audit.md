# Backend business-completeness audit

**Assessment date:** 2026-08-18\
**Scope:** API business logic and whether the implemented frontends/operations can complete each PRD lifecycle\
**Verdict:** feature-rich internal beta; not release-ready

## How to read this audit

An endpoint is not considered complete merely because it exists. A business capability is complete only when its actors can enter the flow, reach a valid terminal state, recover from failures, operate it safely, reconcile its side effects, and observe what happened.

Ratings:

- **Ready** — the lifecycle is implemented and only normal validation/UAT remains.
- **Substantial** — the core exists, but one or more release-significant closure gaps remain.
- **Partial** — meaningful code exists, but actors cannot reliably finish the lifecycle.
- **Missing** — no credible end-to-end capability exists.

## Executive finding

The repository is materially ahead of its documentation: catalog administration, structured workshop data, server-side pricing, Nigeria shipping rules, campaigns, moderation, analytics, notifications, ledger-based payouts and audit logging are all substantial implementations. Conversely, the business cannot safely launch because money movement is not concurrency-safe, refunds are modeled as immediately successful, stock is never consumed after a sale, admin/customer sessions are insufficiently isolated, media ingestion is not production-safe, and public fundraiser commerce/organiser onboarding are not closed journeys.

The correct strategy is not a backend rewrite. Preserve the domain modules, strengthen database-enforced invariants and state machines, close the missing actor journeys, and make those journeys executable through integration and Playwright tests.

## Capability matrix

| Capability                         | State                  | What is present                                                                                                         | Release-significant gap                                                                                                                                                            |
| ---------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and accounts              | Substantial            | registration, password/Google login, refresh rotation, verification/reset, profile/addresses, status and roles          | password login does not normalize email; verification policy is unclear; admin credentials can cross customer/admin surfaces; CSRF/session boundary needs hardening                |
| Roles and organiser entry          | Partial                | CUSTOMER/ORGANIZER/ADMIN guards and audited admin role changes                                                          | no self-service eligibility/application/onboarding contract; customer UI explicitly locks organiser APIs and offers no path forward                                                |
| Catalog and workshop configuration | Substantial            | deep product/category/variant/media/view/print-area/layer/effect/pricing administration                                 | documentation understates it; database-only default/overlap constraints remain; full publish-readiness validation and E2E evidence are absent                                      |
| Customer design workshop           | Substantial            | structured designs, assets, views, thumbnails, duplicate/share and moderation                                           | only three component suites; upload security is incomplete; share expiry/revocation and moderation consequences need product decisions                                             |
| Pricing, discount and tax          | Substantial            | central standard/campaign pipeline, bulk/campaign discounts, shipping and VAT/rounding snapshots                        | schema documents unenforced overlap/exclusivity rules; business needs signed-off price/tax/refund policy and database constraints                                                  |
| Shipping                           | Substantial            | normalized Nigeria address model, zones, areas, rules, rates and order snapshots                                        | only internal provider exists; no shipment/tracking entity or carrier workflow; serviceability and delivery operations need end-to-end proof                                       |
| Cart and checkout                  | Partial                | customer-app local cart, quote/create order, address collection and payment redirect                                    | public fundraiser selections do not become a durable cart/checkout; auth hand-off loses intent; price/stock drift UX and recovery are incomplete                                   |
| Payment settlement                 | Unsafe                 | Paystack initialization, signature validation, amount/currency checks, payment/order updates, audit/notifications       | check-then-write races allow multiple initializations and concurrent duplicate settlement; no database-enforced single settlement effect                                           |
| Orders and inventory               | Partial                | idempotent creation, conditional reservation, pending expiry, admin status transitions, customer/admin lists            | paid inventory remains reserved forever and stock-on-hand is never consumed; customer order detail route is absent; no tracking/cancellation/return lifecycle                      |
| Refunds                            | Unsafe                 | admin initiation call, refund record, campaign/ledger adjustment and notifications                                      | provider acceptance is treated as success immediately; partial refund marks entire order REFUNDED; cumulative/reftry/webhook/reconciliation semantics are absent                   |
| Campaign lifecycle                 | Substantial            | draft/edit/products, AI pre-screen, human review, activation/rejection, public active lookup, expiry and admin controls | creation UX/onboarding is missing; activation readiness does not require payout setup or at least one sellable priced item; organiser decision notifications/recovery need closure |
| Fundraiser commerce                | Partial                | public active campaign detail and campaign-specific quote/order APIs                                                    | public UI uses placeholder option data and cannot complete campaign checkout while preserving selection through authentication                                                     |
| Campaign accounting                | Unsafe                 | immutable-style ledger service, settlement holds, gross display cache and analytics                                     | ledger effects have no uniqueness constraints; duplicate webhooks can double-credit or repeatedly release payout reserves; reconciliation tooling is not a release gate            |
| Payouts                            | Substantial but unsafe | bank resolution, payout profiles, policy, previews/runs, two-person approval, execution/retry and provider webhooks     | duplicate/out-of-order events are not idempotent; payout-profile default is not DB-enforced; KYC/ownership/ops reconciliation policy is incomplete                                 |
| Moderation and media               | Partial                | AI text/image moderation, human queues, derivatives, size/MIME checks                                                   | virus scan always returns CLEAN; remote fetch follows redirects without DNS/IP revalidation; production quarantine/reprocessing policy is incomplete                               |
| Notifications                      | Substantial            | transactional templates, outbox delivery, admin routes/broadcasts and operational events                                | not every organiser decision has a customer-facing template; delivery SLO, dead-letter dashboard and consent/preference policy need confirmation                                   |
| Admin operations                   | Substantial            | broad catalog, order, campaign, media, pricing, shipping, notification, team, settings and payout screens               | capability breadth lacks Playwright/UAT proof; destructive operations and segregation-of-duties need explicit matrices                                                             |
| Analytics/reporting                | Substantial            | overview, money metrics, campaign snapshot and CSV exports with formula-injection defense                               | KPI definitions need business sign-off; product/campaign filtering and reconciliation drill-down are incomplete                                                                    |
| Audit/observability                | Substantial            | audit events and OpenTelemetry-oriented metrics/traces                                                                  | dashboards, alerts, runbooks, SLOs and evidence that every critical mutation is audited are incomplete                                                                             |
| Documentation/contracts            | Partial                | Swagger annotations and extensive domain docs                                                                           | milestone/README claims contradict the code; current API E2E harness fails; OpenAPI drift is not gated in CI                                                                       |

## Critical business invariants that do not yet hold

1. One provider charge may create at most one successful payment transition, one campaign increment and one `PAYMENT_SETTLED` ledger credit.
2. One payout status transition may release or confirm a reservation at most once, even when events are duplicated, delayed or out of order.
3. A customer action may create at most one active payment attempt for an order.
4. A refund reduces captured value, campaign totals and ledger balance only after provider-confirmed settlement, and cumulative refunds never exceed the captured amount.
5. Stock follows a defined lifecycle: available → reserved → consumed, or reserved → released. Counters cannot become negative or remain reserved indefinitely.
6. An admin session cannot authenticate a customer surface and a customer session cannot authenticate an admin surface.
7. Untrusted media is never published before real scanning and moderation, and remote imports cannot reach private/internal network resources through DNS or redirects.

These invariants should be enforced in PostgreSQL wherever practical, with conditional transitions and unique business-effect keys—not solely by service-level pre-checks.

## Business decisions still required

Engineering can propose defaults, but the owner must approve these policies before the associated ticket is complete:

- who may become an organiser, which identity/bank checks are mandatory, and whether approval is required;
- whether email verification is mandatory for purchase, campaign creation, payouts and admin access;
- campaign activation prerequisites: dates, at least one approved design, a sellable price, stock, payout profile and terms acceptance;
- campaign pause/end behaviour for carts, unpaid orders, refunds and future payouts;
- partial refunds, cancellations, returns, production failures, delivery disputes and who absorbs fees;
- when reserved stock becomes consumed and how cancelled/refunded fulfilled goods affect it;
- payout cadence, minimum, settlement hold, fees, reversal handling and KYC/support escalation;
- Nigeria VAT treatment, price inclusivity, shipping tax, invoice/receipt requirements and accounting exports;
- moderation appeals, content retention, share-link expiry/revocation and data-deletion policy (interim inventory + DSAR APIs: `docs/privacy/ttw-025-data-inventory.md`, TTW-025 — legal sign-off still required);
- supported browser/device matrix, accessibility target and operational SLOs.

## Recommended delivery order

1. **Make verification trustworthy:** align Node/CI, repair lint/format/coverage and the real Postgres/Redis integration harness, then add Playwright foundations.
2. **Protect money and stock:** settlement, payout, initiation, refund and inventory invariants with migrations and concurrency tests.
3. **Close trust boundaries:** admin/customer session isolation, CSRF posture, dependency remediation and safe media ingestion.
4. **Close revenue journeys:** organiser onboarding, real fundraiser variant/cart hand-off, web checkout, customer order detail and recovery states.
5. **Close operations:** tracking/returns, decision notifications, reconciliation, dashboards/alerts, OpenAPI drift and runbooks.
6. **Release proof:** full browser regression, security review, UAT against approved designs and policies, migration rollback rehearsal and controlled staging transaction.

## Evidence highlights

- `apps/api/src/orders/paystack-webhook.service.ts:79-257` performs a read-before-transaction settlement and then increments campaign/ledger state.
- `apps/api/src/orders/paystack-webhook.service.ts:296-331` writes ledger effects after every matching transfer event.
- `apps/api/src/orders/payments.service.ts:52-135` checks for an initiated payment before the provider call and inserts only afterward.
- `apps/api/src/orders/refunds.service.ts:60-146` accepts only PAID orders, then immediately marks an initiated provider refund SUCCEEDED and the whole order REFUNDED.
- `apps/api/src/orders/orders.service.ts:618-690` releases stock only for pre-payment cancellation; no paid-order transition consumes stock.
- `apps/api/prisma/schema.prisma:1445-1468` indexes ledger references but does not uniquely identify business effects.
- `apps/api/src/auth/strategies/jwt.strategy.ts:39-63` falls back across admin and customer cookie names.
- `apps/api/src/media/virus-scan.service.ts:8-25` explicitly identifies its always-CLEAN implementation as a production-blocking stub.
- `apps/api/src/media/media.processor.ts:322-365` follows a remote fetch without redirect/DNS/IP revalidation.
- `apps/app/app/dashboard/fundraiser/page.tsx:100-104` detects organiser API denial, but the UI provides no onboarding path.
