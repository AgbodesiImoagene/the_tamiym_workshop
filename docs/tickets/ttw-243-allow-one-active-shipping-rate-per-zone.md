# TTW-243 — Allow only one active shipping rate per zone and service

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-242\
**Blocks:** None

## Background

Raised by the user on 2026-11-21, after TTW-242. Today a zone can hold several active rates for the same service level and currency, and a `priority` number decides which one a customer pays:

- `InternalZoneRateProvider.quote` takes the first active rate of the zone, ordered by `priority` ascending then `createdAt` descending (`apps/api/src/shipping/internal-zone-rate-provider.service.ts`, around lines 39–50).
- Nothing stops an admin from creating a second active rate for the same zone, service level and currency (`ShippingAdminService.createRate`, `shipping-admin.service.ts:441`). The schema has only a plain index `@@index([zoneId, currency, isActive, priority])`.
- The admin screen shows and edits a "Priority" field on each rate (`apps/admin/app/admin/shipping/zones/[id]/page.tsx`, around lines 504 and 558).

Example: the zone "Lagos" has a rate of ₦2,500. An admin adds a second rate of ₦3,000 instead of editing the first. With equal priorities the newest wins. If someone once set a lower priority on the old rate, the old ₦2,500 keeps applying and the new rate is ignored, and nothing on screen says why.

Confirm each point against current `main` before designing: the code may have moved (TTW-242 touches the same service and screen).

## Proposal

Decision by the user, 2026-11-21: **a zone has one active rate per service level and currency. To change a price, the admin edits the existing rate. No scheduling by dates.**

1. **One active rate per zone, service level and currency.** Creating or reactivating a second one is refused with 409 and a stable code (for example `SHIPPING_RATE_ALREADY_ACTIVE`) that names the existing rate and tells the admin to edit it. Enforced by the database with a partial unique index on `(zone_id, provider, service_level, currency) WHERE is_active`, created through `prisma migrate dev`. Concurrent writes must not both succeed.
2. **The admin no longer sees or edits a priority on rates.** Remove the field from the rate form and list, and from the rate DTOs (the project is not in production, so no compatibility layer). The column stays unless the design review finds a reason to drop it.
3. **No dates in the admin.** The screen already does not offer `effectiveFrom` and `effectiveTo`. The API stops accepting them, and the quote stops filtering on them, so a rate is simply active or not. Design review decides whether to drop the two columns or leave them unused.
4. **Editing a rate changes the price for new quotes and orders only.** An order keeps the fee it was created with (frozen in `shippingBreakdown`, TTW-098). An audit entry records the amount before and after, as price changes do elsewhere (TTW-094).
5. **Existing data.** The project is not in production. A migration or script lists any zone that has two active rates for the same service and currency, and the design review decides whether to refuse the migration or deactivate the older one, never to pick one silently.
6. **Service level check.** The admin form has a free-text "Service level", but the quote only reads `STANDARD` (TTW-153, the express option, is the only planned use of another level). The design review decides whether to limit the field to known values so that a typo cannot create a rate no customer ever pays.
7. Update `docs/pricing-strategy.md` (shipping step) and `docs/runbooks/shipping-zone-coverage.md` ("to change a price, edit the rate").

Rejected alternatives:

- Keep the priority and warn on ties: it still lets two admins contradict each other.
- Allow dated rates that must not overlap: more flexible, but the user does not need scheduled changes and it adds an overlap rule to test and explain.

## Invariants

- A zone has at most one active rate for a given service level and currency, so the same address always gets the same fee.
- An order already created keeps its shipping fee when a rate is edited.
- Brackets (TTW-098) belong to their rate and are edited with it; the fee below the first bracket is still the flat fee.
- Deleting or deactivating the last rate of a state keeps the coverage-loss guard (`SHIPPING_COVERAGE_WOULD_BE_LOST`).
- Schema changes go through `prisma migrate dev`, never hand-written.

## Implementation plan

1. Start `codex/ttw-243-allow-one-active-shipping-rate-per-zone` from current `main`, in its own worktree, after TTW-242 is merged.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing (schema and admin privileges, risk High).
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps: partial unique index and migration, service refusals, quote without priority or dates, DTOs, admin screen. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate`.
7. Run the gates, record exact results below, and obtain the independent review for this risk level, with a security review for the admin routes.

## Test and observability plan

- Unit: the quote takes the only active rate; a deactivated rate is ignored; the service level and currency are read as before.
- Integration/e2e, real Postgres: a second active rate for the same zone, service and currency is refused (409, code names the existing rate); two concurrent creations leave exactly one; reactivating a rate while another is active is refused; editing a rate changes new quotes but not an existing order; the coverage-loss guard still works.
- Admin: the priority field is gone; creating a second rate shows the refusal message; a Playwright journey creates a zone, a rate with brackets, then edits its price.
- Logs, metrics, traces, and alerts: audit entry on every rate change with the amount before and after; no addresses or personal data in logs.

## References

- `apps/api/src/shipping/internal-zone-rate-provider.service.ts` — the quote reads the first rate by priority.
- `apps/api/src/shipping/shipping-admin.service.ts:441` — `createRate`, `:452` `updateRate`, `:528` `deleteRate`.
- `apps/api/prisma/schema.prisma` — `ShippingRate`.
- `apps/admin/app/admin/shipping/zones/[id]/page.tsx` — rate form and list.
- `docs/tickets/ttw-098-make-shipping-rates-weight-or-quantity-based.md` — brackets, frozen fee.
- `docs/tickets/ttw-242-make-shipping-zone-places-unambiguous.md` — same idea for the places of a zone.
- `docs/runbooks/shipping-zone-coverage.md` — admin handover.
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A zone cannot have two active rates for the same service level and currency, from the API or the admin, even under concurrent requests.
- [ ] The priority field is gone from the rate form, list and DTOs.
- [ ] Editing a rate changes the fee for new quotes and orders only.
- [ ] A rate is active or not, with no start or end date.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- The places of a zone (states, LGAs) → TTW-242.
- Express production and its delivery times → TTW-153.
- Scheduled price changes: not needed, per the user.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
