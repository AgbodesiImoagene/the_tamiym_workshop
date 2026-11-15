# TTW-216 — Keep one state per address: the code decides the text

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

Found by the independent security review of TTW-194 (observation LOW 1). `AddressNormalizationService` (`apps/api/src/shipping/address-normalization.service.ts`) stores both a state **code** (`stateCode`, for example `AB`) and state **texts** (`state`, `administrativeAreaLevel1`). An edit that resends the saved `stateCode` with a different state text is not a state change (`isStateChange`), so it can store a pair that contradicts itself, for example the text "Lagos" next to the code `AB`. The same already happens for any saved state, not only deactivated ones.

**Owner decision, 2026-11-14:** an address must have one state, identified by its code, to avoid confusion. This ticket carries that decision out.

Confirm against current `main` before designing: the code may have moved. Related earlier work: TTW-087 (a Nigerian address needs a known state), TTW-185, TTW-186, TTW-194.

## Proposal

- When the state of a Nigerian address is resolved (explicit `stateCode` or text), the stored `stateCode` identifies it and the stored `state` and `administrativeAreaLevel1` are the canonical name of that `GeoState`, never the text the request sent.
- A request whose explicit `stateCode` and state text name two **different** known states is refused with a clear 400 (new error code, for example `ADDRESS_STATE_MISMATCH`). Text that names the same state in another spelling or case is accepted and canonicalised. **Recommendation, to confirm with the owner in the design review:** refuse a contradiction rather than silently pick one.
- Saved addresses that already hold a mismatched pair keep loading, and an edit that does not touch the state keeps working (as TTW-087 and TTW-194 require). Report how many saved rows are inconsistent with a read-only query and put the count in the ticket; **do not rewrite saved data** unless the owner approves it.
- Update DTO docs, Swagger and `pnpm openapi:generate` if the error response or its documentation changes. Do not redesign the address screens.

## Invariants

- A new or state-changing address stores one state: the code and the canonical name of the same `GeoState`.
- Ownership and the TTW-194 rule (a deactivated state is refused) are unchanged.
- A saved address stays loadable and editable on other fields.
- Non-Nigerian addresses are not affected.

## Implementation plan

1. Start `codex/ttw-216-keep-one-state-per-address-the-code-decides-the-text` from current `main`, in its own worktree. Move this file into it and add the ticket rows to `docs/tickets/README.md` and `docs/tickets/ROADMAP.md`.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below (High risk) before implementing. Ask the user the refuse-or-canonicalise question once, with the recommendation above.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent implementation review and a security review (High risk).

## Test and observability plan

- Unit: contradicting code and text refused on create and on edit; same state in another spelling canonicalised; unchanged edit of a saved mismatched address still works.
- Integration on real Postgres: POST and PATCH through `/v1/users/addresses` for each case; the stored row has the canonical name.
- Logs, metrics, traces, and alerts: nothing new. No PII in logs.

## References

- `apps/api/src/shipping/address-normalization.service.ts` — `normalize`, `resolveState`, `isStateChange`.
- `docs/tickets/ttw-194-refuse-a-deactivated-state-on-addresses.md` — origin (security review, LOW 1).
- `docs/tickets/ttw-087-offer-states-and-lgas-at-checkout.md`, `docs/tickets/ttw-185-*.md`, `docs/tickets/ttw-186-refuse-lga-outside-address-state.md` — earlier rules.

## Acceptance criteria

- [x] A new or edited address stores the code and the canonical name of one state.
- [x] A contradiction between code and text is refused with a clear error.
- [x] A saved address (even a mismatched one) still loads and is editable on other fields.
- [x] The number of already inconsistent saved rows is reported, with no data rewritten without approval.
- [x] Required quality gates pass, with evidence recorded below.
- [x] Contracts and docs are updated where applicable.

## Out of scope

- Refusing quotes and orders for an address in a deactivated state → TTW-217.
- Rewriting saved addresses (needs the owner's approval, as its own ticket).
- A deactivated LGA on addresses (done in TTW-202).

## Design review

Reviewer: author, before implementation (High risk). Confirmed against `main` 2684af6 on 2026-11-14: the finding is real. In `normalize`, `state` is `clean(input.state) ?? administrativeAreaLevel1 ?? existing.state`, so the request text is stored as sent; `administrativeAreaLevel1` is canonical only when the text path resolved. `resolveState` gives the explicit `stateCode` priority and never looks at the text, so code `AB` plus text "Lagos" is stored as is. `isStateChange` compares only the code when a code is sent.

**Rule.** For a Nigerian address whose state resolves to an active `GeoState`, the stored `stateCode` is its code and both `state` and `administrativeAreaLevel1` are `GeoState.name`, never the request text.

**Contradiction (needs the owner's confirmation, see the report).** Working assumption = the recommendation: refuse with `400 ADDRESS_STATE_MISMATCH` when the request names two different known states: (a) explicit `stateCode` and a state text; (b) with no code, `administrativeAreaLevel1` and `state` naming two different states. Only **active** states count as "known" (changed after the security review, see below): a text that matches no active state (typo, "Lagos State", or a deactivated state) next to a valid code is not a contradiction. The code decides and the text is replaced by the canonical name, so nothing contradictory is stored and the answer cannot tell a deactivated state from one that does not exist. The check lives in one private method, so switching to "silently pick the code" later is a one-line change.

**Order of checks (so TTW-194 does not leak).** Unknown or deactivated explicit code on create or on a state change stays `ADDRESS_STATE_UNKNOWN` and is raised before any mismatch check, so the 400 never tells apart "deactivated" from "does not exist". The mismatch check only runs when the code resolves to an active state, or when the code is the one already saved (an edit of a legacy row).

**Saved addresses.** An edit that does not change the state (sends no state field, or resends the saved text) now resolves from the saved `stateCode` first (code decides), falling back to the saved text only when the saved code is missing or not active. Saved rows with a consistent pair behave exactly as before. A saved mismatched row, edited on other fields, has its text rewritten to the canonical name of its saved code (the code is never changed by an edit that names no state); nothing is rewritten in bulk. A saved row whose code is deactivated keeps loading and stays editable (TTW-194 invariant); the request text never overwrites its saved text.

**Clients.** `apps/app` settings and checkout and `apps/web` checkout send `stateCode` and `state` from the same dropdown choice (`selectState`), so they send consistent pairs and are not refused. A form preloaded from a legacy mismatched row would resend its inconsistent pair and get the 400 until the customer picks a state again; the measured count (see Verification evidence) bounds this.

**Other readers.** `shipping-destination-resolver` and quotes read `stateCode`/`lgaId`, not the text, so they are unchanged. `resolveLga` already uses the resolved `stateCode`. No schema change, no migration. OpenAPI: a new documented 400 code on POST and PATCH `/v1/users/addresses` (description only); regenerate with `pnpm openapi:generate`.

**Edge cases tested.** Code + same state other case; code + other state; code + unknown text; code + deactivated state's text (code decides); text equal to a code (`LA`); two equal texts; code only; text only (case, spaces); both texts differing; both texts equal; saved mismatched row edited with no state, with the saved code resent, with the saved code and a conflicting text; saved deactivated code with and without text; non-Nigerian address untouched ; saved mismatched row resending only its saved text; saved deactivated row with free text (saved text kept); deactivated code + conflicting text on create stays UNKNOWN.

**Risks.** Regression on the checkout, which resends the whole address every save (covered by the "same state resent" tests and the existing suite). Race with deactivation stays excluded as in TTW-194.

**Verdict:** go.

## Implementation reviews

**Independent implementation review (fresh context, read-only), 2026-11-14.** No blocker. 1 IMPORTANT, 4 MINOR. The existing tests were not touched (301 insertions, 0 deletions in the spec).

- IMPORTANT: a saved mismatched row (code `LA`, text "Kano") edited with only `state: "Kano"` (equal to the saved text) was not a state change but resolved by text, so the code silently became `KN`. **Fixed:** `resolveState` now receives `stateUnchanged` and the saved code decides whenever the edit does not change the state. Test: "keeps the saved code when the edit resends only the saved text of a mismatched row".
- MINOR: free text kept next to a saved deactivated code. **Fixed:** the request text never overwrites the saved text of such a row (`keepSavedText`); test added.
- MINOR: test gaps (text equal to a code, two equal texts, saved-text-only on a mismatched row). **Fixed:** three tests added.
- MINOR (accepted, unchanged behaviour): with no code, `state: "Lagos"` plus `administrativeAreaLevel1: "Lagos State"` is refused as `ADDRESS_STATE_UNKNOWN`, because `administrativeAreaLevel1` is read first. This is how it worked before.
- MINOR: ticket sections were pending; now filled.

**Independent security review (fresh context, read-only), 2026-11-14.** Verdict conditional, no critical flaw. Confirmed: no raw SQL, ownership unchanged, bounded DB calls (at most one `findUnique` and three `findFirst`), static error message with no user value, no write outside the request.

- C1 (oracle, 9/10): a deactivated state counted as "known", so `LA` + "Abia" gave `ADDRESS_STATE_MISMATCH` while a made-up text gave 201. **Fixed:** only active states count in `assertTextsAgree`; the code decides. Test: "does not tell a deactivated state from an unknown text".
- C2 (8.5/10): saved deactivated code plus free text stored a free text. **Fixed** with the item above.
- C3 (9/10, **not fixed, out of scope, already true for `ADDRESS_STATE_UNKNOWN` since TTW-194**): `addresses.service.ts` clears the other default address (`updateMany isDefault:false`) before normalisation and outside a transaction, so a refused create or edit with `isDefault: true` leaves the user with no default address. A new cause of refusal widens it a little. Proposed as its own ticket: validate first, then write inside one transaction.
- Observations, all older than this ticket and outside the diff: changing the country of a NG row to another country keeps the Nigerian `stateCode` and LGA (O2); a full-width `countryCode` such as "ＮＧ" is treated as non-Nigerian and skips the state checks (O3); no `MaxLength` on the state fields (O4); a NUL character may give a 500 (O5, not verified); `mode: 'insensitive'` wildcard behaviour in Prisma not verified (O6).
- Not verified by the reviewer: test execution, Prisma's SQL, the global ValidationPipe, CSRF/cookie settings, the consumers of `stateCode`.

Both reviews ran on the working tree before the fixes above; the fixes were checked by the unit and e2e runs listed below, not by a second review round (the reviewers' findings were each reproduced by a test).

## Verification evidence

Run in the worktree `.claude/worktrees/ttw-216-one-state-per-address-4ef241` on 2026-11-14, on a heavily loaded machine (load average about 300), Node 24.

- Tests first: 12 new unit tests failed for the right reason (a contradiction resolved instead of refused; `state` stored as sent, for example "Kano" next to code `LA`, "LAGOS" instead of "Lagos"), 57 passed. The new e2e failed with `Expected "state": "Lagos", Received "state": "LAGOS"`.
- `pnpm --filter api exec jest src/shipping`: 104 passed.
- `pnpm --filter api test -- --coverage`: 151 suites, 1497 tests passed.
- API e2e on real Postgres (`tamiym_workshop_test`), one file at a time, all passed: `address-state-mismatch` (new), `address-edit-state`, `address-deactivated-state`, `address-deactivated-lga`, `address-lga-state`, `address-clear-lga`, `geo-reference`, `shipping-zone-coverage`.
- `pnpm --filter api typecheck`: OK. `pnpm --filter api lint`: 0 errors, 14 warnings (none in touched files). `pnpm format:check`, `pnpm docs:validate`, `pnpm openapi:check` (after `pnpm openapi:generate`): OK.
- `pnpm coverage:diff`: 34/34 changed lines covered (floor 80%).
- **Inconsistent saved rows (read-only `SELECT` through `psql` with `default_transaction_read_only=on`, nothing written):** there is no local database with real data; the only databases are test and e2e ones. Rows with a `stateCode` whose text differs from the canonical name: `tamiym_workshop_test` 0 of 254, `_ttw084_test` 0 of 47, `_test_ttw083` 0 of 16, `_ttw181_test` 0 of 17, `_209` 0 of 1, `_211` 0 of 3, `_ttw183_test` 0 of 1, `_210` 10 of 156, none with an unknown code. The 10 rows are privacy-redacted addresses (`state = 'REDACTED'`, `administrativeAreaLevel1` empty, code `LA`), not customer mismatches. **The count in production is not measured** (no access). Query to run there, read-only:
  `SELECT count(*) FROM addresses a JOIN geo_states g ON g.code = a."stateCode" WHERE a."countryCode" = 'NG' AND (lower(coalesce(a.state,'')) <> lower(g.name) OR lower(coalesce(a."administrativeAreaLevel1", g.name)) <> lower(g.name));`
  (add `AND a.state <> 'REDACTED'` to leave out redacted rows).
- Not run: browser journey (no screen change; the clients already send a consistent code and name), `pnpm build`, the full e2e suite, any run on the production database.

**Owner answer (relayed 2026-11-14):** refuse a contradiction with a clear 400; a text naming the same state in another case or spelling is accepted and canonicalised. This is what is implemented.

Deviations from the plan: only active states count as "known" in the contradiction check (security review C1); an edit that does not change the state is settled by the saved code. The create DTO requires `state`, so a "code only" create is not possible through the API (it is covered at service level).

## Completion summary

The API now stores one state per address: the code and the canonical name of that state, never the text sent. A request whose `stateCode` and state text name two different active states, or whose two state texts do, is refused with `400 ADDRESS_STATE_MISMATCH`; the same state in another case or spelling is accepted and canonicalised, and a text that matches no active state is replaced by the code's name. Saved addresses, even mismatched or deactivated ones, still load and stay editable; an edit that does not change the state is settled by the saved code. Nothing saved was rewritten. The inconsistent-row count could not be measured in production (see Verification evidence). Both independent reviews were done and their findings fixed, except the default-address problem (C3), recorded above as a candidate follow-up. Not pushed, not merged.
