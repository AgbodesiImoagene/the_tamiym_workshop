# TTW-188 — Stop the strict page guard flagging prefetches that Firefox cancels

**Epic:** 0 — Trustworthy delivery system  
**Status:** Not started  
**Risk:** Low  
**Blocked by:** None  
**Blocks:** None

## Background

Found by the TTW-176 browser matrix on 2026-11-08 (run 42483902366, the deliberately broken-spec run). Besides the five expected failures, one test was flaky under Firefox:

- `[firefox-web] tests/e2e/web/fundraiser-checkout.comprehensive.spec.ts:87` "explains that an empty cart cannot be checked out" failed on the first attempt and passed on its retry. The same test passed in Chromium, WebKit and both mobile profiles, and in Firefox in the three other matrix runs (42431599230, 42469100727, 42483905699).
- Error, raised by the strict page guard's final check (`tests/e2e/fixtures/test.ts:50`; failures are collected at lines 44-46): four `First-party request failed: GET http://localhost:3000/<page>?_rsc=… (NS_BINDING_ABORTED)` for `/`, `/about`, `/fundraiser` and `/solutions/bulk`. Those are Next.js `<Link>` prefetches of the header links (`_rsc` requests). The test finished before they completed, so Firefox cancelled them.
- The guard already ignores the same situation in Chromium: `tests/e2e/fixtures/test.ts:45` skips failures whose text contains `net::ERR_ABORTED`. Firefox reports a cancelled request as `NS_BINDING_ABORTED` (WebKit uses its own wording), so on Firefox a normal cancellation counts as a failure, depending only on timing.

With `--fail-on-flaky-tests` in `playwright-matrix.yml` (TTW-176), this makes the nightly matrix go red at random. That is why it is P1 while the other test-harness tickets are P2: a randomly red nightly run hides real browser regressions.

## Proposal

Treat a cancelled request the same way in every engine: extend the check at `tests/e2e/fixtures/test.ts:45` to the Firefox (`NS_BINDING_ABORTED`) and WebKit cancellation texts, in one small named list with a comment. Do not widen it to other errors: a refused connection or a 5xx must still fail the test.

Check `tests/e2e/app/checkout-idempotency.spec.ts:29`, whose comment relies on the guard tolerating `ERR_ABORTED` only; it runs on Chromium only, but keep the comment true.

## Invariants

- Real first-party failures (connection refused, DNS, 4xx/5xx surfaced as failed requests) still fail the test in every browser.
- Only cancellations are ignored.

## Implementation plan

1. Confirm the exact WebKit cancellation text (Playwright `request.failure().errorText` on WebKit).
2. Change the guard, update the comment in `checkout-idempotency.spec.ts` if needed.
3. Dispatch the matrix several times (or loop the spec with `--repeat-each` under `firefox-web` in CI) and record that the flake is gone.

## Test and observability plan

- Unit/component: none.
- Integration/e2e: the Firefox matrix project stays green over repeated runs; a test that fails for a real network error still fails.
- Failure, retry, and concurrency: no retry needed to pass.
- Logs, metrics, traces, and alerts: none.

## References

- `tests/e2e/fixtures/test.ts:36-51` — the strict page guard.
- `tests/e2e/web/fundraiser-checkout.comprehensive.spec.ts:87` — the flaky test.
- `docs/tickets/ttw-176-run-browser-matrix-in-ci.md` — where it was found (run 42483902366).

## Acceptance criteria

- [ ] Cancelled requests are ignored in Chromium, Firefox and WebKit; other failures are still reported.
- [ ] The Firefox matrix project shows no flaky test over repeated runs, with evidence recorded below.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Other flaky tests, if any appear: each gets its own ticket.

## Design review

Not required for a Low ticket.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not started.
