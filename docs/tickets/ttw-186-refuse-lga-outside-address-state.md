# TTW-186 — Refuse an LGA that contradicts the address's state

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High\
**Blocked by:** TTW-185\
**Blocks:** None

## Background

Found by the independent review of TTW-185 (findings 1 and 2), and left out of that ticket because the first case also touches address creation. Same family as client-review row 5.6: a wrong address gives a wrong shipping fee.

Both cases live in `AddressNormalizationService` (`apps/api/src/shipping/address-normalization.service.ts`):

1. **An explicit `lgaId` is accepted with no state check when the state is unknown.** `resolveLga` looks the LGA up by `id` alone when `stateCode` is `null` (`...(stateCode ? { stateCode } : {})`). Reachable:
   - on create, with an unknown state text and an `lgaId` (for example `{ state: 'Atlantis', lgaId: <Ikeja id> }`);
   - on an edit that keeps an unknown state (TTW-185 only drops the LGA when the state _changes_), for example `PATCH { lgaId: <Ikeja id> }` on an address saved with `stateCode: null`.

   The address is then stored with `stateCode: null` and the Ikeja `lgaId`. An ADMIN2 rule whose `matchValue` is that LGA id and whose `matchContext` is empty matches it (`apps/api/src/shipping/shipping-destination-resolver.service.ts`, ADMIN2 case), so the address is priced at the Ikeja rate although its state is unknown. The app forms never send `lgaId`; any API client can.

2. **An LGA-only edit to an unknown LGA name keeps the saved `lgaId`.** Saved Lagos/Ikeja, then `PATCH { administrativeAreaLevel2: 'Surelere' }` (typo, no row): `administrativeAreaLevel2` becomes "Surelere" but `lgaId` stays Ikeja (`lgaId = resolvedLga?.id ?? existing.lgaId`). An Ikeja ADMIN2 rule still prices it. The state is unchanged, so no other state's rate applies, but the address carries an LGA the edit contradicts.

## Proposal

- In `resolveLga`, ignore an explicit `lgaId` when `stateCode` is `null` (return `null`). Do not derive the state from the LGA row: the address text would then name one state and carry another's code.
- On update, treat an LGA as changed when the request sends `lgaId` different from the saved one, or an `administrativeAreaLevel2` text that differs (trimmed, case-insensitive) from the saved one. When it changes and does not resolve within the address's state, store `lgaId: null` instead of keeping the saved id. Resending the same LGA text (the checkout resends the whole address) is not a change, as in TTW-185.
- No 400 on an unknown LGA: a strict save belongs to TTW-087, once the forms offer lists.

## Invariants

- An address never carries an `lgaId` whose state differs from its `stateCode`, and never an `lgaId` with a `null` `stateCode`.
- An edit that changes the LGA never keeps the saved `lgaId` unless the new LGA resolves to that same row.
- An edit that does not touch the LGA keeps the saved `lgaId` (TTW-185 rules for state changes still apply).

## Implementation plan

1. Start `codex/ttw-186-refuse-lga-that-contradicts-state` from current `main`, in its own worktree.
2. Record the design review below (High risk). Check whether TTW-087 has started on the same file; if so, stay sequential.
3. Write the tests first and show them failing for the right reason.
4. Change `resolveLga` and the update merge rule. No schema, DTO or OpenAPI change expected.
5. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit (`apps/api/src/shipping/address-normalization.service.spec.ts`), with a `geoLga.findFirst` mock that honours `where`:
  - create with `{ state: 'Atlantis', lgaId: 'lga-ikeja' }` → `stateCode: null`, `lgaId: null`;
  - saved `{ stateCode: null, lgaId: null }`, `PATCH { lgaId: 'lga-ikeja' }` → `lgaId: null`;
  - saved Lagos/Ikeja, `{ administrativeAreaLevel2: 'Surelere' }` (no row) → `stateCode: 'LA'`, `lgaId: null`;
  - saved Lagos/Ikeja, resend `{ administrativeAreaLevel2: 'ikeja ' }` → keeps `lga-ikeja`;
  - saved Lagos/Ikeja, `{ administrativeAreaLevel2: 'Surulere' }` resolving under LA → new id.
- Integration (`apps/api/test/`, production `AppModule`): an ADMIN2 rule on the Ikeja LGA id with no `matchContext`; an address created with an unknown state and the Ikeja `lgaId` is refused at quote with `SHIPPING_ADDRESS_NOT_COVERED`, not priced at the Ikeja rate.
- Failure, retry, and concurrency: none specific; pure merge rule.
- Logs, metrics, traces, and alerts: nothing new. No PII in logs.

## References

- `docs/tickets/ttw-185-drop-stale-state-on-address-edit.md` — review findings 1 and 2.
- `apps/api/src/shipping/address-normalization.service.ts` — `resolveLga`, `normalize`.
- `apps/api/src/shipping/shipping-destination-resolver.service.ts` — ADMIN2 matching on `lgaId` and `matchContext`.
- `docs/tickets/ttw-087-offer-states-and-lgas-at-checkout.md` — strict save once lists exist.

## Acceptance criteria

- [x] An address with an unknown state never stores an `lgaId` (on update; create is already refused by TTW-087).
- [x] An LGA-only edit to an unknown LGA clears the saved `lgaId`.
- [x] Resending the same LGA keeps the saved `lgaId`.
- [x] Required quality gates pass, with evidence recorded below.
- [x] `docs/runbooks/shipping-zone-coverage.md` updated if the address rules it lists change.

## Out of scope

- A strict 400 on unknown states or LGAs, and lists in the forms → TTW-087.
- CITY and ADMIN2 name rules without `matchContext` matching the customer's own text whatever the state (TTW-185 review finding 6) → zone configuration, TTW-087 or TTW-097.

## Design review

Recorded 2026-11-10, before implementation (High risk), against `main` at `3d69fa4`.

- **Deviation: case 1 on create is no longer reachable.** Since TTW-087 a Nigerian address cannot be created with a state the platform does not know (400 `ADDRESS_STATE_UNKNOWN`), so `{ state: 'Atlantis', lgaId }` on create is refused before any LGA lookup. What remains is an edit of an address saved before TTW-087 with `stateCode: null`. The create unit test and the "on create" half of the first acceptance criterion are replaced by the edit case.
- **TTW-087 already touched the same file and is Complete**, so there is no overlap to wait for. TTW-185 is Complete.
- **Rule adopted (as proposed).** `resolveLga` returns `null` for an explicit `lgaId` when `stateCode` is `null`; the state is never derived from the LGA row. A new `isLgaChange` is true when the request sends an `lgaId` other than the saved one, or an `administrativeAreaLevel2` that differs from the saved text (trimmed, case-insensitive). A changed LGA that does not resolve within the address's state stores `lgaId: null`; the typed text is kept. Resending the same LGA is not a change.
- **Security / data:** no new input, no new log, no PII. The change can only clear an `lgaId`, never set one the request did not resolve in the address's own state, so it cannot widen which rate applies.
- **Concurrency / retry:** none; pure merge rule inside the existing update.
- **Scope:** one service file, unit tests, one integration spec, one runbook sentence. No schema, DTO or OpenAPI change.

## Implementation reviews

2026-11-10, independent reviewer (read-only, one comprehensive review): **PASS**, no blocking or major finding. The reviewer read the diff, the service, the unit tests and the e2e, and re-ran `pnpm --filter api test -- src/shipping` (33 passed). It did not re-run the e2e, nor play the checkout in a browser; it read that the checkouts and the settings form resend `stateCode` and `lgaId`, so a valid LGA is not lost.

Minor findings, both fixed in this ticket after the review (second commit on the same branch):

- A legacy address with `stateCode: null` and a stored `lgaId` kept that `lgaId` on an edit that did not touch the LGA, and could gain a `stateCode` it was never checked against. The saved `lgaId` is now kept only while the resulting `stateCode` is known and equal to the saved one. Two unit tests cover it (they failed first).
- Missing unit tests added: `lgaId` and LGA text sent together (the `lgaId` wins), whitespace-only `lgaId`, non-Nigerian address with an `lgaId`, saved `lgaId` with a null LGA text. `resolveLga` now trims `lgaId` like `isLgaChange` does, so a whitespace-only `lgaId` counts as not sent (the saved LGA is kept) instead of being looked up as an id.

2026-11-10, second independent review of the fix commit (`8e1378e`): **PASS**, no blocking or major finding. It re-ran `pnpm --filter api test -- src/shipping` (39 passed) and checked the legitimate cases by reading the code: a full resend by the checkout or settings form, a Google Places address with a valid `stateCode` and unresolved state text, a non-Nigerian address, a TTW-185 state change, and create. It did not run the e2e or Playwright, nor play the checkout in a browser. Its two minor findings were about this ticket's text and are fixed here: an inaccurate "reworded" remark about the whitespace test, and a status that contradicted the summary.

## Verification evidence

Run in the worktree `.claude/worktrees/ttw-186` on branch `codex/ttw-186-refuse-lga-that-contradicts-state`.

- Tests first: 3 of the 7 first unit tests failed on the old code (unknown-state `lgaId`, unknown LGA text, other-state `lgaId`); the other 4 are guards that already held. The new e2e failed without the fix (`Expected - 1 / Received + 1`: the address stored the Ikeja `lgaId`) and passed with it.
- After the review fixes: 2 of the 6 added unit tests failed on the previous code (legacy `lgaId` kept) and passed after the fix; the whitespace-only `lgaId` test is a guard that already passed.
- `pnpm --filter api test -- src/shipping`: 4 suites, 39 tests passed. Full api run with coverage: 148 suites, 1401 tests passed; diff coverage 14/14 lines; ratchet, typecheck, format and docs validation passed; the 3 related e2e suites (8 tests) passed.
- `pnpm --filter api test:e2e` on `address-lga-state`, `address-edit-state`, `shipping-zone-coverage`: 3 suites, 8 tests passed.
- `pnpm --filter api test` with coverage: 148 suites, 1395 tests passed.
- `pnpm --filter api typecheck`: clean. `pnpm --filter api lint`: 0 errors (14 existing warnings, none in the touched files). `pnpm format:check`: passed.
- `pnpm docs:validate`, `pnpm openapi:check`: passed.
- `pnpm coverage:diff`: 12/12 changed lines covered (floor 80%). `pnpm coverage:ratchet`: passed.
- Full gates run afterwards on the final branch (2026-11-10): `pnpm --filter api test:e2e` 32 suites, 174 tests passed; `pnpm test` web 51, app 63, api 1401 passed; `pnpm build` 5 tasks successful.
- Not run: Playwright, a browser check of the checkout.

## Completion summary

An address no longer keeps an `lgaId` the edit contradicts or that was never checked against its state. Two commits on `codex/ttw-186-refuse-lga-that-contradicts-state`, both reviewed (PASS). Nothing pushed, no PR, not merged into `main`. The full api e2e suite, `pnpm test` and `pnpm build` passed locally. Not run: Playwright, a browser check of the checkout; CI has not run on this branch.
