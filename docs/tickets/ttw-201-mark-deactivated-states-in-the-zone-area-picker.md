# TTW-201 — Mark deactivated states in the zone-area picker

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Low\
**Blocked by:** None (TTW-199 and TTW-200 are merged in `main`)\
**Blocks:** None

## Background

Found by the review of TTW-199. After TTW-199, `GET /v1/admin/geo/states` and `GET /v1/admin/geo/states/:code/lgas` also return deactivated rows, each with `isActive`. The only consumer is the zone detail page (`apps/admin/app/admin/shipping/zones/[id]/page.tsx`, through `apps/admin/lib/shipping.ts`). Its State and LGA selects are used to add an area to a shipping zone.

The console types `GeoState` and `GeoLga` have no `isActive`, so the selects now show deactivated states and LGAs with no mark. TTW-200 now makes the API refuse them when an area is created, so the picker must stop offering what the server will refuse.

## Proposal

- Add `isActive: boolean` to `GeoState` and `GeoLga` in `apps/admin/lib/shipping.ts`.
- In the picker, label a deactivated entry (for example "Lagos (deactivated)") and keep it unselectable for a new area.
- Do not add a reactivation flow or a new screen.

## Invariants

- The picker never lets an admin choose a deactivated state or LGA for a new area.
- The admin lists keep returning deactivated rows (TTW-199).

## Implementation plan

1. Start `codex/ttw-201-mark-deactivated-states-in-the-zone-area-picker` from current `main`.
2. Confirm the picker code and the types against `main`.
3. Write the console tests first (component test for the labelled, disabled option) and show them failing.
4. Implement, run typecheck, lint, tests and the admin e2e, and record the results below.
5. Obtain the independent review.

## Test and observability plan

- The admin app has no unit-test setup (see `CLAUDE.md`). Cover the labelled, disabled option with a Playwright admin test (`tests/e2e/admin/`, update `docs/playwright/prd-test-manifest.json` if required) and play the journey in a browser. Record in the design review if another form of test is chosen.
- Logs, metrics, traces, and alerts: nothing new.

## References

- `apps/admin/app/admin/shipping/zones/[id]/page.tsx` — the picker.
- `apps/admin/lib/shipping.ts` — console types and API calls.
- `docs/tickets/ttw-199-show-deactivated-states-in-admin-shipping.md` — origin.
- `docs/tickets/ttw-200-refuse-deactivated-state-in-shipping-rules.md` — server-side refusal.

## Acceptance criteria

- [x] A deactivated state or LGA is labelled in the picker and cannot be chosen.
- [x] Active entries behave as before.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Refusing a deactivated state on the server → TTW-200.
- A reactivation flow for states.

## Design review

Reviewed before implementation (2026-11-12, by the implementing session, against `main` at `3558f81`).

**Finding confirmed on current code.** `GeoState` and `GeoLga` in `apps/admin/lib/shipping.ts` have no `isActive`. The two selects in `apps/admin/app/admin/shipping/zones/[id]/page.tsx` ("Add coverage area" card) render every row returned by the API as a plain `SelectItem`, so since TTW-199 a deactivated state or LGA looks like any other and is selectable. TTW-200 makes the server refuse it, so the admin would only learn of it from an error after clicking "Add coverage area".

**Design.**

- Add `isActive: boolean` to both types (the API already sends it since TTW-199; no API change).
- In each `SelectItem`, use the Radix `disabled` prop and append the suffix ` (deactivated)` to the label when `isActive` is false. Radix then sets `aria-disabled` and ignores clicks and keyboard selection, so the invariant holds without extra state.
- A disabled item cannot become the selected value, so `stateCode` / `lgaId` can never hold a deactivated entry and the existing "Add coverage area" button logic is unchanged. A deactivated state is not selectable, so its LGAs are never loaded by this screen.
- No new colour: the disabled style comes from the existing shared `SelectItem` (theme tokens). No new screen, no reactivation flow.

**Risks.** Low: one admin page, two types, no API or schema change. Regression risk is limited to active entries, covered by the same tests (active options stay enabled and keep their plain name).

**Tests (written first).** The admin app has no unit-test runner, so the acceptance is a Playwright admin spec, `tests/e2e/admin/shipping-zone-area-picker.comprehensive.spec.ts`. It serves the zone and geo lists from fixtures (no dependency on seed data) and checks: the deactivated state / LGA is labelled and `aria-disabled`; clicking it leaves the picker empty; no area request is sent; active entries keep their plain name and stay enabled. The `prd-test-manifest.json` only needs an entry if `pnpm playwright:validate` asks for one.

**Verdict.** Design accepted, no open question for the client.

## Implementation reviews

Independent review (`/code-review`, high effort, 2026-11-12): no correctness finding. Two low findings, both left as they are:

- The `(deactivated)` label is built twice (state and LGA selects). Two short lines; a helper would add more code than it saves.
- The spec uses mocked geo data, so it cannot catch the API dropping `isActive`. That contract is covered by the TTW-199 API tests.

Verdict: PASS.

## Verification evidence

- Red first: with the old build, `pnpm exec playwright test tests/e2e/admin/shipping-zone-area-picker.comprehensive.spec.ts --project=chromium-admin` → 2 failed (`getByRole('option', { name: 'Lagos (deactivated)' })` and `'Wuse (deactivated)'` not found).
- Green after the change: same command, own API on :3011 and admin build on :3013 (the main checkout's servers on :3001/:3003 were left alone) → setup 3 passed, 2 passed.
- Visual check: screenshot of the open State select shows "Lagos (deactivated)" greyed by the shared `SelectItem` disabled style (theme tokens, no hard-coded colour).
- `pnpm typecheck` → 6 successful. `pnpm lint` → 6 successful. `pnpm test` → all suites ran, 4 successful (api 194 s).
- `pnpm playwright:validate` → passed (no manifest entry needed). `pnpm docs:validate` → passed. `prettier --check` on changed files → clean after `--write` on the two index tables (realigned because the new row is longer).

## Completion summary

`GeoState` and `GeoLga` now carry `isActive`. In the zone detail page, a deactivated state or LGA is shown as "Name (deactivated)" and is disabled, so it can never be chosen for a new area. Active entries are unchanged. No API change, no new screen, no reactivation flow.

Deviations from the plan: the plan said "component test"; the admin app has no unit-test runner, so the acceptance is a Playwright admin spec. To test without clashing with the main checkout's servers, ran own servers on other ports (config via `PLAYWRIGHT_*` env vars, no repo change).

Noticed, not fixed (out of scope): the README and ROADMAP rows for TTW-200 still say "Scoped" / `[ ]` although it is merged.
