# TTW-248 — Harden the Paystack webhook and check its key at startup

**Epic:** 2 — Security and trust boundaries\
**Status:** Complete\
**Risk:** Critical\
**Blocked by:** None\
**Blocks:** None

## Background

A read-only security audit (2026-11-22, code reading only, nothing run) asked: can an order be placed without paying? Answer: no bypass found. The only path to `PAID` is the signed Paystack `charge.success` webhook; price comes from the server quote; admin transitions cannot reach `PAID`; amount and currency are checked. The audit left three hardening points, none exploitable on its own:

1. **Signature comparison is not constant time.** `PaystackWebhookService.verifySignature` (`apps/api/src/orders/paystack-webhook.service.ts`) ends with `hash === signature`.
2. **`PAYSTACK_SECRET_KEY` is not checked at startup.** It is absent from `requiredEnvVars` and `requiredProductionEnvVars` in `apps/api/src/config/env-validation.ts`. Without it the webhook rejects everything (safe) but the API boots and no order can ever be paid.
3. **The amount check is optional.** In `processChargeSuccess`, the amount test runs only when `event.data.amount != null`, and the currency test only when `event.data.currency != null`. The same `!= null` pattern exists in `recordLateCapture`, which returns `'skipped'` when either is missing. The event is signed by Paystack, so the risk is low, but a settlement should fail closed.

## Proposal

- Point 1: compare the two HMAC values with `crypto.timingSafeEqual` on equal-length buffers; return `false` (no throw) when the lengths differ or the signature is not hex.
- Point 2: require `PAYSTACK_SECRET_KEY` in production in `env-validation.ts`, and reject placeholder values the same way the JWT secrets are rejected. Outside production and test, keep the behaviour unchanged. Document the variable where the other production variables are documented.
- Point 3: a `charge.success` with a missing `amount` or `currency` must not settle the order. Treat it like a mismatch with a distinct log and metric reason, and do not cancel the order for it (the event is malformed, not a wrong payment). An admin notification is raised so the money is not lost. The exact handling is settled in the design review.

Rejected: switching to a Paystack "verify transaction" call inside the webhook (network call in the settlement path, a separate decision).

## Invariants

- A signed, well-formed `charge.success` for the right amount and currency still settles exactly once (duplicate and concurrent delivery unchanged).
- A paid order is never created without a valid signature, the right amount and the right currency.
- A valid signature is never rejected because of the comparison change.
- No network call inside a database transaction. No secrets or PII in logs.

## Implementation plan

Two independent work packages, each on its own branch from `main` in its own worktree (they touch different files):

- **A — points 1 and 3** (same service): `paystack-webhook.service.ts` and its specs, plus an integration test on real Postgres.
- **B — point 2**: `env-validation.ts` and its spec, plus the environment documentation.

1. Tests first, shown failing for the right reason.
2. Implement in small steps, record any deviation here.
3. Run the gates, record exact results, obtain the independent review for this risk level.

## Test and observability plan

- Unit: `verifySignature` accepts a valid signature, rejects a wrong one, a different length, a non-hex value, an empty value; production startup fails without `PAYSTACK_SECRET_KEY` and with a placeholder.
- Integration (real Postgres): `charge.success` without `amount`, without `currency`, then with both: the first two leave the order `PENDING_PAYMENT` with stock still reserved; the third settles once; a redelivery is a duplicate.
- Concurrency: an existing settlement test must still pass unchanged.
- Observability: a new counter label for a malformed charge event; no new alert unless the review asks for one.

## References

- `apps/api/src/orders/paystack-webhook.service.ts` — `verifySignature`, `processChargeSuccess`, `recordLateCapture`.
- `apps/api/src/orders/webhooks.controller.ts` — raw body and signature header checks.
- `apps/api/src/config/env-validation.ts` — required environment variables.
- `docs/orders/ttw-041-interim-policy.md`, TTW-088, TTW-189 — related late and extra capture handling.
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.

## Acceptance criteria

- [x] The signature is compared in constant time, and the existing webhook tests pass. (package A)
- [x] The API refuses to start in production without a real `PAYSTACK_SECRET_KEY`. (package B)
- [x] A `charge.success` without amount or currency never marks an order paid, and is visible to an admin. (package A)
- [x] Required quality gates pass with evidence recorded below.
- [x] Docs, contracts and observability are updated where applicable. (package A: alert, runbook, metric, admin template; package B: environment docs)

## Out of scope

- Verifying the transaction with Paystack from the webhook.
- Frontend apps (`web`, `app`, `admin`): not audited.
- Active abuse testing (replay, forged signatures) against a running instance.

## Design review

Recorded 2026-11-22 for package A (points 1 and 3), before any code.

**Point 1 — signature comparison.**

- Compute the HMAC-SHA512 hex digest as today. Reject (return `false`, never throw) if the signature is not a string or is empty. Build two `Buffer`s from the two hex strings (utf8, no hex decoding, so a non-hex value cannot be silently truncated). If the byte lengths differ, return `false` (`timingSafeEqual` throws on unequal lengths, so the length check comes first; the length of a SHA-512 hex digest is public, so this leaks nothing). Otherwise return `crypto.timingSafeEqual(a, b)`.
- Semantics are identical to the old `===` for every input, so a valid lowercase signature is never rejected. No new dependency, no contract change.

**Point 3 — fail closed on a missing `amount` or `currency`.**

- _Pending, not expired order_ (the settlement path): before the amount and currency tests, if `amount` or `currency` is `null`/`undefined`, do **not** settle. Concretely: no `ChargeSettlementClaim`, no transaction, order stays `PENDING_PAYMENT`, stock stays reserved, payment status unchanged. We do not cancel the order: the event is malformed, not a wrong payment, and a later well-formed delivery (or the expiry cron) still resolves it. The event is logged at error level (reference, order id, which field is missing, no PII), counted as webhook label `charge.success.missing_amount_or_currency` (`denied`) and settlement outcome `malformed` (new, exported at 0 from startup like `late_captured` and `extra_capture` so `increase()` sees the first one), and an admin is told with the existing `admin.payment.captured_on_cancelled_order` key (same key the extra-capture path reuses; the reason text states that the event had no amount/currency, the order was left awaiting payment, and the capture must be checked in the Paystack dashboard). No new event key, so no route/default/template migration.
- _Cancelled or expired order_ (`recordLateCapture`): it already fails closed (returns `skipped`, records nothing, admin told "manual refund required"). We only make the reason distinct: a new outcome `malformed` (instead of folding it into `skipped`) so the log text, the settlement metric (`malformed`) and the admin reason say the event had no amount/currency. Behaviour is otherwise unchanged: nothing recorded, the expired order is still cancelled and its stock released (it was already past its deadline).
- _Extra capture on a paid order_ (`handleExtraCapture`): unchanged. It records whatever Paystack captured because the money is held either way (TTW-189).
- A present but wrong-typed value (for example a string amount) keeps going through the existing mismatch path. Out of scope.
- Redelivery: a malformed delivery creates no claim, so a later complete delivery settles exactly once; a redelivery of the complete event is then a duplicate. Each malformed delivery raises one admin notification (Paystack retries only on non-2xx, and the handler returns normally).
- The status check (`status` present and not `success`) keeps its current position after the amount checks.

**Addendum 2026-11-22 (second review round, expired orders).** The review found that on an order whose `expiresAt` has passed, the code cancels it and releases the stock _before_ looking at amount and currency, so an incomplete event cancels an expired order. Decision: keep it. The expired path already cancels for a complete event (TTW-088), the deadline has passed so the stock must not stay held, and the cancelled order still records a later complete event as a late capture for refund. Failing closed without cancelling would strand an expired order for ever (the expiry job skips orders with an `INITIATED` payment). So the invariant "an incomplete event leaves the order `PENDING_PAYMENT`" holds only for an order that has not expired; on an expired order the guarantee is "no capture recorded, nothing marked paid, admin told". Accepted risk: a non-expired order that receives an incomplete event can stay stuck (Paystack got `200` and does not retry; the expiry job skips it); the runbook gives the manual resend or cancel steps. Not fixed here (no new automatic job): follow-up ticket proposed, see the completion summary. Also found: the admin event key had no built-in template, so no admin alert was ever sent for it (see implementation review round 2).

**Invariants.** (I1) A paid order needs a valid signature, the right amount and the right currency, now all three present. (I2) At most one `ChargeSettlementClaim` per payment/business key, still enforced by the database unique constraint; the malformed branch writes nothing so it cannot consume the claim. (I3) No network call inside a database transaction: the new branch opens no transaction; the admin notification is sent outside any. (I4) No secrets or PII in logs: only reference, order id and field names.

**Threat and concurrency analysis.** A forged event is already stopped by the signature. A signed event without amount/currency cannot come from a healthy Paystack; refusing it removes the only case where the amount test was skipped. Concurrent deliveries of a malformed event each do a read and return; none writes. Concurrent malformed plus complete delivery: the complete one wins the claim as before; the malformed one either returned earlier or finds the claim and counts a duplicate. The pending order cannot be paid by the malformed event. Correction after review: the expiry job skips orders that still have an `INITIATED` payment, so the stock stays reserved until a complete event arrives or an admin cancels the order. The admin notification (and the alert added in review) is therefore the resolution path, and its text says what to do.

**Database enforcement.** No schema change. The unique claim constraint (`provider`, `businessKey`) and the `updateMany ... status: PENDING_PAYMENT` guard remain the enforcement points.

**Test impact.** Several existing unit tests send `charge.success` without amount or currency and expect settlement (`should update payment and order...`, campaign settlement, claim conflict, rethrow, not PENDING). Those fixtures are incomplete under the new contract: their assertions are kept as they are and only the missing `amount` (kobo) and `currency` are added to the event. Existing e2e suites already send both fields.

## Implementation reviews

**Package A, review 1 (independent subagent, one comprehensive Critical pass: invariants, concurrency, database enforcement, tests, logs). Verdict: PASS, no blocker.** Findings and what was done:

- A (should-fix): the design review claimed the expiry cron releases stock if no complete event arrives. False: `order-expiry.service.ts` skips any `PENDING_PAYMENT` order with an `INITIATED` payment. Fixed: design review text corrected; the admin reason now tells the admin what to do (resend the webhook from Paystack if the money was captured, otherwise cancel the order).
- B (should-fix, required): no alert covered `malformed`. Fixed: `malformed` added to `TamiymExtraPaymentCapture` in `docker/observability/prometheus/alerts.yml`, and `docs/runbooks/webhooks-money.md` updated. `validate-observability-artefacts.mjs`: "Prometheus alerts OK (7 groups, 19 rules)". This is a deviation from the plan ("no new alert unless the review asks"): the review asked.
- C (nit): the missing-field check runs before the `status` check, so a `charge.success` with `status: "failed"` and no amount now alerts an admin. Accepted: such an event is malformed anyway and it is improbable.
- D (nit): the admin event key is named "captured on cancelled order" and is reused for a pending order. Accepted (same reuse as TTW-189); the reason text is explicit.
- E (nit): sections to fill. Done here.

No second review was needed (all findings fixed or accepted with a reason, none a blocker); the changes after the review are a message text, one alert regex, one runbook line and ticket text, re-checked by the unit spec (43/43), the two e2e suites below and eslint/tsc on the touched files.

**Package A, review round 2 (reserves from a second independent review, then an independent review of that delta only). Verdict of the delta review: PASS, no blocker.** Reserves handled:

- Expired order plus incomplete event: characterisation tests (unit and e2e, they pass at once) and the decision recorded in the design review addendum and the runbook.
- Pending order stuck after an incomplete event: recorded as an accepted risk; runbook section "Incomplete `charge.success`"; automatic follow-up proposed as a separate ticket (not built).
- Alert text split between "refund" cases and `malformed` ("do not refund first"). `promtool` is not installed on the machine, so rules were validated only with `scripts/quality/validate-observability-artefacts.mjs`.
- Admin event key `admin.payment.captured_on_cancelled_order` had no built-in template, so `AdminNotifyService.emit` returned early and no admin alert was ever sent for late, extra or incomplete captures (a real defect, older than this ticket). Added a template and a test that every catalogued event has one; e2e proves an enabled route receives an outbox e-mail. Description text corrected.
- Upper-case and whitespace signatures: tests added (reject).
- Reported only, not fixed: no de-duplication of admin notifications on repeated incomplete deliveries; `handleExtraCapture` on a paid order does not require amount or currency.
- Delta review findings fixed: the e2e test deletes the notification route it creates (shared database); the runbook no longer promises that a Paystack dashboard resend settles the order (it replays the stored, possibly still incomplete, payload), the engineer settles by hand; the runbook names the admin order screen and says no notification route is seeded, so the e-mail/SMS alert needs one to be configured. Accepted nit: the new template subject is also used for refund cases; the reason carries the instruction.

## Verification evidence

Package A, Node 24, branch `codex/ttw-248-webhook-hardening`, throwaway database `tamiym_workshop_test_ttw248a` (migrated by the e2e global setup; `seed:e2e` not run), `REDIS_DB=7`.

- Failing first: `npx jest src/orders/paystack-webhook.service.spec.ts` -> 6 failed, 37 passed (timingSafeEqual spy; four "no amount/currency" cases expected 0 transactions but got 1; cancelled case expected `malformed` got `rejected`). `test/paystack-malformed-charge.e2e-spec.ts` -> 2 failed (order was `PAID`, expected `PENDING_PAYMENT`), 1 passed.
- After the fix: that unit spec 43/43. After completing 8 old fixtures (only `amount` and `currency` added, assertions untouched, see `git diff`): same spec 43 passed.
- e2e (`test:e2e` config, `--runInBand`): `paystack-malformed-charge`, `paystack-charge-settlement`, `paystack-extra-capture`, `paystack-late-payment-refund`, `inventory-lifecycle`, `order-customer-cancel`, `address-state-not-deliverable`, `paystack-refund-lifecycle` -> 8 suites, 40 tests passed. After the review fixes: `paystack-malformed-charge` and `paystack-late-payment-refund` -> 11 passed.
- `pnpm lint` exit 0; `pnpm typecheck` exit 0; `pnpm test` exit 0 (api: 178 suites, 2190 tests passed); `pnpm --filter api test:coverage` exit 0.
- `git fetch origin main`, then `pnpm coverage:ratchet`: statements 85.50% (floor 55.64), branches 71.33% (48.73), functions 76.69% (54.64), lines 85.79% (56.00), passed. `pnpm coverage:diff`: 24/24 lines (100%), floor 80%, passed.
- `pnpm format:check`: run again after this ticket text; result recorded in the completion summary.
- Round 2 (after commit 1d10bc7), same throwaway database (recreated) and `REDIS_DB=7`: unit spec 70 passed before the template fix except 3 failing for the right reason (no template for the event key); after it all passed. `pnpm lint`, `pnpm typecheck`, `pnpm format:check` exit 0; api tests 179 suites, 2217 tests passed; `coverage:ratchet` passed (statements 85.50%, branches 71.36%); `coverage:diff` 24/24 lines; e2e `paystack-*`, `inventory-lifecycle`, `order-customer-cancel`, `address-state-not-deliverable` 9 suites, 47 tests passed. Final check after the review fixes is in the completion summary.
- `pnpm openapi:check`: not run, no controller, DTO or contract changed.

## Package A summary

Package A (points 1 and 3) was done on `codex/ttw-248-webhook-hardening`.

- `verifySignature` uses `crypto.timingSafeEqual` on equal-length buffers and returns `false` (never throws) for a different length, non-hex, multi-byte, empty or missing value.
- A signed `charge.success` without `amount` or `currency` no longer settles: on a pending order it writes nothing (no claim, no transaction), leaves the order `PENDING_PAYMENT` with stock reserved, logs, counts (`charge.success.missing_amount_or_currency`, settlement outcome `malformed`), alerts (Prometheus) and notifies admins with what to do. On a cancelled or expired order the existing "not recorded, manual refund" handling is kept with the distinct `malformed` reason.
- Known limit: a malformed event leaves the order pending until a complete event arrives or an admin cancels it (the expiry job skips orders with an `INITIATED` payment). That is not new, and it is why the alert and the admin message exist.
- Not verified: no Playwright/UI (not applicable); no run against a real Paystack; package B (point 2, `env-validation.ts`) and its acceptance box are another branch and still open; a string-typed `amount` still goes through the old mismatch path (out of scope).

## Merge

Both branches were merged locally into `main` with `--no-ff`, A then B, without conflict: `9191284` (package A, commits `1d10bc7` and `f9f3ad5`) and `4808bbd` (package B, commit `db8ba27`). On the merged `main`: `pnpm typecheck` (6 tasks successful), `pnpm --filter api test -- src/config src/orders/paystack-webhook.service.spec.ts src/admin-notifications` (6 suites, 178 tests passed), `pnpm format:check`, `pnpm docs:validate` and `pnpm openapi:check` passed. `main` was pushed at `4808bbd`.

CI on `main`: run 45059501525 (commit `4808bbd`) failed only on `API Open Handles`: all 67 suites and 411 tests passed, then the proof timed out at its 240 s budget (the suite took 237 s). `Playwright Comprehensive` (45059501500) passed. The budget was raised to 360 s in `5c51974` (`.github/workflows/ci.yml`); the run on that commit, 45062267332, passed every job, and `Playwright Comprehensive` 45062267399 passed too.

## Package B evidence (point 2)

Reported by the package B session and its independent review (PASS), re-checked on the merged `main` where stated above: `PAYSTACK_SECRET_KEY` is in `requiredProductionEnvVars`; a placeholder (prefix `placeholder`, the example value, the common forbidden placeholders) is rejected in production without echoing the value; development, staging and `NODE_ENV=test` are unchanged; `pnpm --filter api test -- src/config` gave 99 tests passed in the review. Docs updated: `apps/api/.env.example`, `docs/10-deployment-and-environments.md`, `docs/11-development-setup.md`, `docs/infrastructure/ttw-065-identity-secrets.md`, `infra/runtime/secrets/.env.example` and its README. Not verified: `pnpm infra:validate` was not run on the branch (no `tofu` on the machine; the CI `Infra Validate` job passed on `main`); no real production environment was checked.

## Completion summary

Points 1, 2 and 3 are done and on `main`. Signature comparison is constant time; a `charge.success` without amount or currency no longer settles and alerts an admin; production refuses to start without a real `PAYSTACK_SECRET_KEY`. A defect older than this ticket was fixed on the way: the admin event `admin.payment.captured_on_cancelled_order` had no template, so no admin alert was ever sent for late, extra or incomplete captures.

Deviations: a new Prometheus alert reason (`malformed`) and a runbook section, because the review asked; the CI budget of `API Open Handles` raised from 240 s to 360 s after this ticket's new e2e suite pushed the job over its limit.

Deploy note: a production environment still holding the template placeholder for `PAYSTACK_SECRET_KEY` will no longer start (API, worker, scheduler); set the real key in `/etc/tamiym/secrets.env` before deploying.

Follow-up tickets opened: TTW-249 (orders stuck after an incomplete event), TTW-250 (format check of the Paystack key), TTW-251 (remaining webhook edge cases).
