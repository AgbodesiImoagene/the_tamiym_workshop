# TTW-080 — Make the open-handle proof fail fast when it times out

**Epic:** 0 — Trustworthy delivery system\
**Status:** Scoped\
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

- [ ] A test proves a timed-out run exits non-zero and leaves no orphan process; it fails on the current script.
- [ ] The real open-handle proof still passes locally.
- [ ] The "API Integration" job has a `timeout-minutes` backstop.
- [ ] CI green on GitHub.

## Out of scope

- Finding why a suite can take 20 minutes on an idle laptop (`auth-surface.e2e-spec.ts`, 1 209 s during the TTW-079 attempt). Not reproduced on CI.

## Design review

Not required (low risk).

## Implementation reviews

Pending.

## Verification evidence

Pending.

## Completion summary

Pending.
