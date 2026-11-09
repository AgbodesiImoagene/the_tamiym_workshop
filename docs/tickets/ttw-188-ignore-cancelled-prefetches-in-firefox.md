# TTW-188 — Stop the strict page guard flagging prefetches that Firefox cancels

**Epic:** 0 — Trustworthy delivery system  
**Status:** Complete (2026-11-09): on branch `codex/ttw-188-ignore-cancelled-prefetches`, not yet merged into `main`  
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

- [x] Cancelled requests are ignored in Chromium, Firefox and WebKit; other failures are still reported.
- [x] The Firefox matrix project shows no flaky test over repeated runs, with evidence recorded below.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- Other flaky tests, if any appear: each gets its own ticket.

## Design review

Not required for a Low ticket.

## Implementation reviews

### Review 1 — PASS (2026-11-09)

Independent reviewer (fresh subagent, read-only) on commit `385a21a`, charter: correctness of the three texts per engine, the "only cancellations" invariant, scope. Verdict PASS, no blocking finding.

- Correctness: the texts match how Playwright 1.62.1 itself classifies a cancellation (`coreBundle.js`: Chromium CDP `canceled` flag surfacing as `net::ERR_ABORTED`, Firefox `errorCode === "NS_BINDING_ABORTED"`, WebKit `errorText.includes("cancelled")`), and Playwright's own test `tests/page/page-event-network.spec.ts` (lines 143, 179) asserts `{ chromium: 'net::ERR_ABORTED', firefox: 'NS_BINDING_ABORTED', webkit: 'cancelled' }` with `toContain`.
- Invariant: none of the three texts appears in a real failure (`net::ERR_CONNECTION_REFUSED`, `net::ERR_NAME_NOT_RESOLVED`, `net::ERR_EMPTY_RESPONSE`, `NS_ERROR_CONNECTION_REFUSED`, `NS_ERROR_UNKNOWN_HOST`, `NS_ERROR_NET_RESET`, WebKit "Could not connect to server", "The network connection was lost.", "The request timed out."). The WebKit `cancelled` substring is broad but is exactly Playwright's predicate.
- Non-blocking notes: the match is case-sensitive (a "Cancelled" spelling would still fail the test, theoretical only); `route.abort('aborted')` in `checkout-idempotency.spec.ts` still yields `net::ERR_ABORTED` on Chromium, the only engine its project uses, so the updated comment is accurate.

## Verification evidence

WebKit text confirmed before the change (plan step 1): in the installed `playwright-core@1.62.1` bundle, WebKit's `_onLoadingFailed` marks a request as cancelled when `event.errorText.includes("cancelled")` ("Load request cancelled" on Linux, "cancelled" on macOS); upstream test above asserts the same three texts.

Quality gates (local, Node 24.22.1, after `pnpm install --frozen-lockfile` and `pnpm db:generate` in the fresh worktree):

- `pnpm format:check` → "All matched files use Prettier code style!", exit 0.
- `pnpm lint` → "Tasks: 6 successful, 6 total", exit 0 (0 errors; existing warnings in admin/api only).
- `pnpm typecheck` → "Tasks: 6 successful, 6 total", exit 0. `tests/e2e` is not covered by any workspace typecheck, so the two touched files were also checked with `tsc --noEmit --strict --module esnext --moduleResolution bundler --skipLibCheck` (Node types from `apps/api`) → exit 0.
- `pnpm playwright:validate` → "Playwright manifest validation passed.", exit 0.
- `playwright test --list --project=firefox-web --project=webkit-web --project=chromium-app` → "Total: 130 tests in 17 files" (fixture compiles).

Browser matrix (`playwright-matrix.yml`, `pnpm test:e2e:matrix --fail-on-flaky-tests`, CI retries 1), dispatched twice on the pushed branch at commit `385a21a`:

- [run 42701398230](https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/42701398230): success, "Running 341 tests using 2 workers", "3 skipped", "338 passed (4.8m)", no flaky test.
- [run 42701449552](https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/42701449552): success, "Running 341 tests using 2 workers", "3 skipped", "338 passed (3.2m)", no flaky test.

Not verified: a deliberate real network failure under Firefox/WebKit (covered by code reading and the review, not by a test); two runs reduce but cannot rule out a timing flake (the original flake showed in 1 of 4 runs). The nightly matrix keeps watching it.

## Completion summary

- `tests/e2e/fixtures/test.ts`: new named list `CANCELLED_REQUEST_ERRORS` (`net::ERR_ABORTED`, `NS_BINDING_ABORTED`, `cancelled`) with a comment; the strict page guard ignores a failed first-party request only when its error text contains one of them. Every other failure still fails the test.
- `tests/e2e/app/checkout-idempotency.spec.ts`: comment now says the guard tolerates cancellations only (`net::ERR_ABORTED` on Chromium, where the spec runs).
- Deviation from plan: none. No `--repeat-each` loop was needed; the two matrix dispatches were enough for the "Done" criteria.
- Remaining: merge into `main` and push, when the user asks.
