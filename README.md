# Tamiym Workshop

Monorepo for the Tamiym Workshop platform. The repo currently contains a substantially built NestJS backend in `apps/api` and three Next.js frontend apps in `apps/web`, `apps/app`, and `apps/admin` that are still mostly scaffold-level.

## Current repo state

- `apps/api` is the most developed part of the repo.
- The API has working modules for auth, users, addresses, admin, analytics, products, orders, fundraising, payouts, pricing, media, discounts, bulk pricing, and inventory.
- Swagger is enabled at `/docs`, request validation is global, JWT auth is in place, and the API uses Prisma with PostgreSQL.
- Several backend modules exist in code but are not imported directly by `AppModule`; they are exposed through `AdminModule` or remain partially wired.
- `apps/web`, `apps/app`, and `apps/admin` still contain mostly `create-next-app` starter pages plus a few early routes.

For the backend production backlog, see `docs/backend-production-readiness.md`.

## Repo layout

```text
the_tamiym_workshop/
├── apps/
│   ├── api/     # NestJS backend API
│   ├── web/     # Public website scaffold
│   ├── app/     # Customer app scaffold
│   └── admin/   # Admin app scaffold
├── packages/
│   ├── config/  # Shared TS/ESLint/theme config
│   ├── types/   # Shared enums/types
│   └── ui/      # Shared UI package scaffold
├── docs/        # Architecture, backend, deployment, readiness docs
└── assets/      # Brand and reference assets
```

## Getting started

### Prerequisites

- Node.js 24 (Active LTS). `nvm use` reads `.nvmrc`.
- pnpm 9 via Corepack (`corepack enable`), matching `packageManager` in the root `package.json`.
- Docker and Docker Compose

### Install

```bash
pnpm install
cp apps/api/.env.example apps/api/.env.local
docker-compose up -d
```

### Local services

`docker-compose.yml` starts:

- PostgreSQL on `5432`
- Redis on `6379`
- MinIO on `9000` with console on `9001`
- OpenTelemetry Collector on `4317` and `4318` when the `observability` profile is enabled

### Run the apps

```bash
pnpm dev
```

Expected local ports:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- App: `http://localhost:3002`
- Admin: `http://localhost:3003`

## Useful commands

From the repo root:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:coverage
pnpm format
pnpm format:check
```

For API-specific work:

```bash
pnpm --filter api dev
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --dir apps/api prisma migrate dev
pnpm --dir apps/api prisma db seed
```

## Backend highlights

- Global route prefix: `/v1`
- Swagger UI: `/docs`
- Health endpoint: `/v1/health`
- Auth: cookie-based JWT plus bearer support for Swagger
- Data: Prisma + PostgreSQL
- Background jobs: BullMQ with Redis
- Object storage: S3-compatible configuration via MinIO/S3 env vars

## Documentation map

- `docs/README.md` - docs index and implementation guide
- `docs/03-backend.md` - backend module map and runtime state
- `docs/10-deployment-and-environments.md` - environment and deployment notes
- `docs/backend-production-readiness.md` - backend production checklist by module

## Important caveats

- The frontend apps are not feature-complete yet and should be treated as scaffolds.
- The root package exposes `db:migrate` and `db:seed`, but the reliable current workflow is to run Prisma commands from `apps/api`.
- OpenTelemetry collector config exists in the repo, but application-level tracing and metrics instrumentation are not yet wired into the API runtime.
