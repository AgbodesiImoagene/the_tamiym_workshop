# TTW-208 — Reset the auth IP counters between API e2e suites

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

The `CI` workflow on `main` fails in the "API Integration" job on `test/auth-role.e2e-spec.ts` with `expected 201 "Created", got 429 "Too Many Requests"`.

- The customer auth routes allow 40 requests per minute per IP (`apps/api/src/constants.ts`, `AUTH_RATE_LIMIT_BUCKETS.customer_auth.ipLimit`). The counter lives in Redis and is shared by every suite, which run back to back from one address.
- Run `43309355995` (commit `8bff41f`, 33 suites): 1 test of `auth-role` failed. Run `43419851575` (commit `33a39b4`, 38 suites, after TTW-197 and TTW-198 added suites that register and log in): 3 tests failed. More suites in the same minute means more failures; the logic under test is unchanged.
- The same cause was already met once: `apps/api/test/auth-rate-limit.e2e-spec.ts` resets the IP counter for itself ("CI failure on main after TTW-087 added suites that log in"). That fix covers only its own file, so each new suite that logs in can push another suite over the limit.

## Proposal

- `createE2eApp()` (`apps/api/test/utils/create-e2e-app.ts`, called by every suite) deletes the Redis keys `ttw:auth:rl:ip:*` before booting the application, so each suite starts with empty IP counters. It targets the same Redis database the application reads (`REDIS_DB`, default 0).
- Only IP counters are cleared. Identity counters (`ttw:auth:rl:id:*`) are left alone: suites use unique e-mails, and the rate-limit suite checks them on purpose.
- The existing reset in `auth-rate-limit.e2e-spec.ts` stays as it is.
- Rejected: raising the limit under `NODE_ENV=test` (it would stop the rate-limit suite from testing the real limit), and spreading suites over time (slower and still fragile).

## Invariants

- Production code is untouched; no auth limit changes.
- `auth-rate-limit.e2e-spec.ts` still proves the real limits.
- No test is removed, skipped, or weakened.

## Implementation plan

1. Start `codex/ttw-208-reset-auth-rate-limits-between-e2e-suites` from current `main`, in its own worktree.
2. Write a test that fails: a leftover IP counter is still in Redis after `createE2eApp()`.
3. Add the reset to `createE2eApp()`.
4. Run the e2e suites that log in together, then the gates, and record the results below.
5. Obtain the independent review for this risk level.

## Test and observability plan

- Integration (real Redis): a counter for each of two IP buckets exists, `createE2eApp()` runs, both are gone; an identity counter is still there.
- Regression: `auth-role`, `auth-rate-limit` and the suites added by TTW-197 and TTW-198 pass in one run.
- Logs, metrics, traces, and alerts: nothing new.

## References

- `apps/api/test/utils/create-e2e-app.ts` — the shared helper.
- `apps/api/test/auth-rate-limit.e2e-spec.ts` — the earlier local reset.
- `apps/api/src/auth/auth-rate-limit.ts` — key names.
- `.github/workflows/ci.yml` — "Run API e2e (pass 1)" and "(pass 2)".
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.

## Acceptance criteria

- [x] A new suite that logs in many times no longer makes `auth-role` fail with 429.
- [x] `CI` is green on `main`, including both API e2e passes.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Changing the real auth limits or the throttler configuration.
- Making `auth-rate-limit.e2e-spec.ts` use the shared reset.

## Design review

Low risk: test helper only, no production code. Implementation review is enough.

## Implementation reviews

Independent review of commit `ace6416` by a fresh read-only subagent, 2026-11-13: **PASS**, no blocking finding.

- Suites run strictly one after another (`maxWorkers: 1` in `test/jest-e2e.json`, `--runInBand` in the scripts), each calls `createE2eApp()` once and never inside a test, so the reset cannot land in the middle of another suite's count.
- The helper targets the same Redis host, port, password and `REDIS_DB` as the application, and only the keys `ttw:auth:rl:ip:*`; it does not touch queues or the Nest throttler keys. The connection is closed in a `finally`.
- The new test fails without the change and cleans its own keys; no existing test is removed, skipped or weakened. `auth-rate-limit.e2e-spec.ts` keeps its own reset and still checks the real limits.
- Accepted note: if suites ever ran in parallel, one suite's reset could disturb the count of the rate-limit suite. The current configuration rules that out.

## Verification evidence

Run on 2026-11-13 in this worktree, on a dedicated database (`tamiym_ttw208_e2e`, Redis db 9), migrated and seeded (`prisma db seed`, `seed:e2e`).

- Test first, seen failing for the right reason: `pnpm --filter api test:e2e -- test/e2e-app-auth-counters.e2e-spec.ts` failed with `Expected: 0, Received: 2` (two IP counters still in Redis after `createE2eApp()`).
- After the change the same test passes (1 test).
- Full API integration run, `pnpm --filter api test:e2e`, twice in a row like the CI's pass 1 and pass 2: 39 suites, 192 tests passed both times (`auth-role` and `auth-rate-limit` included).
- `tsc --noEmit` (api), `eslint` on the two changed files and `prettier --check` on the changed files: clean.
- Not verified: the GitHub `CI` run after the push (recorded under the completion summary once read).

## Follow-up after the first push (CI on `main`)

The push of the fix (`8dc0be9`) made `auth-role` pass but the "API Integration" job still failed, with `Unhandled error. ([Error: Connection is closed.])` from BullMQ (108 occurrences in the log, none in the 7 earlier runs):

- Pass 1 failed in `products.e2e-spec.ts`, the re-run's pass 2 in `site-settings-default.e2e-spec.ts`. In both, the failing suite ran right after `e2e-app-auth-counters.e2e-spec.ts`, the suite added by this ticket.
- Cause: that suite booted the application and closed it at once. The queues open their Redis connections in the background; closing before they are ready makes BullMQ raise "Connection is closed" a moment later, inside whichever suite runs next.
- Reproduced locally: running `e2e-app-auth-counters` then `products` printed the error on 1 run out of 3.
- Fix (test only, no change to the helper): before closing the app, the test waits for the three queues (`waitUntilReady()`). 5 runs of the same pair afterwards: no error.
- The reset itself (`createE2eApp()`) is unchanged and did its job: `auth-role` no longer answers 429.

Independent review of the follow-up by a fresh read-only subagent, 2026-11-13: **PASS**, no blocking finding. The assertions are unchanged and run before the waits, `closeE2eApp` still runs in the `finally`, the queue names and tokens match `src/constants.ts` and `src/media/media.constants.ts`, and `waitUntilReady()` is bounded by the Jest timeout.

Verification evidence for the follow-up (2026-11-13, dedicated database `tamiym_ttw208b_e2e`, Redis db 9):

- Full `pnpm --filter api test:e2e`, 4 runs: 3 runs with 39 suites and 192 tests passed, 0 "Connection is closed". One run failed on `address-edit-state` (403) and `auth-link-retention` (socket hang up) while the machine was heavily loaded (load average 32); not reproduced in the other 3 runs; those suites do not touch queue closing, so a link with this change is unlikely, but that is an inference, not a proof.
- `tsc --noEmit` (api), `eslint` and `prettier --check` on the changed file: clean.
- GitHub `CI` on `main` after the second push (`8efc7c9`, run `43448785916`): **success**, all jobs green including "API Integration" (both API e2e passes). `Playwright Comprehensive` on the next `main` commit: success.

## Completion summary

Done: `createE2eApp()` deletes the Redis keys `ttw:auth:rl:ip:*` before booting the application, so each suite starts with empty IP counters, and `test/e2e-app-auth-counters.e2e-spec.ts` proves it, including that identity counters are kept. The first version of that test leaked a BullMQ error into the next suite; it now waits for the queues before closing the application. No production code changed.

Left to do: nothing.
