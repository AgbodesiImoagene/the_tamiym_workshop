# Development Environment Setup

This document defines the required local development environment for the monorepo.

## Prerequisites

- Node.js 24 (Active LTS). Install with `nvm` (or equivalent); the repo pins this line in `.nvmrc`.
- pnpm 9, activated through Corepack so it matches `packageManager` in the root `package.json`:

  ```bash
  nvm install
  nvm use
  corepack enable
  ```

  `pnpm install` fails on any other Node or pnpm major because `.npmrc` sets `engine-strict=true`.

- Docker + Docker Compose
- PostgreSQL client tools (optional but helpful)

## Monorepo tooling

- Package manager: pnpm 9 (Corepack)
- Task runner/build cache: turborepo
- Formatting: prettier (read-only check via `pnpm format:check`; mutate with `pnpm format`)
- Linting: eslint via `pnpm lint` (read-only). Intentional autofixes use `pnpm lint:fix`.
- Type checking: TypeScript strict mode
- Coverage: API coverage floors live in `apps/api/coverage-ratchet.json` and are enforced by `pnpm coverage:ratchet`. Changed executable lines under `apps/api/src` must meet `pnpm coverage:diff` (default 80% vs `origin/main`).

### Generated / excluded artefacts

Do not hand-format or lint generated output. Root `.prettierignore` and package ESLint ignores exclude:

- `apps/api/src/generated/**` (Prisma Client)
- `packages/types/src/enums.generated.ts`
- `**/next-env.d.ts`, `dist`, `.next`, `coverage`, `.turbo`, lockfiles

Regenerate Prisma Client with `pnpm db:generate` and enums via `pnpm --filter @tamiym/types generate:enums` rather than editing generated files.

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
- `pnpm lint` — read-only ESLint across workspaces
- `pnpm lint:fix` — intentional ESLint autofix (not a CI verify command)
- `pnpm test:e2e:smoke` — Chromium Playwright smoke across `web` / `app` / `admin` (requires build + test DB seed; see `tests/e2e/README.md`)
- `pnpm test:e2e:matrix` — Playwright full-matrix script (Chromium + Firefox/WebKit web projects)
- `pnpm format:check` / `pnpm format`
- `pnpm typecheck`
- `pnpm test` — unit tests
- `pnpm test:integration` — API integration/e2e (`pnpm --filter api test:e2e`); requires Postgres test DB + Redis and `apps/api/.env.test` (see `.env.test.example`)
- `pnpm test:coverage` — full coverage run
- `pnpm coverage:ratchet` — fail if API aggregate coverage drops below committed floors
- `pnpm coverage:diff` — fail if changed API executable lines are under the diff-coverage floor
- `pnpm verify` — local composite of the release-facing unit/format/coverage/build gates (integration runs in CI’s API Integration job)
- `pnpm db:migrate`
- `pnpm db:seed`
- `pnpm db:generate` — required before `pnpm typecheck` and `pnpm build` (Prisma Client is gitignored)

### API integration harness (TTW-003)

1. Copy `apps/api/.env.test.example` → `apps/api/.env.test` and point `DATABASE_URL` at a dedicated DB whose name matches `/test|e2e/i` (e.g. `tamiym_workshop_test`).
2. Set `REDIS_DB=15` (or another unused logical DB) so teardown can `FLUSHDB` safely.
3. Apply schema: `pnpm --filter api exec prisma migrate deploy` (globalSetup also does this).
4. Existing non-empty developer DBs that predate the baseline migration need a one-time `prisma migrate resolve --applied 20260819100000_baseline` before `migrate deploy`.
5. Run `pnpm --filter api test:e2e` (sets `NODE_OPTIONS=--experimental-vm-modules` for Prisma 7). Open-handle proof: `node scripts/quality/prove-e2e-open-handles.mjs`.

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
