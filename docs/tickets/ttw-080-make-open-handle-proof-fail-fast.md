# TTW-080 — Make the open-handle proof fail fast when it times out

**Epic:** 0 — Trustworthy delivery system\
**Status:** In progress (committed locally; CI on GitHub pending the user's push)\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

`scripts/quality/prove-e2e-open-handles.mjs` runs the API e2e suite with `--detectOpenHandles` and is the last step of the CI job "API Integration" (`.github/workflows/ci.yml:221-225`). It promises to fail "if the suite does not exit within the allotted time" (`E2E_OPEN_HANDLE_TIMEOUT_MS`, default 120 s).

On timeout, the script does not fail; it hangs:

- It spawns `pnpm exec jest …`, and the timer sends `SIGKILL` to that `pnpm` process only. The `jest` grandchild survives, reparented to PID 1.
- The script resolves on the child's `close` event, which waits for stdout/stderr to close. The orphaned `jest` still holds those pipes, so `close` never fires and the script never exits.
- Observed on 2026-11-04 while verifying TTW-079: the script printed "Open-handle proof timed out after 120000ms", then stayed alive for about 2 h 50 min with `jest` (PPID 1, 0 % CPU) until killed by hand.
- `ci.yml` sets no `timeout-minutes` (0 occurrences), so on GitHub the same hang would hold the runner until the 6-hour default job limit. That would hide the real failure and burn CI minutes.

## Proposal

- Spawn the child in its own process group (`detached: true`) and, on timeout, kill the whole group (`process.kill(-child.pid, 'SIGKILL')`). This also kills `jest` and its workers.
- Once the timeout fires, exit non-zero from the timer path itself (after a short grace period for the group to die) instead of waiting for `close`.
- Add `timeout-minutes` to the "API Integration" job as a backstop. Size it from recent successful runs (the job took about 3.5 min on run 41888502419).
- Rejected: replacing `pnpm exec` with a direct `jest` binary path. That only hides the grandchild problem for this one wrapper.

## Invariants

- A run that finishes in time behaves exactly as today: same exit code, same open-handle detection, same log output.
- A run that exceeds the timeout exits non-zero within timeout + grace, and leaves no `jest` process behind.

## Implementation plan

1. Write the node `--test` cases first (see below) and show the timeout case fails (hangs or survives) on the current script.
2. Change the spawn/kill/exit logic.
3. Add `timeout-minutes` to the CI job.
4. Update `docs/12-testing-strategy.md` / `docs/11-development-setup.md` where they describe the proof.

## Test and observability plan

- Unit/component: `scripts/quality/__tests__/prove-e2e-open-handles.test.mjs` (node `--test`, like the other `X:validate:test` scripts). Make the command injectable, for example through an env var naming a fake child that spawns a long-lived grandchild. Then assert: exit code ≠ 0 within the timeout plus grace, no surviving grandchild, and the happy path still exits 0. Expose it as a package script and run it in CI next to the other validator tests.
- Integration/e2e: run the real proof once locally (it must pass as today).
- Failure, retry, and concurrency: timeout path, child exiting non-zero, child killed by a signal.
- Logs, metrics, traces, and alerts: keep the existing "timed out" message; add the PID group killed.

## References

- `scripts/quality/prove-e2e-open-handles.mjs`: spawn of `pnpm`, `child.kill('SIGKILL')`, resolution on `close`.
- `.github/workflows/ci.yml:221-225`: CI step; no `timeout-minutes` in the file.
- `docs/tickets/ttw-079-unique-refund-e2e-provider-ids.md`: Verification evidence and Completion summary (the observed hang).

## Acceptance criteria

- [x] A test proves a timed-out run exits non-zero and leaves no orphan process; it fails on the current script.
- [x] The real open-handle proof still passes locally.
- [x] The "API Integration" job has a `timeout-minutes` backstop.
- [ ] CI green on GitHub.

## Out of scope

- Finding why a suite can take 20 minutes on an idle laptop (`auth-surface.e2e-spec.ts`, 1 209 s during the TTW-079 attempt). Not reproduced on CI.

## Design review

Not required (low risk).

## Implementation reviews

Review 1 (2026-11-06): `/code-review` at high effort, run inside the implementing session, so it is not a fresh-context review. Six findings:

- Fixed: the timeout tests did not check that process ids were recorded, so "no survivor" could pass without checking anything.
- Fixed: a test hard-coded `1500ms` instead of `TIMEOUT_MS`.
- No change: `E2E_OPEN_HANDLE_COMMAND` can replace the gate's command. The ticket asks for this test seam, and no workflow sets it.
- Left open, low impact: an uncaught exception in the script (for example EPIPE on stdout) exits without killing the group.
- No change (the finding was wrong, see review 2): `E2E_OPEN_HANDLE_GRACE_MS=0` is honoured. Only an empty value falls back to 5000.
- Left open, outside this ticket: if the 15-minute backstop fires, the `if: failure()` step may not upload the e2e logs. This is inferred from GitHub's cancellation behaviour, not confirmed. The output stays in the job log.

Review 2 (2026-11-06): independent review in a fresh session, read-only. **PASS** for `91aa9ae`.

- Both invariants were checked with real `pnpm` and real `jest` on macOS. A run in time exits 0. A stuck Jest (8 s timeout, 1 s grace) exits 1 in 8.3 s, and a real leaked handle exits 1 in 12.2 s, with no `jest` left in either case. Piping through `tee` as CI does does not hang.
- Mutation check on copies of the script: 12 of 15 mutations were caught, including all the kill, grace, signal and exit-code logic. The 3 survivors touch the default command or its environment, which the tests replace and this change did not alter. For example, removing `--detectOpenHandles` would go unnoticed.
- The EPIPE finding was reproduced with `| head -1`, which leaves the fake `jest` alive. It only happens when the reader closes early, and reading the old code shows it did not kill anything in that case either, so it is not a regression.
- Corrected the grace finding above: with a 500 ms timeout, `0` exits in 0.7 s and an empty value in 5.7 s.
- `test:e2e` has no timeout of its own, so a leaked handle would hang pass 1 before the proof runs. The 15-minute backstop would stop the job in that case, not the 120 s limit.
- Not covered by this review: Linux, CI on GitHub, and the full e2e suite.

## Verification evidence

Local, Node 24, Postgres 17 + Redis, branch `codex/ttw-080-open-handle-proof-fail-fast`.

Before the fix (test seam added, kill logic unchanged): `node --test scripts/quality/__tests__/prove-e2e-open-handles.test.mjs` gave 10 tests, 4 passed, 6 failed. All three timeout tests failed on "the proof must exit by itself instead of hanging" after the 15 s test guard. The three signal tests failed with exit code `null`. The four normal-path tests passed.

After the fix:

- `pnpm e2e-open-handles:test`: 10/10 passed, also after the review fixes. The timeout tests take about 2 s each.
- `node scripts/quality/prove-e2e-open-handles.mjs`, run alone with the default timeout: 17/17 suites, 93/93 tests, "Open-handle proof passed: no open handles reported.", exit 0, 81 s.
- The same command run at the same time as `pnpm lint` hit the 120 s limit under load. It printed "timed out" and "Killing process group 7485.", exited 1, and left no `jest` process (`pgrep -fl jest` empty). That is the real timeout path working. The run was not counted as a pass.
- `pnpm workflows:validate` passed and `pnpm workflows:validate:test` gave 6 passed.
- `pnpm docs:validate` passed and `pnpm docs:validate:test` gave 11 passed. Both were run before this ticket update and rerun before the commit.
- `pnpm lint`: 6/6 tasks successful.
- `pnpm exec prettier --check` on every changed file: passed.
- `pnpm format:check` reports 84 files locally, all under `apps/api/src/generated/` (gitignored Prisma output). The CI Format job does not generate it.

Not verified: CI on GitHub, including the new "Test the open-handle proof" step and `timeout-minutes`, because nothing has been pushed.

## Completion summary

Done:

- The proof runs Jest in its own process group. On timeout it kills the whole group and exits non-zero within the grace period, without waiting for `close`.
- A timed-out run can no longer report "passed", even if the group leader had already exited 0.
- `timeout-minutes: 15` on "API Integration" (about 3 min on run 41931373328, of which 46 s for the proof).
- `pnpm e2e-open-handles:test` runs in the CI "Documentation" job.

Deviations from the proposal:

- Added SIGHUP, SIGINT and SIGTERM handling. With `detached: true`, a Ctrl-C or a closed terminal no longer reaches Jest, so the fix alone would have created a new way to leave orphans.
- The timeout is sized from run 41931373328, the green run recorded in TTW-079, rather than run 41888502419.

Left to do: push the branch, confirm CI is green, then mark the ticket Complete.
