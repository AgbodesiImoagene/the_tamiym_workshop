# TTW-182 — Stabilise the customer app unit tests under parallel load

**Epic:** 0 — Trustworthy delivery system  
**Status:** Not started  
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

## Implementation plan

1. Reproduce and record the failures, with the command used.
2. Fix the causes, one test file at a time.
3. Show stability: several consecutive full `pnpm test` runs with no `apps/app` failure.

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

- [ ] The failure is reproduced and its cause written in this ticket.
- [ ] The full `pnpm test` passes several times in a row, with output recorded below.
- [ ] No test is skipped, removed or weakened.

## Out of scope

- Admin and web unit tests, unless the same cause shows up there.

## Design review

Low risk: implementation review only.

## Implementation reviews

## Verification evidence

## Completion summary
