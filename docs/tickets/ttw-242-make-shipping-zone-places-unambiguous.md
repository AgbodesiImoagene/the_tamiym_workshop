# TTW-242 — Make the places of a shipping zone unambiguous

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

Raised by the user on 2026-11-21 while explaining shipping zones to the client (TTW-086, TTW-098, `docs/runbooks/shipping-zone-coverage.md`). Zones are created by the client's own team in the admin; states and LGAs already exist in the database (`prisma db seed`).

Today, which zone an address falls into depends on a `priority` number, and nothing keeps two admins from contradicting each other:

- A state rule (`ADMIN1`) matches every address in that state, whatever its LGA (`shipping-destination-resolver.service.ts`, `case ShippingRuleMatchType.ADMIN1`). So a state in a zone already covers all its LGAs.
- An LGA rule (`ADMIN2`) can be put in another zone than its state. It then wins, but nothing on screen says so.
- Through the areas route the priority is 100 for an LGA and 200 for a state (`shipping-admin.service.ts`, around line 332). Through the rule form the priority defaults to 100 for both (`apps/admin/app/admin/shipping/zones/[id]/page.tsx`, `useState('100')`), so a state and an LGA tie, and the oldest rule wins (`orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }]`).
- The same state or LGA can be in two active zones. Only `@@unique([zoneId, countryCode, matchType, matchValue, matchContext])` exists, which is per zone.

The risk: another admin puts a place in a second zone, the price of that place changes silently, and nobody can tell why.

Confirm each point against current `main` before designing: the code may have moved.

## Proposal

Decision by the user, 2026-11-21: keep the possibility of a different price for an LGA inside a state, but make it visible and impossible to do by accident.

1. **One place, one zone.** A state (`ADMIN1`) or an LGA (`ADMIN2`) can be in at most one **active** zone. A second one is refused with 409 and a stable code (for example `SHIPPING_PLACE_ALREADY_IN_ZONE`) that names the zone. Enforced by the database as well as the service (partial unique index on active rules and areas, or an equivalent the design review chooses; a rule on an inactive zone does not count). Concurrent writes must not both succeed.
2. **A fixed order instead of a priority.** The LGA wins over its state, always. The match order is decided by the kind of place (most specific first), not by an editable number. The resolver stops sorting zone rules by `priority`.
3. **The admin no longer sees or edits a priority for zone rules.** Remove the field from the rule form and the rule list, and from the rule DTOs (the project is not in production, so no compatibility layer). The column stays unless the design review finds a reason to drop it.
4. **Exceptions are visible, and computed, never typed.** On the zone screen, an LGA whose state is in another zone carries a label such as "Exception: the state of Lagos is in zone Lagos". On the zone that holds the state, a line says "1 LGA has a different price (Lagos Island, zone Île de Lagos)". Derived from the data, so it cannot go stale.
5. **Adding an exception asks for a confirmation.** Adding an LGA to a zone other than its state's shows "This LGA will have a different price from the rest of its state. Confirm?". The API refuses it unless the request carries an explicit acknowledgement (same pattern as `SHIPPING_COVERAGE_WOULD_BE_LOST` in `shipping-admin.service.ts`).
6. **Existing data.** The project is not in production. A migration or script lists any place already in two active zones and the design review decides whether to refuse the migration or deactivate the duplicate, never to pick one silently.
7. Update `docs/pricing-strategy.md` (shipping step) and `docs/runbooks/shipping-zone-coverage.md` (how to make an exception, what the labels mean).

Rejected alternatives:

- No exception at all (an LGA is always in its state's zone): simpler, but the client then cannot price one LGA differently.
- A free-text note typed by the admin: it goes stale as soon as someone moves the LGA.
- Keeping the priority and warning on ties: it still lets two admins contradict each other.

## Invariants

- An address matches at most one active zone, so the same address always gets the same fee.
- An LGA in a zone different from its state's is always an acknowledged, visible exception.
- Deactivating a zone, a state or an LGA keeps the existing refusals (`SHIPPING_ADDRESS_NOT_COVERED`, `ADDRESS_STATE_NOT_DELIVERABLE`) and the coverage-loss guard.
- Orders already placed keep the shipping fee they were created with.
- Schema changes go through `prisma migrate dev`, never hand-written.

## Implementation plan

1. Start `codex/ttw-242-make-shipping-zone-places-unambiguous` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing (schema and admin privileges, risk High).
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps: database constraint and migration, service refusals, resolver order, DTOs, admin screen labels and confirmation. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate`.
7. Run the gates, record exact results below, and obtain the independent review for this risk level, with a security review for the admin routes.

## Test and observability plan

- Unit: the resolver picks the LGA zone over the state zone without any priority; a state and an LGA created through either route never tie.
- Integration/e2e, real Postgres: a second active zone for the same state or LGA is refused; two concurrent creations leave exactly one; an exception without acknowledgement is refused and with it accepted; deactivating a zone frees its places; the coverage-loss guard still works.
- Admin: the exception label and the confirmation appear; the priority field is gone from the rule form; a Playwright journey creates a state zone, then an LGA exception.
- Logs, metrics, traces, and alerts: audit entry for every rule or area change as today; no addresses or personal data in logs.

## References

- `apps/api/src/shipping/shipping-destination-resolver.service.ts` — rule matching and order.
- `apps/api/src/shipping/shipping-admin.service.ts` — areas, rules, priority 100/200, coverage-loss guard.
- `apps/api/prisma/schema.prisma` — `ShippingZoneRule`, `ShippingZoneArea`.
- `apps/admin/app/admin/shipping/zones/[id]/page.tsx` — rule form and zone screen.
- `docs/runbooks/shipping-zone-coverage.md` — admin handover.
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A state or LGA cannot be in two active zones, from the API or the admin, even under concurrent requests.
- [ ] The LGA wins over its state without any priority setting.
- [ ] An LGA exception is labelled on both zone screens and needs a confirmation to create.
- [ ] The priority field is gone from the zone rule form, DTOs and list.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Priority between several rates of one zone → TTW-243.
- Rules by city or postal code (`CITY`, `POSTAL_CODE`, `POSTAL_PREFIX`): the design review checks whether the admin offers them and records what to do; they are not changed here unless they break the invariant above.
- Creating states and LGAs: they come from `prisma db seed`. Checking that the production release runs that seed is a separate point to verify.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
