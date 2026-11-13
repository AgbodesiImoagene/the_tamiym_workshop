# TTW-209 — Replace first-party API mocks in Playwright tests with real data

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

`.cursor/rules/playwright-regression.mdc` says: "Do not mock first-party APIs in core acceptance journeys. Stub external providers through deterministic simulators." `CLAUDE.md` repeats it ("don't mock first-party APIs (Paystack is simulated)").

Found while replaying the TTW-201 test. `tests/e2e/admin/shipping-zone-area-picker.comprehensive.spec.ts` serves the zone and the geo lists from fixtures with `page.route` (`/v1/admin/shipping-zones/:id`, `.../areas`, `/v1/admin/geo/states`, `/v1/admin/geo/states/*/lgas`). It passes, but it never talks to the real API, so it cannot catch a drift in what the admin routes return (for example the `isActive` flag added by TTW-199).

A grep of `tests/e2e` (current `main`) shows more `route(...)` calls. **Candidates to classify, not confirmed violations:**

- `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` — site-settings API (3 places).
- `tests/e2e/journeys/refund-lifecycle.smoke.spec.ts` — `**/admin/orders/*/refund`.
- `tests/e2e/journeys/inventory-lifecycle.smoke.spec.ts` — `**/v1/products/*/availability`, `**/admin/inventory/*`.
- `tests/e2e/journeys/reconciliation.smoke.spec.ts` — `**/admin/reconciliation/findings**`.
- `tests/e2e/journeys/payment-initiation.smoke.spec.ts` and `tests/e2e/app/checkout-*.spec.ts` — `**/v1/orders/*/initiate-payment` (likely a provider simulation, to confirm) and `https://checkout.paystack.test/**` (external provider, allowed).

The rule targets _core acceptance journeys_ and allows provider simulators. A route that forces a rare error state can be acceptable if the real API cannot produce it; that has to be decided per case.

## Proposal

- Audit every `route(...)` in `tests/e2e` and classify each: external provider simulator (keep), first-party mock that can run against the real API (replace), first-party mock needed to force a state the real API cannot produce (keep, with a comment naming why, and a real-API test for the happy path).
- Start with the TTW-201 spec: run it against the real API with seeded data. It needs a deactivated state and a deactivated LGA, and a zone created through the real admin routes. No admin route deactivates a state, so the data must come from the e2e seed (`apps/api/scripts/seed-e2e-dummy-data.ts`) or a Prisma fixture. Use per-worker names so parallel tests do not collide, and clean up what the test creates.
- Replace the other first-party mocks the audit marks "replace", one spec at a time.
- Record the classification in the design review so the remaining mocks are justified in writing.

## Invariants

- Provider simulators (Paystack) stay deterministic and stay stubbed.
- No test is deleted, skipped or weakened to get green. A replaced test keeps its assertions.
- No shared seed row that other tests count or list is changed (the deactivated test state must not appear in the public lists other tests assert on).

## Implementation plan

1. Start `codex/ttw-209-replace-first-party-api-mocks-in-playwright` from current `main`, in its own worktree. Move this file into it and add the ticket rows to `docs/tickets/README.md` and `docs/tickets/ROADMAP.md`.
2. Audit and classify the mocks. Update this ticket if the list moved.
3. Record the design review below (Standard) before implementing.
4. Convert the TTW-201 spec first. Show it failing for the right reason if the picker or the API regresses (for example, make the API return no `isActive` locally), then green.
5. Convert the other "replace" specs in small, separately reviewable steps. Record any deviation here.
6. Run the gates (`pnpm playwright:validate`, `pnpm docs:validate`, typecheck, lint, the converted specs on a dedicated port set), record exact results, and obtain the independent review.

## Test and observability plan

- Playwright: each converted spec runs against the real API and real Postgres, with role-specific auth state.
- Run twice in a row and with parallel workers to prove the data is isolated and cleaned up.
- Logs, metrics, traces, and alerts: nothing new.

## References

- `.cursor/rules/playwright-regression.mdc` — the rule.
- `docs/16-playwright-regression-strategy.md` — browser-test source of truth.
- `tests/e2e/admin/shipping-zone-area-picker.comprehensive.spec.ts` — first case.
- `tests/e2e/fixtures/api.ts`, `tests/e2e/fixtures/paystack-simulator.ts` — API helper and provider simulator.
- `docs/tickets/ttw-201-mark-deactivated-states-in-the-zone-area-picker.md` — origin.

## Acceptance criteria

- [ ] Every `route(...)` in `tests/e2e` is classified in the design review.
- [ ] The TTW-201 picker spec runs against the real API with seeded data and still fails if the picker or the API contract regresses.
- [ ] Other first-party mocks classified "replace" are replaced; the rest carry a comment justifying them.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- The `seed:e2e` script failing on leftover fixture data in a reused test database (foreign key on `inventory_movements`): separate ticket if it blocks this work.
- Changing the Paystack simulator.
- Visual and accessibility suites.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
