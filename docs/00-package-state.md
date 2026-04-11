# Package State Documentation

This document describes the current state of the monorepo as it exists in the repository today.

## Snapshot

- Package manager: `pnpm@9.0.0`
- Build orchestration: Turborepo
- Node requirement: `>=18`
- Primary backend: NestJS 11 + Prisma 7 + PostgreSQL
- Frontend apps: Next.js 16 app-router scaffolds

## Monorepo layout

```text
apps/
  api/     NestJS backend with Prisma, BullMQ, Swagger, JWT auth
  web/     Public website scaffold
  app/     Customer application scaffold
  admin/   Admin frontend scaffold
packages/
  config/  Shared TS, ESLint, and theme assets
  types/   Shared enums and generated types
  ui/      Shared UI entrypoint scaffold
docs/      Architecture, backend, deployment, and readiness docs
```

## App status

### `apps/api`

- Most mature part of the repo
- Uses:
  - NestJS
  - Prisma
  - PostgreSQL
  - BullMQ
  - `nestjs-pino`
  - Swagger/OpenAPI
- Runtime setup includes:
  - global validation pipe
  - global `/v1` prefix
  - cookie parsing
  - CORS configuration
  - Swagger at `/docs`
  - health endpoint at `/v1/health`
- Domain folders present in `src/`:
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
  - `products`
  - `storage`
  - `users`
- Test coverage exists across many modules plus e2e specs in `apps/api/test`.
- Important caveat:
  - `AppModule` currently imports `AddressesModule`, `AdminModule`, `AnalyticsModule`, `AuthModule`, `MailModule`, `PrismaModule`, and `UsersModule` directly.
  - Other domain modules are reachable through `AdminModule` imports or remain partially wired rather than mounted as first-class top-level modules.

### `apps/web`

- Next.js 16 scaffold
- Current landing page is still the default starter page
- Not production ready

### `apps/app`

- Next.js 16 scaffold
- Contains starter root page plus early auth/dashboard route files
- Not production ready

### `apps/admin`

- Next.js 16 scaffold
- Contains starter root page plus early auth/admin route files
- Not production ready

## Shared package status

### `packages/config`

- Active shared config package
- Contains:
  - `tsconfig.json`
  - `eslint.config.js`
  - `theme.css`

### `packages/types`

- Active shared types package
- Contains generated enums in `src/enums.generated.ts`

### `packages/ui`

- Minimal package scaffold
- Currently exports from `src/index.ts`

## Local infrastructure in repo

### `docker-compose.yml`

Defines local services for:

- PostgreSQL
- Redis
- MinIO
- OpenTelemetry Collector

### `otel-collector-config.yaml`

- Collector config exists in repo
- App-side tracing and metrics instrumentation is not yet wired in `apps/api/src`

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

### Database workflow today

The root package declares `db:migrate` and `db:seed`, but `apps/api/package.json` does not currently expose matching scripts. Until that is aligned, the reliable workflow is:

```bash
pnpm --dir apps/api prisma migrate dev
pnpm --dir apps/api prisma db seed
```

## Documentation status summary

- Root README now reflects the current repo state
- Backend docs should be read with `docs/03-backend.md`
- Production blockers and next steps live in `docs/backend-production-readiness.md`
