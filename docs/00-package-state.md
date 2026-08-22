# Package State Documentation

This document describes the current state of the monorepo as it exists in the repository today.

**Snapshot date:** 2026-08-22
**Status vocabulary:** see `docs/README.md` (Documentation ownership) and `docs/tickets/ttw-052-reconcile-project-documentation.md`.

## Snapshot

- Package manager: `pnpm@9.0.0`
- Build orchestration: Turborepo
- Node requirement: `^24` (see `.nvmrc` and root `package.json` `engines`)
- Primary backend: NestJS 11 + Prisma 7 + PostgreSQL
- Frontend apps: Next.js 16 app-router applications with substantial routed surfaces (not default starter scaffolds)

## Monorepo layout

```text
apps/
  api/     NestJS backend with Prisma, BullMQ, Swagger, JWT auth, OpenTelemetry
  web/     Public website (marketing, auth, fundraiser discovery/checkout)
  app/     Customer application (dashboard, design workshop, orders, fundraising)
  admin/   Admin frontend (catalog, orders, moderation, payouts, analytics)
packages/
  config/  Shared TS, ESLint, and theme assets
  types/   Shared enums and generated types
  ui/      Shared UI entrypoint scaffold
docs/      Architecture, backend, deployment, and readiness docs
```

## App status

### `apps/api`

- Most mature part of the repo (**Implemented-unverified** overall; domain tickets in `docs/tickets/README.md` record finer-grained evidence).
- Uses:
  - NestJS
  - Prisma
  - PostgreSQL
  - BullMQ
  - `nestjs-pino`
  - Swagger/OpenAPI
  - OpenTelemetry SDK bootstrap (`src/observability/otel.ts`, started from `src/main.ts`)
- Runtime setup includes:
  - global validation pipe
  - global `/v1` prefix
  - cookie parsing
  - CORS configuration
  - Swagger at `/docs`
  - health endpoint at `/v1/health`
- Domain folders present in `src/` include `addresses`, `admin`, `analytics`, `auth`, `bulk-pricing`, `designs`, `discounts`, `fundraising`, `inventory`, `mail`, `media`, `orders`, `payouts`, `pricing`, `products`, `storage`, and `users`.
- Test coverage exists across many modules plus e2e specs in `apps/api/test`.
- Important caveat:
  - `AppModule` imports a subset of modules directly; other domain modules are reachable through `AdminModule` imports or remain partially wired rather than mounted as first-class top-level modules.

### `apps/web`

- Next.js 16 public site with routed pages for marketing (`/`, `/about`), supporter auth (`/auth/*`), email verification, and fundraiser discovery/checkout (`/fundraiser/*`, order confirmation).
- **Partial** — core fundraiser commerce paths exist; broader catalogue/marketing parity and release UAT remain open (see `docs/tickets/README.md`).

### `apps/app`

- Next.js 16 customer app with dashboard routes for products, cart, checkout, profile/settings, design workshop, orders, and organiser fundraising.
- Auth flows and API-backed pages are wired; **Partial** until browser UAT and remaining journey tickets are verified.

### `apps/admin`

- Next.js 16 admin app with routes for catalog, pricing, orders, campaigns, moderation, payouts, notifications, shipping zones, team, and site settings.
- **Partial** — substantial admin surface exists; release proof and remaining policy tickets are tracked separately.

## Shared package status

### `packages/config`

- Active shared config package
- Contains:
  - `tsconfig.json`
  - `eslint.config.js`
  - `theme.css`

### `packages/types`

- Active shared types package
- Contains generated enums in `src/enums.generated.ts` and OpenAPI-derived types

### `packages/ui`

- Minimal package scaffold
- Currently exports from `src/index.ts`

## Local infrastructure in repo

### `docker-compose.yml`

Defines local services for:

- PostgreSQL
- Redis
- MinIO
- OpenTelemetry Collector (optional `observability` profile adds Jaeger, Prometheus, Grafana)

### `otel-collector-config.yaml`

- Collector config exists in repo
- API-side tracing and metrics instrumentation is bootstrapped in `apps/api/src/observability/otel.ts` and exported via OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (see `docs/09-observability-otel.md`).

## Script reality check

### Root scripts that are valid today

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:coverage`
- `pnpm format`
- `pnpm format:check`
- `pnpm docs:validate`
- `pnpm docs:validate:test`

### Database workflow today

Root `package.json` declares `db:migrate` and `db:seed`, but `apps/api/package.json` does not currently expose matching scripts. Until that is aligned, the reliable workflow is:

```bash
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma db seed
```

## Documentation status summary

- Root README reflects the current repo state
- Backend docs should be read with `docs/03-backend.md`
- Production blockers and next steps live in `docs/backend-production-readiness.md`
- Volatile delivery status is owned by `docs/tickets/README.md` (validated in CI via `pnpm docs:validate`)
