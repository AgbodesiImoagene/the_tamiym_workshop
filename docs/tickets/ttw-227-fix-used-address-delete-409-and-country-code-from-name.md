# TTW-227 — Answer 409 when a used address is deleted and derive the country code from the country name

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

Two small defects were found by the TTW-222 and TTW-226 reviews and left out of those tickets. Confirm each against current `main` with a failing test before changing code.

1. **Deleting an address used by an order answers 500.** `Order.shippingAddressId` is a required foreign key to `Address` with no `onDelete` action, so Postgres refuses to delete an address that an order points to (Prisma `P2003`). `AddressesService.remove` (`apps/api/src/addresses/addresses.service.ts`) does not catch it, so the customer gets a 500 instead of a clear answer. The whole transaction rolls back, so no data is lost (TTW-222).
2. **A country name sent without a country code keeps the saved code.** `AddressNormalizationService.resolveCountryCode` (`apps/api/src/shipping/address-normalization.service.ts`) only recognises the name `Nigeria`. An edit that sends `country: "Ghana"` and no `countryCode` keeps the saved `NG`, and a create that sends only `country: "Ghana"` stores `NG`. The text says Ghana, the code says Nigeria, and the Nigerian delivery checks still apply. Both customer screens always send the code, so this needs a direct API call. Recorded as a MEDIUM by the TTW-226 reviews.

## Proposal

- **Delete:** a foreign-key refusal (`P2003`) on the address delete becomes `409 Conflict` with a stable code and a clear English message ("This address is used by an order and cannot be deleted."). The database stays the guarantee (no pre-read check): the delete is attempted and the refusal is translated. Nothing is changed when it is refused: the default address stays as it was.
- **Country name:** when no `countryCode` is sent and a `country` name is sent, resolve the name to an ISO 3166-1 alpha-2 code (English names from the platform's `Intl.DisplayNames`, compared after NFKC folding, trimming and collapsing spaces, case-insensitive). A recognised name sets the code, on create and on edit. An unrecognised name keeps today's behaviour (the saved code, or `NG` on create). An explicit `countryCode` still wins, as today.
- Update Swagger (new 409 on the delete route) and run `pnpm openapi:generate`. No schema change, no migration, no screen change.

### Not decided here (flag for the owner)

Whether a customer should be able to remove an address that an order used (for example by hiding it from their address book while the order keeps its snapshot) is a product decision: it would need a soft-delete column. This ticket only makes the refusal honest. Recommended follow-up if the owner wants it: archive instead of delete.

## Invariants

- Orders and their shipping snapshots are never changed or deleted by an address delete.
- A refused delete changes nothing (TTW-222): the default flag does not move.
- An explicit `countryCode` wins over the name; an invalid explicit code is still refused (TTW-219).
- Ownership, TTW-194, TTW-216, TTW-217, TTW-219, TTW-221, TTW-222 and TTW-226 rules are unchanged.

## Implementation plan

1. Start `codex/ttw-227-fix-used-address-delete-409-and-country-code-from-name` from current `main`, in its own worktree, with its own test database.
2. Reproduce both defects with failing tests (unit and e2e on real Postgres).
3. Design review (recorded below), then implement in two small steps: the delete answer, the country name.
4. Run the gates, record exact results, and obtain an independent implementation review.

## Test and observability plan

- Unit: country-name resolution (Ghana, `ghana`, `GHANA`, full-width, double spaces, an unknown name, an explicit code that wins, the legacy `Nigeria` case), on create and edit.
- Integration (real Postgres): deleting an address that an order uses answers 409 with the code, the address and the order are untouched, the default flag does not move; deleting an unused address still answers 204; a create or edit with only `country: "Ghana"` stores `GH`.
- Logs, metrics, traces, and alerts: nothing new. No PII in logs.

## References

- `apps/api/src/addresses/addresses.service.ts` — `remove`.
- `apps/api/src/shipping/address-normalization.service.ts` — `resolveCountryCode`.
- `apps/api/src/shipping/country-code.ts` — `canonicalCountryCode`.
- `docs/tickets/ttw-222-guarantee-one-default-address-per-customer.md`, `docs/tickets/ttw-226-harden-country-code-and-state-fields-on-the-write-paths.md` — origin.

## Acceptance criteria

- [ ] Deleting an address used by an order answers 409 with a stable code, and changes nothing.
- [ ] A create or edit that sends a recognised country name without a code stores the matching code; an unrecognised name keeps today's behaviour; an explicit code still wins.
- [ ] Swagger and the generated contract are updated.
- [ ] Required quality gates pass, with evidence recorded below, including an independent implementation review.

## Out of scope

- Archiving or hiding an address that an order used (product decision above).
- Parallel edits overwriting each other (found by TTW-222, not covered here).
- An explicit `countryCode` that disagrees with the `country` text.

## Design review

Recorded before the implementation (Standard risk: design review plus implementation review).

- **Delete, 409:** the guarantee stays in the database (the foreign key `Order.shippingAddressId`). No pre-read ("does an order use it?") is added, because it would race with an order created at the same moment. The delete is attempted inside the existing TTW-222 transaction and Prisma `P2003` is translated outside it, so the rollback keeps the default flag where it was. Any other error is rethrown unchanged. Only `Order` references `Address` today (`schema.prisma`), so `P2003` here means "an order uses it".
- **Country name:** the lookup table is built once from `Intl.DisplayNames(['en'], { type: 'region' })` over the valid ISO 3166-1 alpha-2 codes (no hand-written list, so no typo and no drift). Rejected: an alias list ("USA", "UK", "Ivory Coast"): it is a guess and grows without end; an unrecognised name keeps today's behaviour, which is never worse than before. Rejected: refusing an unrecognised name with 400, because it would reject spellings that work today (for example "Federal Republic of Nigeria" on a Nigerian address).
- **Risk checked:** a recognised foreign name can only move an address out of Nigeria, where the Nigerian state and LGA codes are dropped (TTW-226); it cannot make a foreign address skip a Nigerian check, because the Nigerian checks run only for `NG`. Moving back to Nigeria applies the Nigerian rules (TTW-221). An explicit `countryCode` still wins.
- **Known limit:** `Intl.DisplayNames` names depend on the Node/ICU build. The pinned Node 24 (`.nvmrc`) is used in CI and production, and the unit test pins the names it relies on.

## Implementation reviews

**Implementation review (independent subagent, read-only): PASS, no HIGH or MEDIUM.**

- Checked: `Order.shippingAddressId` is the only foreign key pointing at `Address`, so a `P2003` on delete can only mean "an order uses it"; the `.catch` is attached to the `$transaction` promise, so the 409 is raised after the rollback (lock, delete and promotion all undone); the 409 body is a fixed message and code (no order id, no Prisma meta); a recognised name gives no power an explicit `countryCode: "GH"` did not already give; no ICU alias collision on Node 24 (legacy codes are dropped by `isISO31661Alpha2`; "Nigeria" gives NG, "Niger" gives NE); no regression found against TTW-194/216/217/219/221/222/226.
- LOW 1 and 4 (recorded, not changed): recognition depends on the ICU version of the Node runtime, and a straight apostrophe does not match the curly one in "Côte d'Ivoire". A name we do not recognise keeps today's behaviour (on create: code NG, the stricter side), so there is no security effect. A small alias list was rejected in the design review.
- LOW 2 (done): a spec for an edit that sends only `{ country: "Ghana" }` on a saved Lagos address (codes dropped, state text kept) was added.
- LOW 3 (explained): the unit test only proves the mapping of `P2003`; the proof that the rollback leaves the default untouched is the e2e test, which asserts the address, the order and the default are unchanged after the 409.

## Deviations from the plan

- The ticket file was renamed shorter (`ttw-227-fix-used-address-delete-409-and-country-code-from-name.md`) so the README table keeps its column widths.

## Verification evidence

Local worktree, own database `tamiym_workshop_test_ttw227`, Redis DB 7.

- Red first: unit `address-normalization-country-name.spec.ts` failed (`countryCodeFromName is not a function`; the two behaviour cases "create Ghana" and "edit Ghana" failed on the old code); e2e: the delete answered `Expected: 409, Received: 500` (Prisma `ForeignKeyConstraintViolation`), and the two country-name cases failed.
- After the change: `address-used-delete-and-country-name.e2e-spec.ts` 5/5; all `test/address-*` e2e suites on a fresh database: 12 of 13 pass.
- `pnpm --filter api typecheck`: exit 0. `eslint --max-warnings=0` on the touched files: exit 0. `pnpm format:check`: all files formatted.
- `pnpm --filter api test`: 161 suites, 1809 tests passed.
- `pnpm openapi:generate` then `pnpm openapi:check`: "OpenAPI contract drift check passed." (only the new 409 response was added). `pnpm docs:validate`: "Documentation validation passed."
- `pnpm coverage:ratchet`: passed (lines 84.27%). `pnpm coverage:diff`: 39/39 changed lines covered (100%).
- Not green locally, not caused by this ticket: `test/address-state-mismatch.e2e-spec.ts` (TTW-216). It picks "the first active state other than Lagos"; on a database with the full Nigerian seed that state (Abia) has LGAs, so since TTW-221 the test's own create is refused with 400 `ADDRESS_LGA_REQUIRED`; on a database with only Lagos it finds no state at all. It passes in CI, where the other test files leave a suitable state. Recorded as an observation (see below).
- Not verified: no browser run (no screen change; the screens already send the code and do not offer a delete for an address an order uses differently); CI on the pushed branch.

## Completion summary

Deleting an address that an order uses now answers 409 `ADDRESS_IN_USE` ("This address is used by an order and cannot be deleted.") instead of 500, and changes nothing. A country name sent without a country code now gives the matching ISO code on create and edit (`Ghana` gives `GH`); an explicit code still wins and an unrecognised name keeps today's behaviour. No schema change, no migration, no screen change.

Follow-ups, not done here: archive instead of delete for an address an order used (product decision); make `address-state-mismatch.e2e-spec.ts` pick a state without LGAs (a fragile test, TTW-216 area); parallel edits overwriting each other (TTW-222 finding).
