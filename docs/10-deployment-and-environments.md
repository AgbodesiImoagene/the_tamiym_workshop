# Deployment & Environments

This document reflects the deployment-related artifacts that currently exist in the repo.

## Environment tiers

- `development`
- `test`
- `staging` - recommended, not yet formalized in repo config
- `production`

## Backend environment variables in use today

### Required outside test

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

Startup validation in `apps/api/src/app.module.ts` rejects missing values and known placeholder JWT secrets outside test mode.

### Common runtime variables

- `PORT`
- `NODE_ENV`
- `LOG_LEVEL`
- `CORS_ORIGIN`
- `FRONTEND_URL`
- `ADMIN_APP_URL`
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`

### Redis and queues

- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`

### Paystack

- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_PUBLIC_KEY`

### S3-compatible storage

- `S3_ENDPOINT`
- `S3_PUBLIC_URL`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_REGION`

### Observability

- `OTEL_EXPORTER_OTLP_ENDPOINT`

Note: the collector endpoint is configurable, but application tracing and metrics are not fully instrumented yet.

## Local deployment assets that exist in repo

### Docker Compose

`docker-compose.yml` currently provisions:

- `postgres`
- `redis`
- `minio`
- `minio-init`
- With `docker compose --profile observability up -d`: `jaeger`, `otel-collector` (contrib image), `prometheus`, and `grafana` for local telemetry verification

Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` for `apps/api` on the host. UIs: Jaeger `http://localhost:16686`, Prometheus `http://localhost:9090`, Grafana `http://localhost:3333` (anonymous admin enabled for local use).

### OpenTelemetry collector

`otel-collector-config.yaml` defines OTLP receivers and exporters for:

- traces → Jaeger (OTLP gRPC) plus `debug` logging
- metrics → Prometheus scrape endpoint on the collector (`:8889/metrics`)
- logs → `debug` logging

## Supported Node and pnpm runtime

Local development, CI, tests, and production builds use the same contract:

- Node.js 24 (Active LTS), pinned in `.nvmrc` and `package.json` `engines.node`
- pnpm 9, pinned as `packageManager: pnpm@9.0.0` and `engines.pnpm`

Application images live under `docker/` (`Dockerfile.next` for web/app/admin, `Dockerfile.api` for api/worker/scheduler). They use Node 24 + Corepack/`pnpm@9` and run as non-root. Production Compose is `infra/runtime/compose/docker-compose.prod.yml`. Local `docker-compose.yml` still provisions datastore and observability sidecars only.

## Current deployment reality

- The backend is the only part of the repo that is close to deployable infrastructure-wise.
- The frontend apps are not production-ready application surfaces yet.
- The repo contains local-service support, but not a complete production deployment stack or infrastructure-as-code setup.

## Production deployment checklist

Before a production deployment, the repo still needs:

- a formal staging environment
- production-grade secrets management
- HTTPS and cookie-domain policy definition
- database migration release process
- queue worker deployment topology
- object storage bucket policy review
- provider webhook endpoint and retry policy validation
- metrics, tracing, dashboards, and alerting
- rollback and incident-response runbooks

## Current recommendation

Treat deployment documentation as backend-first for now. Pair this document with:

- `03-backend.md`
- `14-auth-and-session-architecture.md`
- `09-observability-otel.md`
- `release-criteria.md`
- `backend-production-readiness.md`

## Session and cookie direction

The target frontend/domain model should assume:

- `web` and `app` share customer session across subdomains
- `admin` uses an isolated admin session policy

That means production deployment still needs explicit decisions for:

- API host and subdomain layout
- parent-domain cookie scope
- distinct customer vs admin cookie names
- CORS allowlist for `web`, `app`, and `admin`
- CSRF strategy for cookie-authenticated cross-subdomain browser requests

See `14-auth-and-session-architecture.md` for the recommended target model.
