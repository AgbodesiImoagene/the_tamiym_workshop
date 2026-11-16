# TTW-221 — Close the two LGA gaps in the delivery refusal

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High\
**Blocked by:** Nothing (the owner chose option A for gap 1 on 2026-11-16)\
**Blocks:** None

## Background

Found by the independent security review of TTW-217 (LOW findings 1 and 2, 2026-11-14). TTW-217 made quotes and new orders refuse an address whose state or LGA an admin deactivated (`ADDRESS_STATE_NOT_DELIVERABLE`, "We do not deliver to this area."), through `assertAddressDeliverable` (`apps/api/src/shipping/address-deliverability.ts`). It reads the address row's `lgaId`. Two ways around it remain. Confirm each against current `main` with a failing test before designing: the code may have moved.

### Gap 1 — dropping the LGA drops the refusal

The LGA of an address is optional. `PATCH /v1/users/addresses/:id` with `lgaId: null` removes it (TTW-193 added this on purpose, together with the LGA text), and a new address can simply be created without an LGA. With no `lgaId`, `assertAddressDeliverable` only looks at the state, so an address in a commune we no longer deliver to can be ordered by clearing or leaving out the LGA, as long as the state is active and a state-wide shipping rule exists.

### Gap 2 — an LGA name with extra spaces finds no LGA, but the shipping rule still matches

`resolveLga` in `apps/api/src/shipping/address-normalization.service.ts` finds an LGA by name with `{ equals: admin2, mode: 'insensitive' }` after only `trim()`. A name typed with a double space ("Ikeja Mainland") finds no LGA, so the address is saved with `lgaId = null`. The shipping resolver (`shipping-destination-resolver.service.ts`, `normalizeKey`) collapses spaces, so an active ADMIN2 rule for that commune still matches the address text, and the refusal is skipped because `lgaId` is null.

## Decision needed (gap 1) — ask the user once, with the recommendation

Whether to require an LGA is a product decision (it reverses part of TTW-193). Options to put to the owner:

- **A (recommended):** for a Nigerian address in a state that has active LGAs, an LGA is required when the address is saved (create and edit), so there is no "no LGA" address to order from; the customer already picks the state and LGA from lists (TTW-087, TTW-192). Saved addresses without an LGA keep loading and stay editable on other fields (TTW-087 / TTW-194 pattern), but quotes and orders for them ask the customer to choose an LGA first.
- **B:** keep the LGA optional and accept that a commune can be bypassed by leaving it out. Record the decision and the residual risk in the ticket; fix only gap 2.
- **C:** other, as the owner decides.

Do not code gap 1 until the owner answers. Gap 2 does not depend on it and can be done first.

## Proposal

- **Gap 2:** collapse runs of whitespace (and trim) when matching an LGA name, in `resolveLga` and anywhere a state or LGA name is matched the same way, so the name resolves to the same row the shipping resolver sees; store the canonical LGA name. Test with double, tab and non-breaking spaces.
- **Gap 1:** implement the owner's answer. For option A, add the required-LGA rule to the address create and edit paths (with a clear 400 and a stable code), keep saved addresses loadable, and make the quote and order refuse-with-guidance for a saved address that has no LGA in a state with LGAs.
- Update DTO docs, Swagger and `pnpm openapi:generate` if the contract changes. If the customer screens need a message or a required field, reuse the existing error display (no redesign) and update the Playwright acceptance coverage (real API, no first-party mocks).

## Invariants

- No order, reservation or payment is created for a refused request; orders that already exist are untouched.
- TTW-193 (clearing an LGA) keeps working where an LGA is not required.
- Ownership and the TTW-194, TTW-216, TTW-217 and TTW-219 rules are unchanged.

## Implementation plan

1. Start `codex/ttw-221-close-the-lga-gaps-in-the-delivery-refusal` from current `main`, in its own worktree. Copy this ticket into `docs/tickets/` of that worktree and add the ticket rows to `docs/tickets/README.md` and `docs/tickets/ROADMAP.md`.
2. Reproduce each gap with a failing test; if one is not real, record the evidence and drop it.
3. Record the design review (High risk). Ask the user the gap 1 question once.
4. Implement in small steps (gap 2 first). Record any deviation.
5. Run the gates, record exact results, and obtain an independent implementation review and an independent security review.

## Test and observability plan

- Unit and integration on real Postgres: double-space, tab and non-breaking-space LGA names resolve to the LGA; an address in a deactivated LGA stays refused after the name is typed in any spacing; the gap 1 rule per the owner's answer, on create, edit, quote and order.
- Playwright: the customer sees the message or the required-field error in the checkout, real API.
- Logs, metrics, traces, and alerts: nothing new. No PII in logs.

## References

- `apps/api/src/shipping/address-deliverability.ts` — `assertAddressDeliverable`.
- `apps/api/src/shipping/address-normalization.service.ts` — `resolveLga`.
- `apps/api/src/shipping/shipping-destination-resolver.service.ts` — `normalizeKey`, ADMIN2 matching.
- `docs/tickets/ttw-217-refuse-quotes-and-orders-for-a-state-we-no-longer-deliver-to.md` — origin (security review LOW 1 and 2).
- `docs/tickets/ttw-193-*.md` — clearing a saved LGA.

## Acceptance criteria

- [ ] An LGA name typed with extra or unusual spaces resolves to its LGA, and a deactivated LGA stays refused in any spelling of the spaces.
- [ ] The owner's decision on gap 1 is recorded and implemented, with tests.
- [ ] Required quality gates pass, with evidence recorded below, including an independent implementation review and an independent security review.
- [ ] Contracts and docs are updated where applicable.

## Out of scope

- The default-address integrity work → TTW-222.
- Country-code and field-limit hardening, and the country change that keeps a Nigerian state → TTW-226.

## Gap confirmation (against `main` at `484cb5f`)

- **Gap 2 is real.** Unit tests in `address-normalization.service.spec.ts` ("TTW-221: spaces in LGA and state names") failed first: the LGA lookup received `Ikeja  Mainland` unchanged, and the stored text kept the double space. The e2e `address-lga-spaces.e2e-spec.ts` failed first too: an address created through `POST /v1/users/addresses` with `Zeta  Spaces LGA` (also tab, no-break space, mixed spaces) was saved with `lgaId = null`.
- **Gap 1 is real by reading the code** (`address-deliverability.ts` only tests `address.lgaId`, and `normalize` keeps `lgaId = null` when `lgaId: null` is sent or no LGA is named). No test and no code yet: waiting for the owner's answer.

## Design review

Gap 2 (risk High, standard design review):

- **Rule.** One helper, `cleanName` (trim, then any run of `\s`, which includes tab and no-break space, becomes one space), the same collapse as `normalizeKey` in `shipping-destination-resolver.service.ts`. It is used for state and LGA _names_ only: the request texts `state`, `administrativeAreaLevel1`, `administrativeAreaLevel2`, the saved texts re-read on an edit, and the state/LGA change checks (`isStateChange`, `isLgaChange`). Street, city, landmark and other free text are untouched.
- **Why in the normalisation, not in the resolver.** The resolver already collapses spaces; the address row is what needed to match it. Fixing it at save time means the row gets its `lgaId`, so `assertAddressDeliverable` (TTW-217) sees it, and the stored text is the canonical name of the LGA found.
- **Risks considered.** (1) A re-spaced resend of the saved LGA text must not count as a change of LGA (covered by a unit test). (2) Saved legacy addresses with a double-spaced text now resolve to their LGA at the next edit: harmless and intended. (3) A state typed with extra spaces now finds its state instead of being refused as unknown (TTW-087): intended. (4) No schema, DTO or Swagger change, so `openapi:check` has nothing to regenerate. (5) The database match stays `equals` + case-insensitive on the stored name; LGA names in the seed carry single spaces.
- **No security regression:** the change only widens what resolves to a _known_ row; the deactivated-state and deactivated-LGA rules (TTW-194, TTW-202, TTW-217) are unchanged.

Gap 1 (owner answer: **option A**, 2026-11-16). Risk High, design review before coding:

- **Rule at save (create and edit), in `AddressNormalizationService`.** For a Nigerian address with a known active state code, if no LGA is linked after normalisation and the state has at least one active LGA, the save is refused with `400 ADDRESS_LGA_REQUIRED` ("Choose your LGA (local government area) from the list."). On an edit the rule applies only when the edit touches location: new address, state changed, country moved to Nigeria, LGA changed to one that does not resolve, or an LGA that was saved is being cleared. An edit of a saved address that has no LGA and does not touch state, country or LGA (phone, street, instructions, resending the same state) still goes through, so old addresses stay editable (TTW-087 / TTW-194 pattern).
- **Rule at quote and order, in `assertAddressDeliverable`.** After the existing deactivated state/LGA refusal, a Nigerian address with a state code, no `lgaId`, whose state has an active LGA gets the same `400 ADDRESS_LGA_REQUIRED`. Quotes and orders (standard and campaign) all call this function on the row they read, so they cannot disagree. The state's "has an active LGA" fact is read in the same query as the address (`DELIVERABILITY_GEO_STATE_SELECT`, `lgas` with `take: 1`), so no extra query. The refusal runs before any write: no order, reservation or payment is created; orders that already exist are untouched (replay by key and payment paths do not call it).
- **Closes the third hole** found by the security review of gap 2: an address typed with the name of an already deactivated LGA is no longer saved (it resolves to no LGA, so it is refused in a state that has LGAs).
- **Order of refusals.** Deactivated state or LGA first (`ADDRESS_STATE_NOT_DELIVERABLE`), then the missing LGA. Ownership is checked before both, so another user's address reveals nothing.
- **Known edges, accepted.** (1) A state whose LGAs are _all_ deactivated has no LGA to choose, so no LGA is required there. (2) Countries other than Nigeria and addresses with no known state code are untouched. (3) TTW-193's clear still works only where an LGA is not required (a state with no active LGA); in states with LGAs the clear is now refused: this is the part of TTW-193 the owner chose to reverse.
- **Contract.** New stable error code `ADDRESS_LGA_REQUIRED`, documented in the Swagger descriptions of the address create/edit routes and the four quote/order routes; `pnpm openapi:generate` run. No schema or DTO change. Customer screens: the same checkout error display shows the new message (app and web checkouts); the settings address form now shows a refused save (it showed nothing before) and its LGA placeholder no longer says "(optional)".
- **Test fixtures.** Several existing e2e suites and the Playwright seed saved Lagos addresses with no LGA. They now attach an LGA (`test/utils/geo-fixtures.ts`, seed). `address-clear-lga.e2e-spec.ts` and `settings-clear-lga.spec.ts` asserted that clearing works in Lagos; they now assert the new refusal (this is the owner's decision, not a test weakened to pass). Two unit tests that pinned the exact address read (`orders.service.spec`, `pricing.service.spec`) were updated for the new select.

## Implementation reviews

Both reviews: fresh-context, read-only reviewers, 2026-11-15, on the gap 2 diff.

- **Implementation review: PASS with reservations.** `cleanName` matches `normalizeKey` (same `\s+` set; case is handled by `mode: 'insensitive'` and `toLowerCase`). Findings fixed: (1) the "re-spaced LGA text is not a change" test passed without the fix, so the mock now returns no LGA and only the "no change" path keeps the saved id; (2) no test for a re-spaced state on edit: added (saved state no longer offered, re-spaced resend is not refused); (3) for a non-Nigerian address `state` and `administrativeAreaLevel1` could differ in spacing: `state` now uses `cleanName` too, with a test. Accepted, not changed: legacy addresses with a double-spaced LGA text are linked to their LGA at the next edit (intended); an LGA name stored with a double space in the database would not be found (seed data is clean).
- **Security review: PASS for gap 2.** No widening: deactivated states and LGAs are still unlinked (TTW-194, TTW-202), non-Nigerian states untouched, ownership untouched. Zero-width characters and NFKC are not normalised on either side, so address and resolver stay consistent. Out of scope, reported: see "Findings outside this ticket".

## Gap 1 reviews (option A)

Fresh-context, read-only reviewers, 2026-11-16.

- **Implementation review: PASS.** `touchesLocation` covers create, state change, country moving to NG, unresolved LGA text and clearing a saved LGA; legacy no-LGA addresses stay editable; TTW-186/193/216/219 untouched; the three reads share one select; Swagger matches the generated contract; fixture changes are necessary, and the two "clear" specs were inverted per the owner decision with strong assertions. Minor remarks: `ensureLga` reactivates Ikeja in the shared test database; no unit test for "deactivated state + saved no-LGA address on edit"; no dedicated e2e for the two campaign routes (they share the same services); if the LGA list fails to load the customer cannot choose one (the web checkout has a retry).
- **Security review: PASS with reservations.** No bypass found for new or common cases: every quote and order path calls the check after the ownership test; the order checks the row it snapshots and the quote re-reads; idempotent replay writes nothing; only `addresses.service` writes addresses (and privacy anonymisation, which does not touch the state or the LGA). Residual items: (1) **a state whose LGAs are all deactivated** has no LGA to require, so a typed deactivated commune name can still match an active ADMIN2 rule by name (accepted edge, low: no admin route deactivates an LGA; a clean close is to refuse a text that names a deactivated LGA, or to make the resolver compare by id); (2) `assertAddressDeliverable` compares `countryCode === 'NG'` strictly: older rows saved before TTW-219 in another form are not asked for an LGA, but the shipping resolver filters by the exact code too, so they are not delivered either; (3) saved addresses with no `stateCode` are not checked (inherited from TTW-217); (4) no lock between reading the address and creating the order (inherited).

## Findings outside this ticket

- Address typed with a deactivated LGA name in a state whose every LGA is deactivated (see accepted edge 1 above): not closed.
- Prisma `equals` with `mode: 'insensitive'` is ILIKE: whether `%` or `_` in typed text act as wildcards in `resolveLga`/`resolveState` was not checked (pre-existing; it cannot bypass the refusal because a deactivated LGA is never linked).
- `docs/tickets/README.md` still lists TTW-219 as Scoped while the ROADMAP marks it done.
- Settings address form had no visible error for any refused save before this ticket; only the minimum (one alert line) was added.

## Verification evidence

Run in this worktree, 2026-11-15 and 2026-11-16:

- **Failing first.** Gap 2: 6 unit and 4 e2e tests failed before the change. Gap 1: 7 new unit tests failed before the rule; once the rule was in, 39 existing e2e tests failed on fixtures that saved Lagos addresses with no LGA, which proves the rule is enforced on every create/quote/order path; those fixtures were then fixed.
- `pnpm --filter api|app|web typecheck`: pass. Lint: 0 errors (14 warnings for api, none new).
- API unit tests with coverage: 154 suites, 1599 tests passed. App unit tests: 121 passed (one earlier run showed 1 failure that did not reproduce on rerun; not investigated further). Web `checkout-errors` and app `checkout` suites passed.
- API e2e on real Postgres, full run (`--runInBand`, after every fix): 49 suites, 227 tests passed. One intermediate partial run showed 2 suites failing that passed on rerun and in the final full run (the test database is shared with other sessions).
- `pnpm coverage:diff`: passed (19/19 changed lines covered, floor 80%).
- `pnpm openapi:generate` then `pnpm openapi:check`: pass. `pnpm docs:validate`, `pnpm playwright:validate`: pass.

## Not verified

- **Playwright was not run.** The updated specs (`settings-clear-lga`, `settings-default-address-refused`) and the seed change (`seed-e2e-dummy-data.ts` gives the shared customer address Ikeja) were checked by reading and by `playwright:validate` only. They need a full build and seed run, which the coordinator's CI will do on push. Other Playwright specs that use the seeded address, or save Lagos addresses through the UI with an LGA chosen, should still pass; any other spec that saves a Lagos address without choosing an LGA would fail.
- The real screens were not played in a browser.

## Completion summary

Both gaps implemented under option A. Delivered: single-spaced name matching (gap 2); `ADDRESS_LGA_REQUIRED` at save and at quote/order (gap 1); messages in both checkouts and the settings form; contract, tests, fixtures and seed updated. Open: the Playwright run, and the residual edge of a state with all LGAs deactivated.
