# TTW-079 — Give refund e2e tests unique Paystack refund ids

**Epic:** 0 — Trustworthy delivery system\
**Status:** In progress — local gates green on `codex/ttw-079-unique-refund-e2e-provider-ids`; GitHub CI not yet run\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** A reliably green CI job "API Integration"

## Background

CI run [41888502419](https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/41888502419) on `main` (`6323a28`) failed job "API Integration", step "Prove no open handles", with:

```
FAIL test/paystack-refund-lifecycle.e2e-spec.ts
  ● Paystack refund lifecycle (e2e) › marks PARTIALLY_REFUNDED for a partial confirmed refund
    Expected: "PARTIALLY_REFUNDED"
    Received: "PAID"
      at Object.<anonymous> (paystack-refund-lifecycle.e2e-spec.ts:253:28)
```

The two earlier e2e passes of the same job were green, and the job was green on the previous `main` runs (`41674005376`, `41667735477`).

Cause (test-only):

- `apps/api/test/paystack-refund-lifecycle.e2e-spec.ts` builds each mocked Paystack refund id from a fixed prefix plus the **last 3–4 digits of `Date.now()`** (`9001…`, `8001…`, `7001…`, `6000<n>…`, `5500…`), so only ~10 000 values exist per test.
- `test/global-setup.ts` only migrates; it never empties the database. CI runs the e2e suite three times on the same database (pass 1, pass 2, open-handle proof), and local runs accumulate rows too.
- When a run reuses an id already stored by an earlier run, `RefundsService.findRefundForWebhook` (`src/orders/refunds.service.ts:660`) finds the **old, already settled** refund by `providerRef`, and `settleRefundProcessed` returns early (`src/orders/refunds.service.ts:802`). The new refund is never applied, so the order stays `PAID`.

Real Paystack refund ids are unique, so production code is not affected; the collision only exists in the test fixture.

## Proposal

Generate the mocked provider refund ids from one helper in the spec that is unique across runs sharing a database: `Date.now() * 1000 + <per-process counter>` (about 1.8e15, below `Number.MAX_SAFE_INTEGER`, so `Number(providerRef)` in the webhook payloads stays exact). Tests that assert the id reuse the value they generated.

Rejected alternatives:

- Truncating the database in `global-setup.ts`: changes the harness for every suite and hides other cross-run assumptions; out of scope.
- Random ids: still collide with low probability and are harder to reason about.
- Making `findRefundForWebhook` prefer in-flight refunds: a production behaviour change for a test-only defect.

## Invariants

- No production code changes; every assertion of the spec keeps its meaning and strength.
- Each mocked provider refund id is distinct from every id written by an earlier run on the same database.

## Implementation plan

1. Reproduce: run the spec twice with the clock's last four millisecond digits pinned (see Verification evidence) and show the partial-refund test fails on the second run.
2. Add the helper and use it for all five mocked ids in the spec.
3. Re-run the same reproduction (both runs green), then the full API e2e suite and the open-handle proof.

## Test and observability plan

- Unit/component: not applicable.
- Integration/e2e: `paystack-refund-lifecycle.e2e-spec.ts` repeated against the same database with pinned clock digits; full `pnpm --filter api test:e2e`; `node scripts/quality/prove-e2e-open-handles.mjs`.
- Failure, retry, and concurrency: the concurrent tests keep their concurrency (25 webhooks, 8 initiations, 6 same-key retries).
- Logs, metrics, traces, and alerts: not applicable.

## References

- `apps/api/test/paystack-refund-lifecycle.e2e-spec.ts:133,225,262,300,359,388` — ids built from `suffix.slice(-4)` / `slice(-3)`.
- `apps/api/test/global-setup.ts` — migrates only, no reset between runs.
- `apps/api/src/orders/refunds.service.ts:660` — webhook lookup by `providerRef` (`findFirst`).
- `apps/api/src/orders/refunds.service.ts:802` — early return for an already settled refund.
- `.github/workflows/ci.yml:211-225` — three e2e passes on one database.

## Acceptance criteria

- [x] The reproduction fails before the change and passes after it.
- [x] Full API e2e suite and the open-handle proof pass locally.
- [x] Lint and typecheck pass for `apps/api`.
- [ ] CI job "API Integration" green on GitHub.

## Out of scope

- Resetting the e2e database between runs.
- Other e2e specs: none build provider ids from truncated timestamps (`grep "slice(-" apps/api/test`).

## Design review

Not required (low risk).

## Implementation reviews

### Iteration 1 — PASS (2026-11-04)

Independent read-only reviewer (fresh agent). Charter: root cause against the service code, assertion strength, numeric safety of the ids, other specs with the same pattern, ticket references.

- Root cause confirmed: `findRefundForWebhook` takes the first refund with that `providerRef` (`refunds.service.ts:660`; `providerRef` is not unique in the schema) and `settleRefundProcessed` returns early for a settled refund (`:802`). No other path to the same flake found.
- No assertion weakened: the concurrent tests keep 25 webhooks, 8 initiations and 6 same-key retries; the same-key test asserts the exact id it generated; the 8-initiation test still gets a distinct id per provider call.
- Numeric safety: about 1.8e15, below `Number.MAX_SAFE_INTEGER`; `providerRef` is a string compared with `String(data.id)`.
- No other spec builds lookup ids from truncated timestamps (`payment-initiation.e2e-spec.ts:47` only builds a mock access code).
- Optional nit: the third CI step is the open-handle proof script; it does rerun the whole suite (`scripts/quality/prove-e2e-open-handles.mjs` spawns `jest --config ./test/jest-e2e.json`).

## Verification evidence

Reproduction aid (scratch file, not committed): a Jest `setupFiles` entry that, for `Date.now()` calls made directly from this spec only, returns `floor(now / 10000) * 10000 + 4242`. Full values stay distinct (emails, slugs), but the last four digits repeat across runs more than 10 s apart, as two CI passes can by chance. The app keeps the real clock. Command, run twice on the same test database:

```
NODE_ENV=test NODE_OPTIONS=--experimental-vm-modules pnpm exec jest test/paystack-refund-lifecycle.e2e-spec.ts \
  --config ./test/jest-e2e.json --runInBand --verbose --setupFiles '<rootDir>/setup-env.ts' <scratch>/pin-last4-ms.cjs
```

Before the change (spec from `main` `c176075`):

- Run 1: 5 passed.
- Run 2: 2 failed, 3 passed. `keeps order PAID until refund.processed…` received `PROCESSING` instead of `SUCCEEDED`. `marks PARTIALLY_REFUNDED for a partial confirmed refund` received `PAID` instead of `PARTIALLY_REFUNDED`, the same failure as CI run 41888502419.

After the change: run 1 had 5 passed, and run 2 had 5 passed.

Gates (local, Node 24, Postgres 17 + Redis):

- `pnpm --filter api test:e2e`, run twice back to back on the same database: 17/17 suites and 93/93 tests each time.
- `node scripts/quality/prove-e2e-open-handles.mjs`: 93/93, "Open-handle proof passed: no open handles reported." (96 s). A first attempt ran while the laptop was idle: `auth-surface.e2e-spec.ts` took 1 209 s, 10 of its tests failed, and the 120 s guard fired. That attempt was discarded as environmental and the rerun passed. See Completion summary for the guard issue it exposed.
- `pnpm --filter api typecheck`: exit 0.
- `pnpm --filter api lint`: exit 0, 0 errors. The 14 warnings are pre-existing, and the changed spec lints clean (`pnpm exec eslint test/paystack-refund-lifecycle.e2e-spec.ts`).
- `pnpm exec prettier --check` on the ticket and the spec: passed.
- `pnpm docs:validate`: passed.

Not verified: CI job "API Integration" on GitHub (needs a push).

## Completion summary

Test-only change: `apps/api/test/paystack-refund-lifecycle.e2e-spec.ts` now gets every mocked Paystack refund id from `uniqueProviderRefundId()`, so ids no longer repeat across runs that share the e2e database. No production code, contract, migration or observability change.

Observed, not fixed (outside scope):

- When `prove-e2e-open-handles.mjs` times out, it sends `SIGKILL` to `pnpm` only. The `jest` grandchild survives as an orphan and keeps the output pipes open, so the script never exits. Locally it hung for hours instead of failing at 120 s. → candidate follow-up ticket.
- `Refund.providerRef` is not unique and the webhook lookup uses `findFirst`. Paystack ids are unique in practice, so this is only a hardening question. → candidate follow-up ticket.
