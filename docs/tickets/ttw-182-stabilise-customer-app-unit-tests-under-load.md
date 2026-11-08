# TTW-182 — Stabilise the customer app unit tests under parallel load

**Epic:** 0 — Trustworthy delivery system  
**Status:** Complete  
**Risk:** Low  
**Blocked by:** None  
**Blocks:** None

## Background

During TTW-084 (2026-11-08), the full `pnpm test` run (Turbo runs every package's tests in parallel) failed in `apps/app` twice in a row: 3 failures, then 5. The failing tests were in:

- `apps/app/__tests__/workshop/WorkshopEditor.test.tsx` (`WorkshopEditor auto-save`, lines 84-127);
- `apps/app/__tests__/checkout/checkout-page.test.tsx` (`DashboardCheckoutPage`, from line 136).

TTW-084 did not change `apps/app`. Run alone (`pnpm --filter app test`), its 42 tests passed twice. The failures therefore look like timing sensitivity when the machine is busy, not a product bug.

Not established yet:

- the exact error messages: they were not kept, so the first step is to reproduce and record them;
- whether CI has ever hit it: no CI failure has been traced to these tests so far.

Possible causes to check, not conclusions:

- `checkout-page.test.tsx` relies on `waitFor` and `findBy*` with the default 1-second timeout (for example lines 118-129, 148-152, 195-210), which a loaded machine can exceed;
- `WorkshopEditor.test.tsx` mixes fake timers (`jest.useFakeTimers()`, line 86) with async React updates.

A test that fails at random teaches people to rerun until it passes, which hides real failures (same problem as TTW-079 for API Integration).

## Proposal

To decide once the failure is reproduced:

1. Reproduce it reliably, for example `pnpm test` with all packages, or `pnpm --filter app test -- --maxWorkers=1` on a CPU loaded by another process. Record the error messages.
2. Fix the tests themselves, without weakening what they check: wait on the right signal, handle fake timers correctly, or remove dependence on real time.
3. Raising timeouts is allowed only if the cause is understood and written here.

## Invariants

- Each test keeps checking the same behaviour (TTW-009 auto-save of the latest design; idempotency keys and retries in checkout).
- No `skip`, no `only`, no deleted assertion.

## Cause

Reproduced on 2026-11-08 with the full parallel run, cache bypassed so every package really runs: `pnpm turbo run test --force` (plain `pnpm test` can replay a cached result). Turbo runs the `api`, `web` and `app` Jest suites at once. Each one starts `cores - 1` = 7 workers on this 8-core laptop, and other sessions were also running suites (load average 115 to 950 over the day).

Failures seen before the fix:

- Full run 1: `DashboardCheckoutPage › reuses the idempotency key…` failed with `thrown: "Exceeded timeout of 5000 ms for a test."` The checkout file took 31 s, against 15 s alone.
- Diagnostic run 2 (`-- --verbose --testTimeout=120000`, to see real durations): `requires a new quote when the cart changes in another tab` failed in the first `waitFor` of `reviewQuote`: `expect(element).toHaveValue(Ikeja)`, received an empty value. In the same run the two `WorkshopEditor auto-save` tests took 9.3 s and 11.9 s, against 2.6 s and 1.0 s alone, although they use fake timers and wait for nothing real.
- With only the timeouts raised (intermediate attempt, see below), full run fixed-4 at load average 410-650: `OrderConfirmPage › clears the cart when its pending order is paid` failed with `Unable to find role="heading" and name "SUCCEEDED"` after a 10 s wait, with the page still on "Loading order details...".

Two wall-clock deadlines are involved. Neither checks behaviour:

1. Jest's per-test timeout (5 s by default).
2. Testing Library's `waitFor`/`findBy*` timeout (1 s by default), in the only two files that use them (`checkout-page.test.tsx`, `order-confirm-page.test.tsx`).

Every mock in these tests resolves at once. Waiting for the screen only means waiting for React and React Query (whose notifications go through `setTimeout(0)`) to work through already-settled promises. That is CPU work. When the worker gets little CPU, a wait measured in real milliseconds runs out before the work is done, even though the screen is about to show the expected state. A throwaway probe showed it: one synchronous 1.5 s stall inside a `waitFor` callback makes the wait give up while the update is pending.

Why one failure became several (3, then 5, in TTW-084): `jest.clearAllMocks()` keeps unconsumed `mockRejectedValueOnce`/`mockResolvedValueOnce` values. When a checkout test stops early, its queued values leak into the next test. A probe confirmed this: after `clearAllMocks()` a leftover `mockRejectedValueOnce` still fires, and after `mockReset()` it does not.

No product bug: the waited-for state always arrives, and `WorkshopEditor` saves synchronously when its fake auto-save timer fires (`WorkshopEditor.tsx:88-90`, `:150-151`).

## Fix

1. `checkout-page.test.tsx` and `order-confirm-page.test.tsx` switch to Jest fake timers (`jest.useFakeTimers()` in `beforeEach`, `jest.useRealTimers()` in `afterEach`). With fake timers, Testing Library (`@testing-library/dom` 10.4.1, `dist/wait-for.js`) creates its timeout with the faked `setTimeout`. Each check then advances fake time by 50 ms inside `act` and flushes only microtasks. The default 1000 ms becomes 20 checks, whatever the CPU speed. Probes:
   - the same 1.5 s CPU stall no longer breaks the wait;
   - a missing element still fails with `Unable to find…`, after 1000 fake ms (about 0.4 s real);
   - the 15 checkout tests still pass with the timeout cut to 150 fake ms (3 checks), so the default has more than 6x margin, counted in checks.
2. `checkout-page.test.tsx` `beforeEach` calls `mockReset()` on `createOrder` and `initiateOrderPayment`, so a failed test can no longer leak queued values. Every test that needs them sets them; the others assert they are not called.
3. `apps/app/jest.config.ts` sets `testTimeout: 30_000`. Jest cannot measure this one in fake time, so it stays a wall-clock hang detector. A test's real duration still depends on the CPU: the worst observed was 11.9 s (load ~150) and 8.6 s (load ~700), against the old 5 s limit. No test asserts on duration, and a real regression in a wait now fails fast through the fake-time wait, not through this limit.
4. `order-confirm-page.test.tsx` drops its local `LOAD_TIMEOUT = { timeout: 5000 }`, an earlier "busy CI machine" bump that fake timers make pointless.

Intermediate attempt, dropped: a global `configure({ asyncUtilTimeout: 10_000 })`. Runs fixed-1 to fixed-3 and fixed-5 passed with it. Fixed-4 failed, as described above, because a real-time wait loses to enough load whatever its value.

Side effect to know: under fake timers a failing wait stops after about 20 fake checks. If one of these pages ever starts relying on a real asynchronous source (real `fetch`, `MessageChannel`), its test will fail every time, never at random.

## Implementation plan

1. Reproduce and record the failures, with the command used. Done: see Cause.
2. Fix the causes, one test file at a time. Done: see Fix. Deviation: a timeout-only fix was tried first and dropped after it failed under heavier load.
3. Show stability: several consecutive full `pnpm test` runs with no `apps/app` failure. See Verification evidence.

## Test and observability plan

- Unit/component: the two test files above.
- Integration/e2e: none.
- Failure, retry, and concurrency: repeated runs under load.
- Logs, metrics, traces, and alerts: none.

## References

- `apps/app/__tests__/workshop/WorkshopEditor.test.tsx:84-127`
- `apps/app/__tests__/checkout/checkout-page.test.tsx:118-129`, `:136-300`
- `apps/app/jest.config.ts`
- `docs/tickets/ttw-084-create-default-site-settings.md` — "Verification evidence", where the failures were seen.

## Acceptance criteria

- [x] The failure is reproduced and its cause written in this ticket.
- [x] The full `pnpm test` passes several times in a row, with output recorded below.
- [x] No test is skipped, removed or weakened.

## Out of scope

- Admin and web unit tests, unless the same cause shows up there.

## Design review

Low risk: implementation review only.

## Implementation reviews

### Iteration 1 — PASS (2026-11-08)

Independent read-only reviewer (fresh agent), on the intermediate timeout-only version. Charter: soundness of the CPU-starvation diagnosis versus a masked race, wrong signal or leaked state; no weakened assertion; coherent values; scope.

- Diagnosis confirmed: every `waitFor` waits for a stable state, not a transient one (`page.tsx:77-81`, `:108-116`, `:146`, `:182-184`, `:218`). `WorkshopEditor` is deterministic. No state leaks through `cart-store`, `QueryClient` or listeners.
- No assertion weakened. Removing `LOAD_TIMEOUT` is correct.
- Findings applied: the `jest.config.ts` comment mixed two tests (fixed: 1.0 s → 11.9 s); the ticket was not updated yet. The out-of-scope nit about unconsumed `...Once` values was applied (fix 2) because it explains the cascade.

### Iteration 2 — PASS (2026-11-08)

Same reviewer, on the fake-timer version, after fixed-4 failed. Charter: whether fake timers change what a test checks or let one pass wrongly (faked `Date`, React Query timers, events, the `console.error` spy, synchronous assertions after the helpers); the `mockReset`; cleanup order; the `testTimeout` value. The reviewer also ran both files serially at load ~970: 15/15, slowest test 6.4 s, no act or console warning.

- React Query's notification scheduler looks up the global `setTimeout` at call time (`query-core` 5.97.0 `timeoutManager.js:62-64`), so `waitFor` advances it. `refetchInterval` is only 3000 ms for PENDING/INITIATED, and the mocks return SUCCEEDED or FAILED.
- Expiry is decided from server status only. `futureIso()` and past `expiresAt` use the same fake clock. Keys come from `crypto.randomUUID`, which is not faked.
- No test inherits a `createOrder`/`initiateOrderPayment` implementation. Testing Library's cleanup runs before `useRealTimers()`.
- Nits: record the "fails every time, never at random" side effect (done above); the comment could also say that the loop only flushes microtasks.

## Verification evidence

All runs on 2026-11-08, Node 24.22.1, 8-core MacBook, from the ticket worktree. Full run: `pnpm turbo run test --force` (`--force` bypasses Turbo's cache, so all three Jest suites really run). "Load" is the 1-minute load average at the start of the run. Other sessions were running suites at the same time.

Before the fix (`main` `81d003b`):

| Run                                          | Load | `apps/app` result                                                                                                                                    |
| -------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| full-run-1                                   | ~150 | 41/42: `DashboardCheckoutPage › reuses the idempotency key…`, `Exceeded timeout of 5000 ms for a test`                                               |
| diag-1 (`-- --verbose --testTimeout=120000`) | 115  | 42/42; slowest test 3.4 s                                                                                                                            |
| diag-2 (same)                                | 141  | 41/42: `requires a new quote when the cart changes in another tab`, `waitFor` gave up on `toHaveValue(Ikeja)`; WorkshopEditor tests 9.3 s and 11.9 s |

Intermediate attempt (timeouts only, dropped): fixed-1, fixed-2, fixed-3 and fixed-5 passed 42/42 (load 133 to 650). Fixed-4 failed 41/42 at load 414-650 (`Unable to find role="heading" and name "SUCCEEDED"` after 10 s).

Final code, three consecutive full runs, all `exit=0`:

```
== 22:54:11 load averages: 564.36 900.71 776.07
run final2-1: exit=0 duration=280s
app:test: Tests:       42 passed, 42 total
web:test: Tests:       40 passed, 40 total
api:test: Tests:       1310 passed, 1310 total
== 22:58:52 load averages: 101.16 482.92 626.46
run final2-2: exit=0 duration=192s
app:test: Tests:       42 passed, 42 total
web:test: Tests:       40 passed, 40 total
api:test: Tests:       1310 passed, 1310 total
== 23:02:04 load averages: 77.59 315.75 527.90
run final2-3: exit=0 duration=329s
app:test: Tests:       42 passed, 42 total
web:test: Tests:       40 passed, 40 total
api:test: Tests:       1310 passed, 1310 total
```

These runs used `-- --verbose` to record durations. The slowest `apps/app` tests were 6.6 s, 4.9 s and 7.4 s, against the 30 s hang limit. A first final run (final-1) is discarded: the laptop lid was closed at 16:43 and the machine slept until 22:45 (`pmset -g log`: "Clamshell Sleep"). The one test running at the time reported 7 170 007 ms and hit the 30 s limit; the other 41 passed.

Probes (throwaway files under `apps/app/__tests__/`, deleted, not committed):

- Real timers plus one 1.5 s CPU stall inside a `waitFor` callback: fails with `Unable to find an element with the text: Loaded`. Same with fake timers: passes.
- With fake timers, `findByText('absent')` still rejects with `Unable to find…`, after 1000 fake ms (test 396 ms real).
- `configure({ asyncUtilTimeout: 150 })` set temporarily: `npx jest __tests__/checkout` → 15/15 passed.
- After `jest.clearAllMocks()` a leftover `mockRejectedValueOnce` still fires; after `mockReset()` it does not.

Gates:

- `pnpm --filter app typecheck`: exit 0.
- `pnpm --filter app lint`: exit 0.
- `pnpm exec prettier --check` on the three changed test/config files and this ticket: "All matched files use Prettier code style!"
- `pnpm docs:validate`: "Documentation validation passed."

## Completion summary

**State: Complete.** Merged into `main` at the owner's request (merge of `7e99d08` onto `f4133f2`).

Test-only change in `apps/app`: no production code, contract, migration or observability change.

- `__tests__/checkout/checkout-page.test.tsx` and `__tests__/checkout/order-confirm-page.test.tsx` use Jest fake timers, so their `waitFor`/`findBy*` timeouts count fake time, not CPU time.
- `checkout-page.test.tsx` resets `createOrder` and `initiateOrderPayment` before each test, so one failure no longer cascades.
- `jest.config.ts`: `testTimeout: 30_000`, the only wall-clock limit left, as a hang detector.
- `order-confirm-page.test.tsx`: the local 5 s `LOAD_TIMEOUT` is removed.

Merge with TTW-086: `main` had meanwhile added three checkout tests (`address outside every shipping zone`) to `checkout-page.test.tsx`. Git merged the file without conflict, and the new tests run under the fake timers. They queue `quoteOrder.mockRejectedValueOnce`, so `quoteOrder` is now reset before each test too (`012f7a4`). On the merged code, at load average ~650: `npx jest` in `apps/app` 45/45, then `npx jest __tests__/checkout` 18/18 after the reset.

Out of scope, not checked: `apps/web` (node environment, no `waitFor`) and `apps/admin` (no unit runner).
