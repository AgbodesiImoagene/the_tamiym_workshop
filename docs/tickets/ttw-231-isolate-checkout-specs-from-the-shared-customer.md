# TTW-231 — Give each checkout journey its own customer so they can run in parallel

**Epic:** 8 — Client review delivery\
**Status:** Complete (matrix workflow not run)\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

Found while verifying TTW-093 and TTW-230. With the default local worker count, a full `chromium-app` run failed in three of four runs on a checkout journey that passes alone and with one worker: `checkout-idempotency.spec.ts` (twice) and `checkout-delivery-instructions.spec.ts` (once).

Cause, shown with a temporary diagnostic copy of the spec and by reading the code:

- The failing request is the second `POST /v1/orders` of `checkout-idempotency.spec.ts`: `409 IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`.
- The order fingerprint (`apps/api/src/orders/order-idempotency.ts`) covers the saved delivery address, including its `instructions`.
- Checkout saves the address when the customer clicks "Review quote" (`apps/app/app/dashboard/checkout/page.tsx`, `instructionsPayload`).
- `checkout-idempotency`, `checkout-delivery-instructions` and `checkout-order-note` all log in as the same seeded customer and so share one address row. One spec saving it between another spec's two clicks changes the fingerprint (409), or overwrites the instructions another spec just typed (the admin page then has no instructions).

The API is right to refuse: the product behaviour is TTW-037. The specs are not isolated. These specs are tagged `@journey`, so they run in `playwright-matrix.yml` (`--fail-on-flaky-tests`, 2 workers), not on every push.

## Proposal

- Seed one customer with one default address per spec that saves the address at checkout: idempotency, delivery instructions, order note. Same pattern as `customerUndeliverable` (TTW-217: "kept apart from the main customer: specs share that one's address and run in parallel").
- Add the three logins to `auth.setup.ts` and the identities.
- Let a spec choose its customer with `test.use({ customerAuthState: '…' })`: the existing `customerPage` fixture reads that option (default `customer`), so the specs keep their code.
- Rejected: a serial Playwright project (a project's `fullyParallel: false` only orders tests inside one file, so it would not serialise across files); a global `workers: 1` (slows every run).

## Invariants

- No spec is removed, skipped or weakened; assertions are unchanged.
- The main seeded customer and its address are unchanged.

## Implementation plan

1. Record the failing evidence: the three specs together, 3 workers, repeated.
2. Seed users and addresses, identities, auth setup, fixture option, `test.use` in the three specs.
3. Repeat the same run and show it passes every time; run the full app and web projects.

## Test and observability plan

- Playwright: the three specs run 5 times in parallel with 3 workers, then the full `chromium-app` and `chromium-web` projects.
- Logs, metrics, traces, and alerts: nothing new.

## References

- `apps/api/src/orders/order-idempotency.ts` — fingerprint.
- `apps/api/scripts/seed-e2e-dummy-data.ts` — `customerUndeliverable` precedent.
- `playwright.config.ts` — projects, workers.

## Acceptance criteria

- [ ] The three specs pass in every one of 5 parallel runs on a fresh database.
- [ ] No spec removed, skipped or weakened.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- The other specs that use the main customer (settings, products, orders): they passed in every run, and are not changed.

## Design review

Blast radius: the e2e seed, the saved logins and three specs; no product code, API, migration or OpenAPI change. Duplication check: the `customerUndeliverable` users (TTW-217) are the precedent for a customer kept apart from the main one; the new fixture option reuses the `customerPage` fixture instead of a new fixture per spec. Edge cases: the main customer and its address stay as they were (other specs, the seeded orders and campaigns use them); phones `+2348000000011` to `13` are unused. Rejected: a serial project (does not order tests across files), `workers: 1` (slows all runs). Risk: Low. Verdict: proceed.

## Implementation reviews

`/code-review` (low): one finding, the list of three customers written twice in the seed (users and addresses). Fixed with one `CHECKOUT_CUSTOMERS` table. No other finding.

## Verification evidence

Local PostgreSQL 17, throwaway database dropped afterwards, Redis DB 14, 2026-11-20.

- Before (the same three specs, 3 workers): 3 failed runs out of 6 (`checkout-idempotency` 409 `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`; `checkout-delivery-instructions` instructions missing on the admin order).
- After: the three specs, 3 workers, 6 runs in a row: 11 passed each time, 0 failed (8 tests plus the 3 new login setups).
- `chromium-app`, `chromium-web` and `chromium-journeys` together, default 4 workers, on a freshly migrated and seeded database: 148 passed, 3 skipped, 0 failed, in 3 separate runs (one before the seed table refactor, two around it).
- `pnpm --filter api typecheck`: clean. `pnpm format:check`, `pnpm docs:validate`, `pnpm playwright:validate`: see the commit.

Finding to know: the e2e specs are not re-runnable on a database that already ran them. Repeating the full suite on the same database failed on stock used by earlier orders and on the password-reset tokens (three per seed). CI always seeds a fresh database, so it is not hit; locally, recreate the database between full runs. Not changed here.

Not verified: CI (`playwright-matrix.yml`, 2 workers, other browsers), and the admin and a11y projects.

CI: CI on the pushed branch `codex/ttw-093-use-real-categories-and-paginate-catalog`, run 44779149860 (commit 5d528b0): every job green, including Unit Tests, Coverage, API Integration and Playwright Smoke. That workflow runs only the `@smoke` Playwright tests; the `@journey` and `@comprehensive` specs added or changed here were run locally only (see above).

## Completion summary

Done: three seeded customers with their own default address, three saved logins, an option on the `customerPage` fixture (`test.use({ customerAuthState })`), and one line in each of the three checkout specs. No assertion changed. Remaining: CI run of the matrix workflow, then tick the roadmap. Possible follow-up: make the full suite re-runnable on one database (see the finding above).
