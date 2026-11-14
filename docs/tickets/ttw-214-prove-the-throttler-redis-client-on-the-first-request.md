# TTW-214 — Prove the throttler Redis client works on the first request

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

TTW-211 changed `apps/api/src/config/throttler-redis.factory.ts` (commits `f1f6677`, `c8b763d`): the Nest throttler storage no longer gets a lazily connected client, and now owns and closes its Redis client. Review of those commits found that nothing in the test suite exercises the real Redis storage:

- `AppModule` keeps the throttler **in memory** under `NODE_ENV=test` (`app.module.ts`), so the e2e app never touches the Redis storage. A first attempt at this ticket, a request sent to the full e2e app, passed even with `lazyConnect: true` restored, so it proved nothing.
- The only unit test mocks the storage and checks the options it receives.

## Proposal

Add an e2e spec, `apps/api/test/throttler-cold-start.e2e-spec.ts`, that builds a minimal Nest application with the production factory (`createThrottlerModuleOptions`) against the real Redis of the test environment, one controller guarded by `ThrottlerGuard`, and checks:

1. After the storage's client is `ready`, the first throttled request is served (200), then the next one too. A lazily connecting client fails here (500, "Stream isn't writeable").
2. After `app.close()` the client reaches `end`. A client built outside the storage is never closed by it and fails here.

## Invariants

- The production factory is not changed by this ticket.
- The spec does not claim more than it proves: a request sent in the few milliseconds before the client is `ready` is still rejected by design (no offline queue, fail fast). Measured: about 26 ms from creation to `ready` on the development machine; the production app boots much longer than that before it listens.

## Implementation plan

1. Branch `codex/ttw-214-prove-the-throttler-client-on-first-request` from `main` (done).
2. Write the spec and prove each assertion against the code it guards.
3. Run the gates, record results below, merge locally, push, read CI.

## Test and observability plan

- The spec itself, run against the real Redis (`REDIS_*` of `.env.test`).
- Proof that it fails for the right reason (recorded below): with `lazyConnect: true` restored (first assertion), and with a client built by the caller instead of options (second assertion).
- Logs, metrics, traces, and alerts: nothing new.

## References

- `apps/api/src/config/throttler-redis.factory.ts` — the factory under test.
- `apps/api/src/app.module.ts` — in-memory throttler under `NODE_ENV=test`.
- `docs/tickets/ttw-211-test-site-settings-saves-against-the-real-api.md` — origin of the two API commits.

## Acceptance criteria

- [x] The spec passes against the current factory.
- [x] It fails when `lazyConnect: true` is restored.
- [x] It fails when the storage is given a client built outside it.
- [x] Required quality gates pass and CI is green on `main`.

## Out of scope

- Closing the few-millisecond window between creation and `ready` (would need an offline queue or an explicit readiness wait, which changes the fail-fast design).
- Making the full e2e app use the Redis storage.

## Design review

Low risk, test only. Blast radius: one new e2e file. It talks to the same Redis as the other e2e specs and writes one throttler key that expires in 60 s. It closes its client, so the CI open-handle proof stays clean.

## Implementation reviews

No independent review: test-only change of Low risk, proven in both directions against the code it guards (see Verification evidence).

## Verification evidence

- Probe script (storage built with options, command sent right after creation): `increment immediately FAILED: Stream isn't writeable and enableOfflineQueue options is false`, `ready` about 26 ms later, then `increment later OK`.
- With the current factory: `pnpm --filter api test:e2e -- test/throttler-cold-start.e2e-spec.ts` → 2 passed.
- With `lazyConnect: true` restored (temporary, reverted): both requests answered 500 "Stream isn't writeable", 2 failed.
- With the storage given `new Redis({...})` instead of options (temporary, reverted, run with `--forceExit` because the leaked client keeps Jest alive): `Expected: "end"`, `Received: "ready"`; the leak is also why this variant hangs without `--forceExit`.
- CI on `main` (`f59b223`, run 43619535096): `CI` success, including the new spec. `pnpm --filter api test` 151 suites / 1474 tests pass; `--detectOpenHandles` on the new spec reports nothing.
- `tsc --noEmit` and `prettier --check` pass. `git diff -- apps/api/src` is empty after the experiments.

## Completion summary

`test/throttler-cold-start.e2e-spec.ts` builds the production throttler factory against the real Redis and proves two things: the first throttled request is served once the client is ready, and closing the app disconnects the storage's client. It fails with `lazyConnect` restored and with a client built outside the storage. The window of about 26 ms between creation and `ready` stays open by design.
