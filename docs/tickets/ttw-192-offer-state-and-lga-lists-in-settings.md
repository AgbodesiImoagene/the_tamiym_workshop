# TTW-192 — Offer the state and LGA lists in the customer settings address form

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Standard\
**Blocked by:** TTW-087\
**Blocks:** None

## Background

Found by the independent review of TTW-087 (finding 10). TTW-087 replaced the free-text State field with a state list and a dependent LGA list in the two checkouts, and made the API refuse a Nigerian address with an unknown state (400 `ADDRESS_STATE_UNKNOWN`).

The customer settings page still has the old behaviour: `apps/app/components/customer-settings-form.tsx` (shipping address section) keeps a free-text `Select State/City` input with the placeholder "Enter state". A customer who types a misspelled state there now gets the 400 from the API, with a message that tells them to choose from a list that this screen does not show.

## Proposal

- In the settings address form, replace the State input with the state list and add the dependent LGA list, as in the standard checkout. Reuse `getGeoStates`, `getGeoLgas` (`apps/app/lib/geo.ts`) and the same matching of a saved state text to the list.
- Keep Zod and React Hook Form, which this form already uses.
- Send `state`, `stateCode` and `lgaId` like the checkout.
- A saved address whose state is not in the list shows "Choose a state from the list." and blocks Save until corrected.
- Decide whether the matching code is shared with the checkout page (it is written inline there and as pure helpers in `apps/web/lib/geo.ts`) rather than written a third time.
- Decision to settle in the design review: the settings page has a Country field that is also free text. Keep it as is, or limit this form to Nigeria like the checkouts.

## Invariants

- A saved address always carries a state known to the shipping rules (TTW-087).
- Existing saved addresses still load in this form, and ask for a correction if their state is unknown.
- No second place keeps a free-text Nigerian state.

## Implementation plan

1. Start `codex/ttw-192-offer-state-and-lga-lists-in-settings` from current `main` after TTW-087 is merged, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Component: list loading, empty, error and retry states; changing the state clears the LGA; an unknown saved state blocks Save; the request carries `state`, `stateCode` and `lgaId`.
- Playwright: update `tests/e2e/app/settings.comprehensive.spec.ts` (it checks that the shipping form is exposed) to choose a state and an LGA and save, on desktop and mobile viewports.
- Logs, metrics, traces, and alerts: nothing new. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/app/components/customer-settings-form.tsx:369` — free-text state input.
- `apps/app/app/dashboard/checkout/page.tsx` — the state and LGA lists to follow.
- `apps/app/lib/geo.ts` — list client.
- `docs/tickets/ttw-087-offer-states-and-lgas-at-checkout.md` — review findings and deviations.
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.

## Acceptance criteria

- [x] A customer cannot type a misspelled state in the settings address form.
- [x] An address saved in settings carries a state code, and an LGA when one is chosen.
- [x] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Clearing a saved LGA (an empty `lgaId` is ignored by the API, so the saved LGA is kept): needs a server rule, close to TTW-186.
- Refusing a deactivated state on the server (`resolveState` ignores `isActive`).
- Moving the two checkouts to theme tokens.

## Design review

**Finding confirmed** on the TTW-087 branch (79b3a0d): `customer-settings-form.tsx` still has a free-text `state` input (placeholder "Enter state") and sends only `state`. The ticket says the form "already uses Zod"; it does not (only React Hook Form, no schema). This design adds the Zod schema.

**Design.**

1. Add a pure helper `matchSavedState(states, { state, stateCode })` to `apps/app/lib/geo.ts` (match by code, else by name, case-insensitive). The settings form uses it. The checkout page keeps its inline copy: touching a TTW-087 file for a refactor is outside this ticket; the duplication (now two copies in `apps/app`, one in `apps/web`) is recorded as a follow-up.
2. Settings address form: React Hook Form with a Zod schema (`zodResolver`; `@hookform/resolvers` and `zod` are already dependencies of `apps/app`). Fields: `country`, `state`, `stateCode`, `lgaId`, `city`, `addressLine1`. The schema requires a non-empty `stateCode`; the message is "Choose a state from the list.".
3. The State control is a native `<select>` (same as the checkout, labelled "State") fed by `getGeoStates` (react-query, 5-minute `staleTime`), followed by a dependent LGA `<select>` (optional) fed by `getGeoLgas`. Loading, error and "Try again" states as in the checkout. Choosing another state clears the LGA.
4. A saved address is loaded into the form; its state is matched to the list (by code, else by name). If it matches nothing, the form keeps `stateCode` empty, shows "Choose a state from the list." and Save is blocked by validation until a state is chosen. A saved `lgaId` is kept only when it belongs to the matched state's list.
5. Request: `state` (list name), `stateCode`, and `lgaId` when chosen.

**Decision on Country.** Keep the Country text field as it is, like the two checkouts (the API enforces the state list only for Nigeria). A customer with a non-Nigerian address therefore also has to pick a Nigerian state in this form: same limitation as the checkouts, accepted and recorded; a country list would be its own ticket and needs a business decision on which countries are shipped to.

**Risks.** Settings and profile pages share this component (`/dashboard/settings`, `/dashboard/profile`): both are covered by the Playwright spec. The form would otherwise let the API answer 400 `ADDRESS_STATE_UNKNOWN`. Security: no new route, no new input sent to the server.

## Implementation reviews

One independent review (fresh subagent, read-only) of the first TTW-192 commit (before the review fixes). No serious defect; 2 medium and 4 minor findings.

- Fixed (M1): a saved `lgaId` outside the list of its state was still sent. Now `lgaId` is sent only when the LGA list loaded and contains it. Tests added (wrong-state LGA; LGA list failed to load), seen failing first.
- Fixed (M2): the form reset when the state list arrived after the address, wiping what the customer had typed. Now the address fills the form once, and the state is matched in a separate step that sets only the state fields and never overrides a chosen state. Test added, seen failing first.
- Fixed (m1): the "blocks Save" test could pass without waiting for the asynchronous validation; it now lets it finish before asserting.
- Fixed (m2): the Playwright test now waits until the saved address is rendered before typing.
- Not applied: (m3) no component test for `/dashboard/profile` (covered by Playwright) or for a saved `stateCode` absent from the list while its name matches (the code wins, so the customer is asked to choose); (m4) when the states never load, "Choose a state from the list." appears only after clicking Save, while the load error and "Try again" stay visible.
- Known limit, unchanged: if the saved address already holds an inconsistent LGA, the form no longer sends it but the server keeps the saved one (an empty `lgaId` is ignored; see Out of scope).

## Verification evidence

Run in the worktree `ttw-189-offer-state-and-lga-lists-in-settings-d1139d`, on the code that is committed.

- Tests first, seen failing: `apps/app/__tests__/settings/customer-settings-form.test.tsx`, 8 tests, all 8 failed before the change (the State field was a text input and the form never called `getGeoStates`/`getGeoLgas`). After the change: 8 passed.
- `cd apps/app && npx jest`: 8 suites, 63 tests passed (52 before + 11 new).
- `cd apps/app && npx tsc --noEmit`: exit 0. `npx eslint .`: no output (0 errors, 0 warnings; a `watch()` React Compiler warning was removed by using `useWatch`).
- `npx prettier --check` on `apps/app/**/*.{ts,tsx}`, `tests/e2e/app` and this ticket: all files formatted.
- `pnpm playwright:validate`, `pnpm docs:validate`: passed.
- Playwright (production build, dedicated database `tamiym_workshop_e2e_189`, `--workers=2`): `settings.comprehensive.spec.ts` on desktop-1440, tablet-834 and mobile-393 (9 tests, including the new "shipping address is saved with a state code and an LGA chosen from the lists") plus `checkout-idempotency.spec.ts` (same customer address): 13 passed.
- Journey played: choose Ogun (LGA list shows Abeokuta North), switch to Lagos (LGA cleared), choose Ikeja, Save. The request carries `state: Lagos`, `stateCode: LA`, `lgaId`, and the API response returns the same.

After the review fixes: 3 more tests written first and seen failing (3 failed, 8 passed), then 11 passed in the settings suite. Playwright rebuilt and rerun: settings spec on desktop, tablet and mobile plus `checkout-idempotency`: 13 passed.

**Renumbering and rebase.** The ticket was TTW-189 until the number clashed with another branch (payment captures); it is now TTW-192 (file, ROADMAP and README rows, code comments, tests). TTW-087 was then merged locally into `main` (a84663c, not pushed) and this commit rebased on it. Rerun on the rebased code, with a fresh `pnpm build`:

- `pnpm docs:validate`: passed. `pnpm --filter app test`: 8 suites, 63 tests passed. `pnpm --filter app typecheck`: exit 0.
- `pnpm lint`: 6 tasks successful, 0 errors (existing warnings only: admin 21, api 14). `pnpm format:check`: all files formatted.
- Playwright `settings.comprehensive.spec.ts`, `--project=setup --project=chromium-app --workers=2`: 12 passed (4 tests x desktop-1440, tablet-834, mobile-393 plus 3 setup).

Not verified: the new Playwright test was not seen failing on the old form (the old form has no State list, so `selectOption` could not have worked; the unit tests are the failing-first proof). Root-level `pnpm lint`, `pnpm typecheck`, `pnpm test` for api and web were not rerun: only `apps/app` and the e2e spec changed. The saved-unknown-state case is covered by the unit test only (the real API now refuses to store such a state, so Playwright cannot create one). Firefox and WebKit projects. A visual check of the new selects (they use the form's input tokens).

## Completion summary

**What changed.** In the settings address form (also used by `/dashboard/profile`), the State text field is now a state list followed by a dependent LGA list (optional), with loading, error and "Try again" states; choosing another state clears the LGA. The form uses a Zod schema through `zodResolver`: without a state code it cannot be saved. A saved address is matched to the list by code, else by name (`matchSavedState`, new in `apps/app/lib/geo.ts`); if it matches nothing the form shows "Choose a state from the list." and Save is blocked until a state is chosen. Save sends `state`, `stateCode` and `lgaId` (when chosen).

**Deviations from the plan.**

- The ticket said the form "already uses Zod": it did not. The schema was added.
- The checkout page keeps its inline matching; it was not refactored to use `matchSavedState` (a TTW-087 file, out of this ticket). The matching now exists twice in `apps/app` and once in `apps/web`.
- Country stays a free-text field, like the checkouts. A customer with a non-Nigerian address must still pick a Nigerian state here (same limit as the checkouts).
- A saved `lgaId` is kept only when the address's state is matched; the LGA select shows it only when it is in the loaded list (this also covers TTW-087 follow-up 3 for this form).
- The Playwright save test reads the save response and does not reload the page, because the customer address is shared with `checkout-idempotency.spec.ts`.

**Remaining.**

- Rebase this commit on `main` once TTW-087 is merged (this branch was cut from the unmerged `codex/ttw-087-offer-states-and-lgas-at-checkout`).
- Independent review not yet run.
- Out of scope, unchanged: clearing a saved LGA, refusing a deactivated state on the server, moving the checkouts to theme tokens, a country list, and sharing the state-matching code between the two apps and the web helper.
- Not pushed, no PR, not merged.
