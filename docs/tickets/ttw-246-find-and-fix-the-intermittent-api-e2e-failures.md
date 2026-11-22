# TTW-246 — Find and fix the intermittent API end-to-end failures

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

Found on 2026-11-21 and 2026-11-22 while running the full API integration suite (`pnpm --filter api test:e2e`, 64 suites, run in band) for TTW-101. Not urgent: nothing is broken on a normal run, but a red suite that goes green on a rerun wastes review time and hides real failures.

What was seen, all on a freshly migrated and seeded throwaway database with its own `REDIS_DB`:

- First full run: `address-state-not-deliverable` and `shipping-zone-admin-corrections` failed. Both passed alone and on the next full run. The failure messages were not kept.
- Second full run, right after a Playwright run on the same database: `address-default-and-country-code` failed with `expected 201 "Created", got 404 "Not Found"` on `POST /v1/users/addresses` (line 153 of that spec).
- That same suite, run alone in a loop, failed 1 run in 6, then at run 14 and run 39 of two other loops, each time on a different test of the file and always on a request of the suite's own `post`/`patch` helper (`expected 201` or `expected 200`, got 404).
- 2026-11-22, full run on the final TTW-101 code: `auth-rate-limit` failed with `expected 401 "Unauthorized", got 404 "Not Found"` on `POST /v1/auth/login` (line 61 of that spec). It passed alone twice and in the next full run. So the 404 is not specific to addresses: it hits the login route too, which points at the harness or the transport, not at one controller.
- The address suite also fails on `main` without any TTW-101 change: run 14 of a loop of 45 on the main checkout. So it is not caused by a recent change.
- The 404 body is the plain text `not found`. No code under `apps/api/src` writes that text (searched for `'not found'`, `sendStatus(404)`, `.status(404)`), and Nest exceptions answer JSON. The response time of the failing request was not measured.

Not established: where the plain-text 404 comes from, and whether the three suites share one cause.

## Proposal

- Reproduce on purpose: loop the suite alone (about 10 s a run) until it fails, with the response headers and the raw body logged, and with the Nest/Express request log of that request. Start from the loop in the Background.
- Find out who answers: the in-process app, a proxy, or the HTTP agent (`request.agent`) reusing a connection that the server closed. Check keep-alive and the shutdown of the app of the previous suite (`closeE2eApp`), since suites share one process in band.
- Fix the cause, in the test harness (`apps/api/test/utils/create-e2e-app.ts`) or in the suites, not by retrying: a retry would hide the next real failure.
- Check the other suites against the cause found. If it is different, split a ticket.

## Invariants

- Do not skip, weaken or retry a test to make it pass.
- Keep the suites run in band, and keep production code unchanged unless the cause is in it.

## Implementation plan

1. Start `codex/ttw-246-find-and-fix-the-intermittent-api-e2e-failures` from current `main`, in its own worktree.
2. Reproduce and log the raw answer (see Proposal). Record the cause here before changing anything.
3. Write the smallest test or loop that fails for that cause, then fix it.
4. Prove it: the suite alone 100 times without a failure, and the full suite 5 times in a row.

## Test and observability plan

- Integration: the loop of step 4 on the four suites of the acceptance criteria.
- Logs, metrics, traces, and alerts: nothing new in production.

## References

- `apps/api/test/address-default-and-country-code.e2e-spec.ts:153` — the failing line of the second run.
- `apps/api/test/utils/create-e2e-app.ts` — how every suite builds its app.
- `docs/tickets/ttw-208-reset-auth-rate-limits-between-e2e-suites.md` — an earlier cross-suite flake (429).
- `tests/e2e/README.md` — notes on running suites beside each other.

## Acceptance criteria

- [ ] The cause of the plain-text 404 is written in this ticket, with the evidence that shows it.
- [ ] The suites that showed it (`address-default-and-country-code`, `address-state-not-deliverable`, `shipping-zone-admin-corrections`, `auth-rate-limit`) pass 100 runs alone and 5 full runs in a row.
- [ ] No test was skipped, weakened or retried.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- The Playwright suites: they depend on object storage and on a fresh database, see `tests/e2e/README.md`.

## Design review

Not needed for a Low-risk fix confined to tests. Record the cause once found.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
