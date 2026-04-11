# Tamiym Workshop API

NestJS backend for the Tamiym Workshop platform.

## Current state

This app is the most developed part of the monorepo. It already includes:

- Swagger/OpenAPI at `/docs`
- global `/v1` route prefix
- JWT auth with cookie support
- Prisma + PostgreSQL
- request validation
- structured logging with `nestjs-pino`
- Redis-backed BullMQ queues (including the `mail` worker in-process with the API)
- domain modules for orders, products, fundraising, payouts, media, pricing, and admin workflows

It is not production ready yet. See `../../docs/backend-production-readiness.md` for the detailed backlog.

## Run locally

From the repo root:

```bash
pnpm --filter api dev
```

Or from this directory:

```bash
pnpm dev
```

Default local URL:

- API: `http://localhost:3001`
- Swagger: `http://localhost:3001/docs`
- Health: `http://localhost:3001/v1/health`

## Environment setup

Create a local env file:

```bash
cp .env.example .env.local
```

Required outside test:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

Additional env vars exist for:

- Redis
- SMTP / transactional email (`MAIL_*`, optional `ORDER_PLACE_NOTIFICATION_EMAIL`, `NOTIFICATION_OUTBOX_*`)
- Paystack
- S3-compatible object storage
- logging
- OpenTelemetry collector endpoint
- optional `OTEL_SERVICE_NAME` and `OTEL_METRIC_EXPORT_INTERVAL_MS`

## Database workflow

Reliable current workflow:

```bash
pnpm prisma migrate dev
pnpm prisma db seed
```

Useful utility scripts:

```bash
# Create or promote an admin account in the current DATABASE_URL
pnpm run admin:create -- --email admin@example.com --password "StrongPassword1!"

# Seed deterministic dummy data into the test database from .env.test
pnpm run seed:e2e
```

Notes:

- `admin:create` will promote an existing user to `ADMIN` if the email already exists.
- `seed:e2e` is intentionally guarded and refuses to run against a non-test database unless `ALLOW_NON_TEST_DATABASE_SEED=true` is set.

## Tests

```bash
pnpm test
pnpm test:e2e
pnpm test:coverage
```

## Email (transactional)

- **Auth:** registration verification and password reset are queued on the `mail` BullMQ queue and sent via `@nestjs-modules/mailer` (Handlebars templates under `src/mail/templates/`).
- **Orders:** when `ORDER_PLACE_NOTIFICATION_EMAIL` is set, a row is written to `notification_outbox` and a job is queued; a cron every two minutes also requeues any stranded `PENDING` rows.
- **Payments:** after Paystack `charge.success`, a `PaymentConfirmed` outbox row is created for the customer email and queued the same way.
- **Order lifecycle (customer):** when an admin updates an order to `PROCESSING`, `FULFILLED`, `DELIVERED`, or `CANCELLED`, the buyer gets the matching transactional email (same outbox + queue).
- **Refunds (customer):** after a successful admin-initiated refund, the buyer receives `RefundCompleted`.
- **Design moderation (customer):** when an admin sets moderation to `APPROVED` or `REJECTED`, the design owner is emailed.
- **Organizer payouts:** when Paystack transfer webhooks mark a payout `SUCCEEDED` or `FAILED`, the recipient organizer is emailed.
- **Delivery:** the worker loads each row, claims it (`PENDING` → `PROCESSING`), renders the appropriate template (brand logo via CID attachment from `src/mail/assets/`), and marks `SENT` or `FAILED`. Stale `PROCESSING` rows older than `NOTIFICATION_OUTBOX_STALE_PROCESSING_MINUTES` are reset to `PENDING` for retry.
- **Admin broadcast:** `POST /v1/admin/notifications/email/broadcast` (admin JWT) accepts `audience`, optional `userIds`, `subject`, and `htmlBody`. HTML is sanitized; use `dryRun: true` for a recipient count and sample addresses. Sends are throttled (see `ADMIN_EMAIL_BROADCAST_*` in `src/constants.ts`) and capped by `ADMIN_EMAIL_BROADCAST_MAX_RECIPIENTS`.

## Module map

Current source folders under `src/`:

- `addresses`
- `admin`
- `analytics`
- `auth`
- `bulk-pricing`
- `designs`
- `discounts`
- `fundraising`
- `inventory`
- `mail`
- `media`
- `orders`
- `payouts`
- `pricing`
- `prisma`
- `products`
- `storage`
- `users`

## Important caveats

- `AppModule` directly imports only a subset of the modules in `src/`.
- Some business domains are currently exposed through `AdminModule` imports rather than being mounted directly at the application root.
- OpenTelemetry bootstrap, baseline traces, and baseline metrics are now wired into the API runtime; dashboards, alerts, and environment-specific exporter validation are still pending.
