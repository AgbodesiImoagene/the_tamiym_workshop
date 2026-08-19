# TTW-003 — Repair the API integration-test harness

**Epic:** 0 — Trustworthy delivery system  
**Status:** Not started  
**Risk:** High  
**Blocked by:** TTW-001, TTW-002  
**Blocks:** TTW-004, TTW-010, TTW-011, TTW-012, TTW-013, TTW-014

## Background

API unit tests pass, but the E2E process cannot boot the production Nest/Prisma stack under the current Jest ESM configuration and leaves Redis resources open. Critical concurrency and persistence claims therefore lack real PostgreSQL/Redis evidence.

## Proposal

Create a deterministic integration environment using the production modules with disposable PostgreSQL and Redis, Prisma migrations/seeds, controlled queues/external adapters and explicit application/worker teardown. Correct the Jest ESM invocation without replacing production providers with mocks except at true external boundaries.

## Invariants

- Tests exercise the real schema, transactions, guards, interceptors and queue wiring.
- Every test run starts from known data and releases all handles.
- Parallel runs use isolated databases/namespaces.

## Test and observability plan

- Prove boot/health, authenticated request, database transaction, Redis queue and shutdown.
- Add a repeated-run check that detects open handles and state leakage.
- Upload test logs only on failure; redact secrets and tokens.

## References

- `apps/api/test/app.e2e-spec.ts` — current E2E entry point.
- `apps/api/package.json` — Jest/test scripts.
- `apps/api/src/prisma/prisma.service.ts` — production database lifecycle.

## Acceptance criteria

- [ ] `pnpm --filter api test:e2e` boots the production module and passes repeatedly.
- [ ] PostgreSQL and Redis state is isolated and deterministic.
- [ ] No open handles remain after completion.
- [ ] CI runs the integration suite and preserves useful failure artifacts.

## Out of scope

- Individual business concurrency regressions → TTW-010 through TTW-014.
