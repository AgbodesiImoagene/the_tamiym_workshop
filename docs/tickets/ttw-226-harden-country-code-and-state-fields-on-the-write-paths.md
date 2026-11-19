# TTW-226 — Harden the country code and the state fields on the write paths

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High\
**Blocked by:** None (TTW-221 and TTW-222 are merged)\
**Blocks:** None

## Background

Observations from the independent security reviews of TTW-216 and TTW-219 (2026-11-14 and 2026-11-15). They are older than those tickets and were left out of their scope. Confirm each against current `main` with a failing test before designing; drop any that is not real.

1. **Admin shipping rules read the country code loosely.** `ShippingAdminService` (`apps/api/src/shipping/shipping-admin.service.ts`, about line 343) only does `dto.countryCode?.trim().toUpperCase()`, so a full-width or look-alike country code is stored on a rule and never matches. TTW-219 added `canonicalCountryCode` (`apps/api/src/shipping/country-code.ts`) for addresses. Admin-only, so not customer-exploitable, but the same rule should hold.
2. **Changing the country of a Nigerian address keeps its Nigerian state.** Editing an address from `NG` to another country keeps the stored `stateCode` and LGA (TTW-216 review, observation 2).
3. **No length limit on the state fields.** `state`, `administrativeAreaLevel1` and related texts have no `MaxLength` in the address DTOs (TTW-216 review, observation 4).
4. **A NUL character in a state text** may be refused by Postgres and answer 500 instead of a 400 (TTW-216 review, observation 5).

## Proposal

- Use `canonicalCountryCode` in the admin shipping rule and area writers and refuse an invalid code with a clear 400; keep existing rules readable.
- When the country of an address changes away from `NG`, clear the Nigerian `stateCode` and `lgaId` (and keep the state text the customer sent), so no Nigerian state or LGA stays attached to a foreign address; when it changes to `NG`, the Nigerian rules apply as today.
- Add sensible `MaxLength` limits to the address text fields in the create and update DTOs, matching the existing limits (for example the 500 used elsewhere) and the database column sizes, and reject NUL characters with a 400 (a shared validator or a transform, not scattered checks).
- Update DTO docs, Swagger and `pnpm openapi:generate` if the contract changes. No screen changes expected; if a limit could cut a value the screens already send, record it.

## Invariants

- Valid Nigerian addresses and existing saved addresses keep working.
- The TTW-087, TTW-194, TTW-216, TTW-217, TTW-219 rules and ownership checks are unchanged.
- Limits never reject a value that the app and web forms produce today.

## Implementation plan

1. Wait until TTW-221 is merged into `main`, then start `codex/ttw-226-harden-country-code-and-state-fields-on-the-write-paths` from current `main`, in its own worktree. Copy this ticket into `docs/tickets/` of that worktree and add the ticket rows to `docs/tickets/README.md` and `docs/tickets/ROADMAP.md`.
2. Reproduce each point with a failing test.
3. Record the design review (High risk).
4. Implement in small steps. Record any deviation.
5. Run the gates, record exact results, and obtain an independent implementation review and an independent security review.

## Test and observability plan

- Unit and integration on real Postgres: admin rule with a full-width or look-alike country code refused; an address edited from NG to another country loses its Nigerian `stateCode` and `lgaId`; an over-long state text and a NUL character answer 400.
- Logs, metrics, traces, and alerts: nothing new. No PII in logs.

## References

- `apps/api/src/shipping/shipping-admin.service.ts` — rule and area writers.
- `apps/api/src/shipping/country-code.ts` — `canonicalCountryCode`.
- `apps/api/src/addresses/dto/create-address.dto.ts`, `update-address.dto.ts`.
- `docs/tickets/ttw-216-keep-one-state-per-address-the-code-decides-the-text.md`, `docs/tickets/ttw-219-keep-the-default-address-and-the-country-code-safe.md` — origin.

## Acceptance criteria

- [x] Admin shipping rules and areas accept only a canonical ISO country code.
- [x] An address moved out of Nigeria no longer carries a Nigerian state code or LGA.
- [x] Over-long state texts and NUL characters answer 400.
- [x] Required quality gates pass, with evidence recorded below, including an independent implementation review and an independent security review.
- [x] Contracts and docs are updated where applicable.

## Out of scope

- LGA gaps in the delivery refusal → TTW-221.
- Default-address integrity → TTW-222.

## Design review

Recorded before implementation (risk High: input validation on customer-facing writes and an admin write path).

**Confirmed against `main` (failing tests written first):**

1. Real. `ShippingAdminService.normalizeRuleInput` only trims and upper-cases; the DTO's `@Length(2, 2)` lets a full-width "ＮＧ" through, so it is stored and the Nigerian checks are skipped. The legacy area writer (`createArea`) has no country input (it writes `'NG'`), so only the rule writers need the change.
2. Real, in one case more than described. `AddressNormalizationService` only clears the code when the state text changes. An edit that changes only the country (or that resends `stateCode`/`lgaId`) keeps the Nigerian `stateCode` and `lgaId` on a foreign address; the Nigerian LGA name also stays in `administrativeAreaLevel2`.
3. Real. No `MaxLength` on any address text except `instructions`. The columns are unbounded `text`; the web forms set no limit either.
4. Real. A U+0000 in any text reaches Prisma and Postgres refuses it with a 500.

**Decisions**

- Rules: `canonicalCountryCode` in `normalizeRuleInput`. A new or changed code that is not a real code answers 400 `countryCode must be a valid ISO 3166-1 alpha-2 code`. A rule already stored keeps working: an unchanged stored value that is not canonical is kept as it is (so a legacy rule can be edited on other fields); a stored full-width "ＮＧ" is folded to `NG` on the next edit. The DTO keeps `@Length(2, 2)`: validation lives in the service so a legacy rule resent whole by the admin screen is not refused.
- Address country change: the rule is "a non-Nigerian address never carries a Nigerian `stateCode` or `lgaId`", applied on every write (create and update, even when the same request resends the old codes). The state text stays (the request's, else the saved one, since `state` is required). The saved LGA _name_ is dropped when the country leaves Nigeria and the request sends none, because it names a Nigerian LGA. Moving into Nigeria uses the existing Nigerian rules unchanged (known state, LGA required).
- Limits (no existing form sets one; the longest text a form or Google Places produces today is far below them): 500 for `addressLine1/2`, `landmark`, `formattedAddress`, `instructions` (already 500); 200 for `recipientName`, `city`, `state`, `country`, `locality`, `dependentLocality`, `administrativeAreaLevel1/2`; 20 for `postalCode`; 10 for `stateCode`; 64 for `lgaId`; 300 for `googlePlaceId`. NUL refused through one shared decorator (`AddressText`) that bundles string, non-empty, max length and no-NUL, so the checks are not scattered.
- Risks: a limit rejecting a real value (mitigated by generous limits and a test with ordinary values); a foreign address losing codes it never should have had (none are used for a non-NG address: delivery checks read the codes only when `countryCode === 'NG'`); legacy rules (kept readable). No schema change, no migration, no new endpoint; only Swagger `maxLength` and descriptions change.
- Out of scope, noted: the admin rule `matchValue`/`matchContext` can also carry a NUL (admin only, will be listed in the final report); `country` text and `countryCode` can disagree when only `country` is sent (pre-existing).

## Implementation reviews

**Implementation review (independent subagent): PASS with reservations, no HIGH.**

- MEDIUM: an edit that sends only `country: "Ghana"` (no `countryCode`) keeps `countryCode` NG, so the Nigerian codes stay. Pre-existing and listed as a known gap: the two screens always send `countryCode`. Not changed here; follow-up proposed (derive the code from `country` when recognised).
- LOW: a legacy full-width rule on a deactivated state would have been refused on a priority edit. **Fixed** (test first: "lets a full-width rule on a deactivated state be edited on other fields"; `sameCountry` helper).
- LOW: `no-control-regex` on the NUL regex. **Fixed**: the decorator uses `value.includes('\0')` through `ValidateBy`.
- LOW: Swagger did not say that `stateCode`/`lgaId` are ignored outside Nigeria. **Fixed** (create and update DTOs, openapi regenerated).
- LOW: limits could cut a Google Places `formattedAddress` above 500 characters. Never observed; recorded here.

**Security review (independent subagent): PASS with reservations, no HIGH.**

- MEDIUM: admin rule `matchValue`/`matchContext` accepted a NUL (500) and had no length limit. **Fixed** (test first, `shipping-rule-text.dto.spec.ts`): `@AddressText(200)`.
- LOW: legacy rules stored with a full-width code stay dead until edited. They are folded to `NG` on their next edit; no cleanup script (admin data, rare). Follow-up if wanted.
- LOW: pre-existing `country` text vs `countryCode` inconsistency (same as the MEDIUM above).
- No bypass found for NFKC/Unicode, no ReDoS (the NUL check is `includes`, not a regex), no ownership or mass-assignment change, no new log lines.

## Deviations from the plan

- Added the same NUL/length rule to the admin rule `matchValue`/`matchContext` (security review), 200 characters.
- The legacy area writer (`createArea`) has no country input, so only the rule writers changed.
- The saved LGA name is dropped when an address leaves Nigeria (besides the codes); the state text is kept.
- A non-Nigerian address never stores a `stateCode`/`lgaId` on any write, including create and unrelated edits of an old foreign address that still carried them.

## Verification evidence

Local worktree, own database `tamiym_workshop_test_ttw226`, Redis DB 6.

- Red first: 79 unit failures (3 new specs) and 15 of 20 e2e failures before the change.
- `pnpm typecheck`: 6/6 tasks successful. `apps/api` `tsc --noEmit`: exit 0 after the last edit.
- `pnpm lint`: first run failed on `no-control-regex` and 6 unused imports (fixed); `eslint` on the touched folders and e2e file is clean afterwards.
- `pnpm test`: api 160 suites / 1785 tests passed; app 12 suites / 121 tests passed.
- `pnpm openapi:check`: "OpenAPI contract drift check passed." `pnpm docs:validate`: "Documentation validation passed."
- `pnpm format:check`: run after `prettier --write` on the ticket and the two index files.
- e2e on real Postgres (`test/address-*`, `shipping-rule*`, `shipping-zone*`, `order*`): 16 of 18 suites pass, including the new `address-country-and-text-hardening.e2e-spec.ts` (20/20). `address-lga-spaces` failed once under machine overload (load average above 600, timeouts) and passes alone (4/4). `address-state-mismatch` fails the same way **before** this ticket (checked with the changes stashed): the test picks the first active state, which in a freshly seeded database has LGAs, so TTW-221 asks for one. Not caused by TTW-226.

Not verified: no browser run (no screen change; the screens already send `countryCode`); the follow-ups above.

## Completion summary

Admin rules now fold or refuse the country code like addresses; a non-Nigerian address never carries a Nigerian state code or LGA; address texts have length limits (500/200/20/10/64/300) and refuse NUL with 400 through one shared decorator (`AddressText`). Contract regenerated. No schema change.
