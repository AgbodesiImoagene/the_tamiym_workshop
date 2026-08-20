# Backend - NestJS + Prisma

This document reflects the backend as it exists in the repo today.

## Runtime baseline

`apps/api/src/main.ts` currently configures:

- NestJS application bootstrap
- global validation with `ValidationPipe`
- raw-body capture for webhook verification
- cookie parsing
- global route prefix at `/v1`
- Swagger/OpenAPI at `/docs`
- CORS with local frontend origins by default
- `nestjs-pino` logging

## Current top-level module wiring

`AppModule` directly imports:

- `AddressesModule`
- `AdminModule`
- `AnalyticsModule`
- `AuthModule`
- `MailModule`
- `PrismaModule`
- `UsersModule`

That means the backend already exposes real auth, user, address, analytics, and admin endpoints. It also means some other domains exist in code without being imported as first-class top-level modules in `AppModule`.

## Domain modules present in the codebase

The following modules exist under `apps/api/src`:

- `auth`
- `users`
- `addresses`
- `products`
- `inventory`
- `designs`
- `orders`
- `fundraising`
- `payouts`
- `pricing`
- `media`
- `moderation` — cross-cutting AI content moderation (OpenAI `omni-moderation-latest`), three-tier routing
- `discounts`
- `bulk-pricing`
- `analytics`
- `admin`
- `mail`
- `storage`
- `prisma`

## Mounted route groups currently visible from controllers

The repo currently defines controllers for these route groups:

- `/v1/health`
- `/v1/auth/*`
- `/v1/users/profile`
- `/v1/users/addresses/*`
- `/v1/products/*`
- `/v1/categories/*`
- `/v1/orders/*`
- `/v1/webhooks/*`
- `/v1/campaigns/*`
- `/v1/public/fundraisers/*`
- `/v1/payout-profiles/*`
- `/v1/banks/*`
- `/v1/inventory/*`
- `/v1/designs/*`
- `/v1/admin/orders/*`
- `/v1/admin/products/*`
- `/v1/admin/categories/*`
- `/v1/admin/inventory/*`
- `/v1/admin/designs/*`
- `/v1/admin/media/*`
- `/v1/admin/campaigns/*`
- `/v1/admin/payout-runs/*`
- `/v1/admin/payouts/*`
- `/v1/admin/discounts/*`
- `/v1/admin/bulk-pricing/*`
- `/v1/admin/site-settings/*`
- `/v1/admin/analytics/*`
- `/v1/admin/...` shipping endpoints

Because `AdminModule` imports a large part of the domain graph, many business workflows are already reachable through admin endpoints even though the corresponding domain modules are not mounted directly in `AppModule`.

## Campaign lifecycle

The campaign status machine is: `DRAFT → REVIEW → ACTIVE → PAUSED / DISABLED / ENDED`.

- **DRAFT → REVIEW** (`POST /v1/campaigns/:id/submit-for-review`, organiser): AI text moderation runs on the campaign's title, description, and story. Auto-rejects obvious violations (back to DRAFT with `rejectionReason`). Moves clean/ambiguous content to REVIEW with `moderationStatus` reflecting the AI confidence tier. Products and designs are locked once in REVIEW.
- **REVIEW → ACTIVE** (`POST /v1/admin/campaigns/:id/activate`, admin): validates all attached designs are `APPROVED`. Makes the campaign publicly live.
- **REVIEW → DRAFT** (`POST /v1/admin/campaigns/:id/reject`, admin): returns the campaign to DRAFT with a `rejectionReason` shown to the organiser. They may edit and resubmit.
- `GET /v1/admin/campaigns` now includes linked campaign-product design moderation summaries (`design.id`, `design.name`, `design.moderationStatus`, `design.moderationNotes`) so the admin moderation queue can spot blocked submissions without fetching each campaign detail first.

## Moderation architecture

`ModerationModule` (`apps/api/src/moderation/`) is a cross-cutting module imported by `MediaModule`, `DesignsModule`, and `FundraisingModule`.

`ModerationService.moderate({ text?, imageUrl? })` calls OpenAI `omni-moderation-latest` (multi-modal — accepts text + image in one request) and returns `{ status, notes, maxScore }`.

Three-tier routing:

- `maxScore < MODERATION_APPROVE_THRESHOLD` (default 0.3) → `APPROVED`
- `maxScore ≤ MODERATION_REJECT_THRESHOLD` (default 0.7) → `FLAGGED` (human queue)
- `maxScore > MODERATION_REJECT_THRESHOLD` → `REJECTED` (auto-rejected)

Graceful degradation: if `OPENAI_API_KEY` is absent or the API call fails, returns `PENDING` so the item surfaces in the human review queue rather than being silently dropped or auto-approved.

## Auth and security state

Implemented today:

- JWT-based authentication
- cookie auth support
- bearer auth support for Swagger
- role guards and decorators
- startup validation for required JWT and database env vars
- placeholder-secret rejection outside test mode
- request throttling support in auth flows

Still needed before production:

- full cookie security policy review for production domains
- auth/session observability
- account lockout and abuse monitoring strategy
- secret rotation and operational runbooks

## Data and persistence state

Implemented today:

- Prisma schema is extensive and covers users, auth tokens, products, designs, orders, fundraising, payouts, discounts, media, and analytics-related entities
- PostgreSQL is the configured datasource
- Prisma seed and migration config exist

Current caveat:

- Root-level database scripts are not aligned with `apps/api/package.json`, so direct Prisma CLI usage from `apps/api` is the reliable workflow today

## Async and integrations state

Implemented today:

- BullMQ is configured globally
- payout queue is configured
- media queue is configured
- S3-compatible storage service exists
- Paystack provider abstractions and services exist for orders and payouts
- mail module and processor exist

Not yet complete for production:

- end-to-end queue operations runbook
- retry/dead-letter visibility
- external dependency monitoring and alerting
- full webhook lifecycle coverage

## Observability state

Implemented today:

- structured request logging through `nestjs-pino`
- local OpenTelemetry Collector config in repo
- analytics endpoints and services for admin reporting

Not yet implemented in API runtime:

- OpenTelemetry tracing instrumentation
- metrics instrumentation
- trace propagation across HTTP, jobs, and external provider calls

## Testing state

Backend tests exist across many modules, including:

- unit specs colocated with controllers and services
- e2e specs in `apps/api/test`

Current e2e files:

- `app.e2e-spec.ts`
- `auth-role.e2e-spec.ts`
- `products.e2e-spec.ts`

Testing is better than a skeleton repo, but still not enough to declare the backend production ready. Critical money, payout, queue, webhook, and operational failure paths still need explicit release-grade coverage.

## Production-readiness summary

The backend is beyond scaffold stage, but it is not production ready yet. The biggest blockers are:

- incomplete module wiring from `AppModule`
- missing OpenTelemetry instrumentation
- incomplete operational hardening around queues, webhooks, payouts, and alerts
- likely gaps between documented root scripts and real developer workflows
- large feature surface area that still needs integration-level proof

For the actionable backlog, see `backend-production-readiness.md`.
