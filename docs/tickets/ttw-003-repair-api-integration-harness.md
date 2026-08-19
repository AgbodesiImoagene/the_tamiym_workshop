# TTW-003 — Repair the API integration-test harness

**Epic:** 0 — Trustworthy delivery system  
**Status:** Complete  
**Risk:** High  
**Blocked by:** TTW-001, TTW-002  
**Blocks:** TTW-004, TTW-010, TTW-011, TTW-012, TTW-013, TTW-014

## Background

API unit tests pass, but the E2E process cannot boot the production Nest/Prisma stack under the current Jest configuration and leaves process handles open. Critical concurrency and persistence claims therefore lack real PostgreSQL/Redis evidence.

Reproduced on Node 24.19.0 / pnpm 9.0.0 against `tamiym_workshop_test` + local Redis:

```text
pnpm exec jest --config ./test/jest-e2e.json --runInBand --forceExit --testPathPatterns='app\.e2e-spec'
→ TypeError: A dynamic import callback was invoked without --experimental-vm-modules
  at apps/api/src/generated/prisma/internal/class.ts:42
  at PrismaService.onModuleInit (apps/api/src/prisma/prisma.service.ts:50)
```

Additional harness defects observed in exploration:

- `test:e2e` / `test:integration` are identical aliases with a minimal `test/jest-e2e.json` (no env load, no global setup/teardown, no open-handle gate).
- `ConfigModule` loads only `.env.local` / `.env`, never `.env.test`.
- `app.e2e-spec.ts` still asserts Nest scaffold `GET /` → `Hello World!` while production exposes `GET /v1/health`.
- No `prisma/migrations` directory; CI never runs integration and has no Postgres/Redis services.
- After Nest close, Jest `--detectOpenHandles` reports a mailer `CustomGC` handle from `HandlebarsAdapter` with `inlineCssEnabled: true`.
- `ScheduleModule.forRoot()` is registered twice in `AppModule`, doubling cron timers under the same app.

## Proposal

Build a deterministic integration harness that boots production `AppModule` against an isolated Postgres database and Redis logical DB, applies schema via a committed baseline migration, loads `.env.test`, fixes Prisma 7’s Jest ESM requirement, shares one Nest bootstrap helper, shuts down cleanly, and runs in CI with service containers plus failure log artefacts.

## Invariants

- Tests exercise the real schema, transactions, guards, interceptors and queue wiring.
- Every test run starts from known data and releases all handles.
- Parallel runs use isolated databases/namespaces (dedicated test DB name + Redis DB index).
- External provider boundaries (Paystack, real SMTP, real S3) stay mock/local; Postgres/Redis/BullMQ/Prisma are real.

## Implementation plan

1. Capture baseline evidence and design review in this ticket.
2. Add baseline Prisma migration from empty → current schema; wire test globalSetup to `migrate deploy` (guarded to test DB names) and optional seed.
3. Fix Jest/scripts: `NODE_OPTIONS=--experimental-vm-modules`, load `.env.test`, `maxWorkers: 1`, shared bootstrap/teardown helper.
4. Production harness hygiene: ConfigModule includes `.env.test` under `NODE_ENV=test`; Redis connection honors `REDIS_DB`; disable Handlebars inline CSS in test; remove duplicate `ScheduleModule.forRoot()`.
5. Rewrite smoke specs (health, auth role boundary, products list) on the shared bootstrap.
6. Add CI Integration job (Postgres 16 + Redis 7 services), repeated-run / open-handle proof script, and docs updates.
7. Independent review → commit → PR.

## Test and observability plan

- Unit/component: N/A beyond existing unit suites remaining green.
- Integration/e2e: `pnpm --filter api test:e2e` twice; health, register/role 403, products/categories 200.
- Failure, retry, and concurrency: open-handle check without `--forceExit`; intentional missing `DATABASE_URL` fails closed.
- Logs, metrics, traces, and alerts: upload Jest output on CI failure; redact secrets in artefacts.

## References

- `apps/api/test/app.e2e-spec.ts` — current E2E entry point (stale Hello World).
- `apps/api/package.json` — Jest/test scripts.
- `apps/api/src/prisma/prisma.service.ts` — production database lifecycle.
- `apps/api/src/mail/mail.module.ts` — HandlebarsAdapter / CustomGC source.
- `.github/workflows/ci.yml` — no integration job today.

## Acceptance criteria

- [x] `pnpm --filter api test:e2e` boots the production module and passes repeatedly.
- [x] PostgreSQL and Redis state is isolated and deterministic.
- [x] No open handles remain after completion.
- [x] CI runs the integration suite and preserves useful failure artifacts.

## Out of scope

- Individual business concurrency regressions → TTW-010 through TTW-014.
- Testcontainers-based local Docker (blocked here by missing `docker` group; GHA service containers + dedicated local test DB are the disposable path).
- Full production migration cutover runbooks beyond documenting baseline `migrate resolve` for existing non-empty DBs → follow-up with ops if needed.

## Design review

**Reviewer:** implementing agent (TTW-003)  
**Date:** 2026-08-19  
**Verdict:** Proceed

### Blast radius

- `apps/api` test harness, CI workflow, Prisma migrations baseline, small production config tweaks (`ConfigModule` env paths, Redis DB index, mailer CSS in test, duplicate ScheduleModule).
- Does not change payment/payout business logic.

### Duplication check

- No existing Testcontainers or e2e globalSetup. Unit Jest remains separate (`rootDir: src`). Root `verify` stays unit-focused; integration is an explicit CI job (matches TTW-002 decision that verify already includes unit+coverage+build).

### Proposed interfaces

1. **Scripts:** `test:e2e` / `test:integration` set `NODE_ENV=test` and `NODE_OPTIONS=--experimental-vm-modules`, use `test/jest-e2e.json`.
2. **Jest:** `setupFiles` → load dotenv `.env.test`; `globalSetup` / `globalTeardown` under `test/`; `maxWorkers: 1`; no default `--forceExit`.
3. **Bootstrap helper:** `test/utils/create-e2e-app.ts` mirrors validation pipe, cookie parser, JSON body, `v1` prefix, `enableShutdownHooks`, and deterministic close (Nest close + Redis flush of test DB).
4. **Schema:** committed baseline migration; globalSetup runs `prisma migrate deploy` only when DB name matches `/test|e2e/i`.
5. **Isolation:** `DATABASE_URL` → `*_test` DB; `REDIS_DB=15` (configurable); flush Redis DB in teardown.
6. **Mailer:** `inlineCssEnabled: process.env.NODE_ENV !== 'test'` to eliminate CustomGC open handle without mocking MailModule.
7. **CI:** Integration job with `postgres:16` + `redis:7` services, migrate deploy, `pnpm --filter api test:e2e`, upload logs on failure.

### Rejected alternatives

- **Testcontainers in this ticket:** preferred long-term, but this agent environment cannot access Docker (`docker.sock` permission denied); GHA services + local named test DB meet “disposable/isolated” without blocking delivery.
- **Mocking Prisma/BullMQ in e2e:** violates ticket invariant of real schema/queues.
- **Keeping `--forceExit` as the primary exit strategy:** hides leaks; use only as last-resort override, not default.
- **Authoring all business concurrency e2e cases here:** deferred to TTW-010+.

### Risks

- Baseline migration on already-provisioned developer DBs requires one-time `prisma migrate resolve --applied` — document in setup docs.
- Redis DB 15 must not be used for non-test data on shared Redis instances.
- ESM experimental warning will appear in logs until Prisma ships a Jest-friendly path.

### Test plan

- Two passes of `pnpm --filter api test:e2e` without `--forceExit`.
- Open-handle proof / repeated run script.
- CI Integration job green on PR.

## Implementation reviews

### Independent review #1 (FAIL → fixed)

- **[P0]** Baseline migration was gitignored under `prisma/migrations/`. **Fixed:** stop ignoring authored migrations; commit `20260819100000_baseline` + `migration_lock.toml`.
- **[P1]** Migrate guard matched `/test|e2e/i` against the whole URL. **Fixed:** parse pathname DB name only.
- **[P2]** CI artefacts pointed at empty paths. **Fixed:** tee Jest/proof output to `apps/api/e2e-*.log` with `pipefail` and upload those files on failure.

### Independent review #2

**PASS** for merge readiness. P0–P2 closed; include `apps/api/prisma/migrations/` in the commit.

## Verification evidence

Toolchain: Node v24.19.0, pnpm 9.0.0.

Pre-fix: Prisma ESM TypeError without `NODE_OPTIONS=--experimental-vm-modules`.

Post-fix:

- `pnpm --filter api test:e2e` twice → 3 suites / 7 tests pass (health, auth role boundaries, products).
- `node scripts/quality/prove-e2e-open-handles.mjs` → pass (no open handles).
- Unit suites green (50 suites / 367 tests); coverage floors raised to statements 44.01 / branches 39.43 / functions 41.60 / lines 43.92.
- Diff coverage on TTW-003 changed instrumented lines: 100%.

## Completion summary

Shipped a real Nest/Prisma/BullMQ integration harness with committed baseline migration, `.env.test` loading, Jest ESM flag, isolated Redis DB + flush, test-safe mail templates and Bull `autorun: false`, shared e2e bootstrap/teardown, CI Integration job (Postgres 16 + Redis 7, two e2e passes + open-handle proof + log artefacts), and docs updates. Follow-ups: TTW-004 Playwright; TTW-010+ business concurrency e2e; optional Testcontainers once Docker is available to agents.
