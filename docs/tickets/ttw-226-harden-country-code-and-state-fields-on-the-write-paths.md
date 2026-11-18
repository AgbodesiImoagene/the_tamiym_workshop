# TTW-226 — Harden the country code and the state fields on the write paths

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
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

- [ ] Admin shipping rules and areas accept only a canonical ISO country code.
- [ ] An address moved out of Nigeria no longer carries a Nigerian state code or LGA.
- [ ] Over-long state texts and NUL characters answer 400.
- [ ] Required quality gates pass, with evidence recorded below, including an independent implementation review and an independent security review.
- [ ] Contracts and docs are updated where applicable.

## Out of scope

- LGA gaps in the delivery refusal → TTW-221.
- Default-address integrity → TTW-222.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
