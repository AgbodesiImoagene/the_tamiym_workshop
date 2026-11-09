# TTW-186 — Refuse an LGA that contradicts the address's state

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
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

- [ ] An address with an unknown state never stores an `lgaId`, on create or update.
- [ ] An LGA-only edit to an unknown LGA clears the saved `lgaId`.
- [ ] Resending the same LGA keeps the saved `lgaId`.
- [ ] Required quality gates pass, with evidence recorded below.
- [ ] `docs/runbooks/shipping-zone-coverage.md` updated if the address rules it lists change.

## Out of scope

- A strict 400 on unknown states or LGAs, and lists in the forms → TTW-087.
- CITY and ADMIN2 name rules without `matchContext` matching the customer's own text whatever the state (TTW-185 review finding 6) → zone configuration, TTW-087 or TTW-097.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
