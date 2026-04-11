# Backend Production Readiness

This is the repo-state production-readiness tracker for the backend in `apps/api`.

It is intentionally blunt: the goal is to document what exists, what is partially done, and what still blocks a production release.

## Executive summary

The backend is well beyond scaffold stage, but it is not production ready yet.

The main release blockers are:

- incomplete or uneven top-level module wiring
- missing OpenTelemetry instrumentation for traces and metrics
- incomplete operational hardening for queues, webhooks, payouts, and alerts
- integration and failure-path coverage that is not yet release-grade
- partial mismatch between documented workflows and actual scripts

## Definition of done for backend production readiness

The backend should not be considered production ready until all of the following are true:

- every intended public and admin module is wired intentionally into the runtime
- Swagger reflects the real mounted API surface
- money-moving flows are idempotent and fully observable
- queues and schedulers have retries, alerts, and operational runbooks
- secrets, cookies, CORS, and webhook verification are production-reviewed
- critical paths have e2e or integration coverage
- tracing, metrics, dashboards, and alerts exist for core user and money flows

## Cross-cutting next steps

### 1. Runtime composition

- Audit `AppModule` and make an explicit decision for each domain module:
  - import directly
  - expose only through `AdminModule`
  - mark as internal-only helper
- Remove accidental coupling where admin imports are the only reason a customer-facing domain becomes reachable.
- Verify Swagger output against the intended route surface after wiring changes.

### 2. Observability

- OpenTelemetry SDK bootstrap is now wired into the API runtime.
- Baseline traces and metrics now exist for:
  - auth login outcomes
  - checkout and payment initiation
  - webhook handling
  - payout creation and execution
  - media processing jobs
  - queue job execution
- Remaining observability work:
  - add deeper product-read traces if query debugging becomes a real operational need
  - add dashboards and alert routing for request health, payouts, queues, and webhooks
  - validate OTLP export and retention policy in staging/production

### 3. Release engineering

- Align root database scripts with real `apps/api` scripts.
- Add a documented migration workflow for staging and production.
- Define worker deployment topology for BullMQ processors and schedulers.
- Add a release checklist that includes migrations, queue health, and webhook validation.

### 4. Security hardening

- Review cookie settings for secure, same-site, and domain handling in production.
- Review CORS policy for staging and production origins.
- Add abuse monitoring and lockout strategy for auth endpoints.
- Add operational guidance for secret rotation and webhook secret management.

### 5. Test hardening

- Expand e2e coverage for orders, fundraising, admin, payouts, and webhooks.
- Add explicit failure-path tests for provider outages, signature failures, retries, and duplicate events.
- Gate releases on the critical-flow test suite.

## Module-by-module status

### `auth`

Current state:

- Implemented controllers, DTOs, service, guards, decorators, and JWT strategy
- Includes register, login, verification, reset/change password, and resend verification flows
- Swagger annotations are present
- Unit tests exist

Production-readiness todos:

- Verify secure cookie behavior in production
- Add stronger abuse and rate-limit monitoring
- Security-sensitive auth audit logging now exists for login, logout, refresh, email verification, reset password, and change password
- Add e2e coverage for full password-reset and verification lifecycle

### `users`

Current state:

- Profile read and update endpoints exist
- Mounted directly in `AppModule`
- Unit tests exist

Production-readiness todos:

- Confirm response contracts and validation edge cases
- Add audit logging for profile changes if required by compliance needs
- Add e2e coverage that exercises auth boundary and profile mutation flows

### `addresses`

Current state:

- CRUD endpoints exist under `/v1/users/addresses`
- Mounted directly in `AppModule`
- Unit tests exist

Production-readiness todos:

- Validate ownership and default-address invariants under concurrency
- Add integration coverage for default-address switching
- Confirm address normalization and Nigeria-specific validation rules

### `products`

Current state:

- Products and categories controllers/services exist
- Large DTO surface suggests meaningful admin/catalog work is underway
- Module exists and is imported through `AdminModule`
- Unit tests and e2e coverage exist

Production-readiness todos:

- Decide whether customer-facing product routes should be imported directly by `AppModule`
- Validate media upload and product-image workflows end to end
- Add query-performance checks for listing and filtering
- Add seed fixtures that reflect realistic catalog data

### `inventory`

Current state:

- Inventory controller/service/module exist
- Admin controller also exists
- Unit tests exist

Production-readiness todos:

- Validate race conditions between inventory updates and order placement
- Define stock reservation policy if needed
- Add audit logging around stock adjustments

### `designs`

Current state:

- Full CRUD at `/v1/designs/*` with JWT auth; admin moderation at `/v1/admin/designs/*`
- AI moderation (OpenAI `omni-moderation-latest`) on every create/update — three-tier routing; falls back to `PENDING` when no screenable content or API key absent
- `POST /v1/designs/:id/thumbnail` — multipart upload to S3, updates `Design.thumbnailUrl`; no `MediaAsset` record (system derivative)
- `POST /v1/designs/:id/duplicate` — clones design + `DesignView` rows, resets moderation to `PENDING`
- `POST /v1/designs/:id/share` — generates a 12-char URL-safe share token; persisted to `Design.shareToken`
- `GET /v1/public/designs/:shareToken` — public (no auth) read-only view via `PublicDesignsController`
- `upsertDesignViews()` called after every create/update — syncs `DesignView` rows from `fabricJson.objects` in `designData`
- New `DesignAssetsModule` at `/v1/design-assets/upload` — wraps `MediaService`, creates `DesignAsset` row, returns `{ designAssetId, originalUrl, status: "processing" }`
- `GET /v1/products/:id/workshop` — public endpoint returning full workshop context (options, views, print areas, template layers with image URLs, effects) in a single request
- Full unit test coverage (32 tests)

Production-readiness todos:

- Add storage lifecycle documentation for `thumbnails/` prefix in S3
- Add e2e/integration tests for share link flow (token generation → public read → expiry)

### `moderation`

Current state:

- Standalone `ModerationModule` at `apps/api/src/moderation/`
- `ModerationService` calls OpenAI `omni-moderation-latest` for both text and images in a single multi-modal request
- Three-tier routing: `maxScore < APPROVE_THRESHOLD` → `APPROVED`; between thresholds → `FLAGGED` (human queue); `> REJECT_THRESHOLD` → `REJECTED`
- Thresholds configurable via `MODERATION_APPROVE_THRESHOLD` / `MODERATION_REJECT_THRESHOLD` env vars (defaults 0.3 / 0.7)
- Graceful degradation: returns `PENDING` (human queue) if `OPENAI_API_KEY` absent or API call fails
- Full unit test coverage (10 tests)
- Used by: `MediaModule` (image assets), `DesignsModule` (design text + thumbnail), `FundraisingModule` (campaign text)

Production-readiness todos:

- Wire real `OPENAI_API_KEY` in production environment
- Consider per-category threshold overrides for high-risk categories (e.g. `sexual/minors` always auto-reject at any score)
- Add operational alerting when API failure rate is high (falling back to PENDING queue too often)
- Add admin dashboard metric: AI auto-approve/flag/reject rates

### `media`

Current state:

- Media module, service, processor, and virus-scan service exist
- BullMQ queue is configured
- S3-compatible storage service exists
- `ModerationService` (from `ModerationModule`) called in processor — three-tier routing applied: `REJECTED` assets fail; `FLAGGED` assets are `READY` but surface in admin queue; `APPROVED` assets proceed normally
- `moderationNotes` stored on `MediaAsset` for all outcomes
- Unit tests updated (4 tests)

Production-readiness todos:

- Define real virus-scanning implementation and failure behavior
- Add operational dashboards for queue depth, retries, and failed jobs
- Document bucket lifecycle, retention, and cleanup behavior
- Add integration coverage for upload to processing to ready/failure states

### `orders`

Current state:

- Orders controller/service/module exist
- Payments, refunds, webhook handling, and order expiry services exist
- Unit tests and e2e coverage exist
- Module is imported through `AdminModule` and `FundraisingModule`

Production-readiness todos:

- Make route wiring explicit from the application root
- Prove idempotency for payment initiation and webhook settlement
- Add end-to-end tests for order expiry, refund flow, duplicate webhook delivery, and partial failure recovery
- Add observability for each order status transition

### `pricing`

Current state:

- Pricing module and service exist
- Currency rounding helper and tests exist

Production-readiness todos:

- Add integration tests covering real order and campaign pricing paths
- Document source-of-truth ownership between pricing, discounts, and bulk pricing
- Confirm rounding behavior at API boundaries and database writes

### `discounts`

Current state:

- Service and module exist
- Admin controller exposes management endpoints

Production-readiness todos:

- Add dedicated unit tests if still missing
- Add business-rule validation for stacking, date windows, and scope conflicts
- Add audit logs for discount creation and mutation

### `bulk-pricing`

Current state:

- Service and module exist
- Admin controller exposes management endpoints

Production-readiness todos:

- Add dedicated service tests if still missing
- Validate interaction with standard pricing and discounts
- Document precedence rules clearly in code and docs

### `fundraising`

Current state:

- Campaigns, public fundraisers, payout profiles, and banks controllers exist
- Full campaign review lifecycle implemented: `DRAFT → REVIEW → ACTIVE` (or back to `DRAFT` on rejection)
- `POST /v1/campaigns/:id/submit-for-review` triggers AI text moderation on title + description + story; auto-rejects obvious violations, moves ambiguous/clean content to `REVIEW` for human admin
- `POST /v1/admin/campaigns/:id/activate` validates all attached designs are `APPROVED` before going live
- `POST /v1/admin/campaigns/:id/reject` returns campaign to `DRAFT` with a rejection reason shown to the organiser
- Product/design mutation is locked on `ACTIVE` and `REVIEW` campaigns — only permitted on `DRAFT`/`PAUSED`
- `Campaign` schema now includes `moderationStatus`, `moderationNotes`, `rejectionReason`
- 28 unit tests covering all new and existing paths

Production-readiness todos:

- Add integration tests for campaign creation, submission, activation, and public checkout linkage
- Add reporting and alerting around campaign payout eligibility
- Notify organiser by email when campaign is approved or rejected (hook into mail/notification system)

### `payouts`

Current state:

- Services exist for payouts, payout runs, scheduling, ledger management, execution processor, and Paystack transfer provider
- Queue is configured
- Several unit tests exist
- Admin payout controllers exist

Production-readiness todos:

- Add transfer webhook lifecycle coverage if not already fully covered
- Add runbook for failed runs, retries, reversals, and reconciliation
- Baseline metrics exist for payout and payout-run outcomes; alerts and dashboards still need to be defined
- Validate exactly-once behavior around ledger updates and transfer state changes

### `analytics`

Current state:

- Analytics module is mounted directly in `AppModule`
- Admin analytics controller and service exist
- Unit tests exist

Production-readiness todos:

- Validate performance of analytics queries on production-like data volume
- Add dashboards and alerts, not just endpoints
- Define CSV/export strategy if analytics outputs are part of release scope

### `admin`

Current state:

- Admin module imports a large share of business modules
- Controllers exist for orders, products, categories, inventory, designs, campaigns, payouts, payout runs, discounts, bulk pricing, shipping, and site settings

Production-readiness todos:

- Review admin auth and role-protection coverage end to end
- Audit logging now covers site settings, campaign status updates, payouts, payout runs, refunds, and admin order status changes; broader catalog/inventory/shipping/discount coverage is still pending
- Reduce accidental coupling by clarifying which admin controllers are façades over domain services

### `mail`

Current state:

- Mail module, service, and processor exist

Production-readiness todos:

- Confirm provider configuration and delivery retry behavior
- Add template/versioning strategy
- Add delivery success/failure metrics and alerts

### `storage`

Current state:

- S3-compatible storage service exists

Production-readiness todos:

- Confirm production bucket policy and credentials handling
- Add content-type, antivirus, and public/private access policy review
- Add lifecycle rules for cleanup of abandoned or rejected assets

### `prisma`

Current state:

- Prisma module/service exist
- Extensive schema exists
- Prisma config includes migrations and seed configuration

Production-readiness todos:

- Validate migration history and zero-downtime strategy
- Add backup, restore, and rollback runbooks
- Review indexes and query plans for high-traffic endpoints

## Recommended execution order

1. Fix explicit module wiring and route-surface clarity.
2. Add OpenTelemetry instrumentation and core metrics.
3. Harden money and queue flows with integration tests.
4. Add security and audit coverage for admin and auth actions.
5. Finalize deployment, migration, and incident-response runbooks.

## Release gate

Do not call the backend production ready until this file, `release-criteria.md`, and `03-backend.md` all agree on the current state and no item above is being hand-waved as "follow-up."
