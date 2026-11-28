# TTW-255 — Stop the customer app product list tests failing when the machine is busy

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

Not urgent. Decision by the user, 2026-11-24: write it now, handle it later, possibly after launch. Nothing is broken on a normal run.

## Background

Found on 2026-11-24 while finishing TTW-254. The automatic check that runs after each change (`app unit tests (related)`, 15 suites in parallel) failed three times in a row on tests that TTW-254 did not touch:

- `apps/app/__tests__/products/product-list-card.test.tsx` (TTW-204): `cardOf` waits with `findAllByRole('link', { name: 'View product' })` (line 81), whose default timeout is 1 second. The page still showed "Loading products…" when it gave up. A second failing test was in the same run; its name was not kept.
- The same runs took 21 to 25 s for `product-list-page.test.tsx` and 50 to 74 s for `checkout-page.test.tsx`; the machine's load average was 156 during the third run.

Run alone, `product-list-card.test.tsx` passed twice in a row (11 of 11, 2 to 3 s), and the whole `pnpm --filter app test` passed (47 suites, 360 tests) when nothing else was running. So the failures are timing sensitivity, not a product bug. `product-list-page.test.tsx` had already failed once in the same way earlier that day.

This is the class TTW-182 closed for the workshop editor and checkout tests. It stays open for the product list tests, and the 1-second default wait is still in force there.

Not established yet: the exact second failing test; whether CI has ever hit it.

## Proposal

To decide once the failure is reproduced:

1. Reproduce it on purpose: `pnpm --filter app test -- --maxWorkers=1` while another process loads the CPU, or the 15 "related" suites together. Record the error messages, including the second failing test.
2. Fix the tests, without weakening what they check: wait on the right signal (for example the end of the catalogue request) instead of a fixed second, or give the helper `cardOf` a wait sized for a busy machine, with the reason written next to it.
3. If a wait is raised, raise it where it is understood (the helper or the suite), not globally, and say why here. Do not skip or delete any test.
4. Check whether the automatic after-change check should run fewer suites at once; that is a tooling decision and stays outside this ticket unless the user asks.

## Invariants

- Each test keeps checking the same behaviour (TTW-204: the product's own colours, sizes and tier price on the card).
- No test is skipped, deleted or weakened.

## Implementation plan

1. Reproduce and record the failures.
2. Fix the product list tests as above.
3. Run `pnpm --filter app test` alone and alongside a CPU load, three times each, and record the results.

## Test and observability plan

- Unit/component: the product list suites pass three times in a row under load.
- Integration/e2e: none.
- Failure, retry, and concurrency: not applicable.
- Logs, metrics, traces, and alerts: none.

## References

- `apps/app/__tests__/products/product-list-card.test.tsx:81` — the 1-second wait.
- `docs/tickets/ttw-182-stabilise-customer-app-unit-tests-under-load.md` — same problem, earlier tests.
- `docs/tickets/ttw-246-find-and-fix-the-intermittent-api-e2e-failures.md` — same problem on the API side.

## Acceptance criteria

- [ ] The failure is reproduced and its messages are recorded here.
- [ ] The product list suites pass three times in a row on a loaded machine.
- [ ] No test is skipped, deleted or weakened.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- The API end-to-end failures → TTW-246.
- How many suites the automatic after-change check runs at once.

## Design review

Not needed (Low risk): implementation review only.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not complete.
