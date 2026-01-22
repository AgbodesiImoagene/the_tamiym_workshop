# Development Environment Setup

This document defines the required local development environment for the monorepo.

## Prerequisites

- Node.js LTS (recommend using `nvm`)
- pnpm
- Docker + Docker Compose
- PostgreSQL client tools (optional but helpful)

## Monorepo tooling

- Package manager: pnpm
- Task runner/build cache: turborepo
- Formatting: prettier
- Linting: eslint
- Type checking: TypeScript strict mode

## Local services (Docker Compose)

Required:

- PostgreSQL (primary DB)
  Optional but recommended:
- Redis (jobs / rate-limiting / event workers)
- OpenTelemetry Collector (local traces/metrics routing)

### Suggested docker-compose services

- `postgres`
- `redis`
- `otel-collector`

## Environment variables

- Store env vars per app in `.env.local` files (never commit secrets).
- Provide `.env.example` templates for:
  - `apps/api`
  - `apps/web`
  - `apps/app`
  - `apps/admin`

Minimum API env vars (example names):

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET` (or signature verification secret mechanism)
- `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` (if using S3-compatible storage)
- `OTEL_EXPORTER_OTLP_ENDPOINT` (if using OTel collector)
- `LOG_LEVEL`

## Database & Prisma workflow

- `prisma migrate dev` for local migrations
- `prisma db seed` for sample data (products, categories, admin user)
- Prisma schema changes must include:
  - migration
  - updated seed if relevant
  - tests updated

## Standard dev commands (expected)

The repo should provide these root-level scripts:

- `pnpm dev` — run all apps/services in dev mode
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` — unit tests
- `pnpm test:integration` — integration tests
- `pnpm test:coverage` — full coverage run
- `pnpm db:migrate`
- `pnpm db:seed`

## Running apps locally

- `apps/api` runs on `http://localhost:3001` (example)
- Swagger UI: `http://localhost:3001/docs`
- `apps/web`: `http://localhost:3000`
- `apps/app`: `http://localhost:3002`
- `apps/admin`: `http://localhost:3003`

(Exact ports can differ; they must be documented and consistent.)

## Development standards (must follow)

- Every backend module must include tests (unit + integration where applicable).
- All payment/webhook handlers must be idempotent and tested.
- Any admin mutation endpoint must be authorization-tested.
- Keep fixtures and factories for tests to avoid repetitive setup.

## Seed data expectations

Seed data must enable E2E sanity checks:

- At least 10 products across 2–3 categories
- Variants with size/color combinations
- 1 admin user (credentials documented in `.env.example` notes)
- A sample fundraiser campaign
- A sample design object (structured layers)
