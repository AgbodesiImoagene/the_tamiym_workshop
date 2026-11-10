# TTW-193 — Let a customer clear the LGA saved on an address

**Epic:** 8 — Client review delivery\
**Status:** Implemented (local commit, not pushed)\
**Risk:** High\
**Blocked by:** TTW-186 (same code and the same "LGA changed" rule)\
**Blocks:** None

## Background

Found by the independent review of TTW-087 (finding 1) and repeated in the review of TTW-192. TTW-087 and TTW-192 put an optional LGA list in the checkouts and in the settings form.

A customer with a saved Lagos/Ikeja address who picks the empty option "Select an LGA (optional)" cannot remove the LGA. The forms leave `lgaId` out of the request when it is empty, and `AddressNormalizationService` (`apps/api/src/shipping/address-normalization.service.ts`) keeps the saved `lgaId` when the state is unchanged (`keepSavedLga`). The form then shows no LGA, but the address still carries Ikeja, and an LGA-level shipping rule still prices it.

An address can also carry an LGA that is no longer in the list (deactivated): the settings form no longer sends it, but the server keeps it.

## Proposal

- Make "no LGA" an explicit request. The API accepts `lgaId: null` on update as "clear the LGA": `lgaId` and `administrativeAreaLevel2` become `null`. An absent `lgaId` keeps its meaning (leave it as saved). Confirm in the design review that `null` passes the DTO (`@IsOptional()` lets `null` through) and is documented in Swagger.
- The two checkouts and the settings form send `lgaId: null` when the customer empties the LGA select on an address that had one.
- Coordinate with TTW-186, which defines when an edit "changes the LGA" in the same method. Implement after it, or in the same change if the owner prefers.

## Invariants

- An absent `lgaId` never changes the saved LGA.
- After an explicit clear, the address has no `lgaId` and no LGA text, and the quote falls back to the state-level rule.
- A clear never touches the state or state code.

## Implementation plan

1. Start `codex/ttw-193-let-customers-clear-a-saved-lga` from current `main`, in its own worktree, after TTW-186 is merged.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below (High risk) before implementing.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate`.
7. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit: `normalizeForUpdate` with `lgaId: null` clears the LGA; an absent `lgaId` keeps it; a clear does not change the state.
- Integration on real Postgres: PATCH `/v1/users/addresses/:id` with `lgaId: null` on a Lagos/Ikeja address, then a quote that no longer matches the Ikeja rule.
- Component: emptying the LGA select sends `lgaId: null` (checkout page, settings form).
- Playwright: choose an LGA, save, empty it, save, and check the response.
- Logs, metrics, traces, and alerts: nothing new. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/shipping/address-normalization.service.ts` — `keepSavedLga`, `resolveLga`.
- `apps/api/src/addresses/dto/create-address.dto.ts` — `lgaId`.
- `docs/tickets/ttw-186-refuse-lga-outside-address-state.md` — LGA change rule.
- `docs/tickets/ttw-087-offer-states-and-lgas-at-checkout.md`, `docs/tickets/ttw-192-offer-state-and-lga-lists-in-settings.md` — origin.
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.

## Acceptance criteria

- [x] A customer can remove the LGA of a saved address from the checkouts and from settings.
- [x] A request without `lgaId` still keeps the saved LGA.
- [x] Swagger, shared contracts and docs are updated.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Refusing an LGA that does not belong to the state → TTW-186.
- Refusing a deactivated state → TTW-194.

## Design review

Done by the implementer before coding (High risk).

- `lgaId: null` passes the DTO: `@IsOptional()` skips validation for `null`. Swagger now says `nullable: true`.
- Clear = update with `lgaId === null` and no LGA text. It empties both the saved id and the saved text; state and state code are computed before and never touched.
- `lgaId: null` plus a non-empty LGA text: the text decides (the request names an LGA).
- `null` on create has no effect. The two `upsertPrimaryAddress` helpers also strip `null` on POST.
- Frontends send `null` only when the select is empty AND the saved address had an LGA. A saved LGA the list cannot show (list failed, LGA deactivated) is not sent and not cleared.

## Implementation reviews

Independent reviewer (general-purpose subagent, read-only): **PASS**, no blocking finding.

- Low: in the settings form, re-picking a state after an unmatched saved state resets the LGA select, so `lgaId: null` is sent with the same state code. Accepted: the customer changed the state, which already resets the LGA select.
- Info: no unit test for the web checkout wiring (only `lgaIdPayload`). Not added.
- Info: `lgaId: null` with an empty-string LGA text was untested. Test added.

## Verification evidence

- API unit: 148 suites, 1406 tests passed (the empty-text test was added after, spec file re-run: 39 passed).
- Written first and failing: 2 API unit tests (LGA stayed Ikeja), 1 settings form test, 1 app checkout test, 3 web `lgaIdPayload` tests.
- Integration on real Postgres: `pnpm --filter api test:e2e -- test/address-clear-lga.e2e-spec.ts` passed (quote 3500 with LGA rule, 2500 after clear).
- App 66 tests, web 54 tests passed. `pnpm typecheck` 6/6, `pnpm lint` 0 errors (14 existing API warnings), `pnpm format:check`, `pnpm openapi:check`, `pnpm docs:validate`, `pnpm playwright:validate`, `pnpm build` passed.
- Playwright: a temporary copy of the clear flow (choose Ikeja, save, empty, save, restore) passed on chromium-app, then was deleted.

Follow-up checks (second pass):

- Local test DB repaired so `seed:e2e` runs: the order, product and category tables of `tamiym_workshop_test` (test DB only) were truncated, then `seed:e2e` succeeded.
- New Playwright spec `tests/e2e/app/settings-clear-lga.spec.ts`: registers its own customer (so it never touches the address shared by other specs), picks Lagos/Ikeja, saves, reloads, empties the LGA, saves, checks the request (`lgaId: null`), the response (`lgaId` and LGA text null) and the reloaded form. 8 consecutive runs passed. `settings.comprehensive.spec.ts` is back to its original content and passes (13 passed with the new spec).
- Both checkouts were played in a browser with a temporary spec (deleted): app checkout (`/dashboard/checkout`) sent `lgaId: null` after the LGA was emptied and got `lgaId: null` back; web fundraiser checkout sent `lgaId: null` and got 200 with `lgaId` and LGA text null.

Seen, not fixed (out of scope): the seeded customer's phone `08000000004` is refused by the API ("phone must be a valid phone number") when the web checkout saves the address.

Not verified: CI run (not pushed when this was written; see below if updated).

## Completion summary

An address LGA can now be removed with `lgaId: null` from settings and both checkouts; an absent `lgaId` still keeps it. Contracts regenerated. Not pushed, no PR.
