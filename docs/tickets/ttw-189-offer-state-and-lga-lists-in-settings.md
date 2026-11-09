# TTW-189 — Offer the state and LGA lists in the customer settings address form

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
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

1. Start `codex/ttw-189-offer-state-and-lga-lists-in-settings` from current `main` after TTW-087 is merged, in its own worktree.
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

- [ ] A customer cannot type a misspelled state in the settings address form.
- [ ] An address saved in settings carries a state code, and an LGA when one is chosen.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Clearing a saved LGA (an empty `lgaId` is ignored by the API, so the saved LGA is kept): needs a server rule, close to TTW-186.
- Refusing a deactivated state on the server (`resolveState` ignores `isActive`).
- Moving the two checkouts to theme tokens.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
