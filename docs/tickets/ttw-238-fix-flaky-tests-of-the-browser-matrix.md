# TTW-238 — Fix the flaky tests that turn the nightly browser matrix red

**Epic:** 0 — Trustworthy delivery system  
**Status:** Not started (deferred on 2026-11-21: delivery comes first)  
**Risk:** Low  
**Blocked by:** None  
**Blocks:** None

## Background

`playwright-matrix.yml` (TTW-176) runs `pnpm test:e2e:matrix --fail-on-flaky-tests`: a test that fails once and passes on its retry fails the run. `docs/16-playwright-regression-strategy.md` lists this matrix as "required before release".

On 2026-11-21 the matrix was dispatched twice on the branch `codex/ci-minio-for-playwright` (commit `ef17a4c`, run `44896327371`, attempts 1 and 2). Both attempts ended red with 428 tests passed and one flaky test each, and the flaky test was not the same one:

1. Attempt 1: `[mobile-webkit-web] tests/e2e/web/password-reset.comprehensive.spec.ts:29`, "forgot-password validates the email and gives the same answer for any account". First attempt failed after 17.4 s, the retry passed. Error: `expect(locator).toBeVisible() failed … element(s) not found`.
2. Attempt 2: `[chromium-web] tests/e2e/web/fundraiser-checkout-undeliverable-state.comprehensive.spec.ts:99`, "shows the API refusal for an address linked to a deactivated state". First attempt failed, the retry passed. Error: `expect(received).toEqual(expected)` (the strict page guard of `tests/e2e/fixtures/test.ts`).

Other recent matrix results on `main` (nightly schedule): red on 2026-11-18 (`f524147`), green on 11-12 to 11-17, 11-19, 11-20, and red on 2026-11-21 (`015c18c`) for another reason, already fixed (design thumbnails answering 500 in a CI without object storage, see TTW-237).

Not known: the cause of either flake. Neither was reproduced locally, the logs only give the final assertion, and two attempts are too few to tell whether the new MinIO service added to the CI on 2026-11-21 plays a part (nothing suggests it does). Precedent: TTW-188 (cancelled Firefox prefetches counted as failures) removed one source of random red runs.

## Decision recorded

2026-11-21, the user: open this ticket but do it later, because the delivery deadline comes first. Consequence to keep in mind: until this ticket is done the nightly matrix may stay red at random, and the release gate "matrix required before release" will either need this ticket or an explicit, written waiver for the release.

## Proposal

For each of the two tests, find the root cause before touching the test:

- Reproduce under the failing project in CI (`--repeat-each` on that one spec, in a throwaway workflow dispatch on a branch), keep the trace of a failure.
- Fix the cause: a missing wait on a real condition, a shared fixture, data that another test changes, or a real bug in the page. Do not add a blind retry, a longer sleep, a `skip`, or a looser assertion.
- If the guard in `tests/e2e/fixtures/test.ts` reports a real first-party failure, fix the failure, do not widen the guard.

Then dispatch the matrix several times and record that it stays green.

## Invariants

- The strict page guard keeps failing on real first-party errors in every browser.
- No test is skipped, weakened or made to pass by a longer timeout without a stated reason.
- `--fail-on-flaky-tests` stays on.

## Implementation plan

1. Reproduce each flake (repeat-each in CI on a branch) and keep the traces.
2. Write down the cause of each, then fix it. If a cause is a product bug, say so here and fix it in its own ticket.
3. Dispatch `playwright-matrix.yml` at least 3 times on the branch. Record run ids.
4. Update this ticket with the evidence.

## Test and observability plan

- Integration/e2e: the two specs pass 20 times in a row under their project (`--repeat-each=20`); the full matrix is green on 3 consecutive dispatches.
- Failure, retry, and concurrency: no retry needed to pass.
- Logs, metrics, traces, and alerts: keep the Playwright trace of any failed attempt as an artefact while investigating.

## References

- `.github/workflows/playwright-matrix.yml`
- `docs/16-playwright-regression-strategy.md` — the matrix "required before release".
- `tests/e2e/fixtures/test.ts` — the strict page guard.
- `tests/e2e/web/password-reset.comprehensive.spec.ts:29`
- `tests/e2e/web/fundraiser-checkout-undeliverable-state.comprehensive.spec.ts:99`
- `docs/tickets/ttw-188-ignore-cancelled-prefetches-in-firefox.md` — precedent.
- Run `44896327371` (attempts 1 and 2).

## Acceptance criteria

- [ ] The cause of each of the two flakes is written down and fixed.
- [ ] The two specs pass 20 times in a row under their own project.
- [ ] The full matrix is green on 3 consecutive dispatches, with run ids recorded below.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Other tests of the matrix that are not seen failing.
- Changing the `--fail-on-flaky-tests` policy.

## Design review

Pending. Not started: deferred on 2026-11-21.

## Implementation reviews

Pending.

## Verification evidence

Pending.

## Completion summary

Pending.
