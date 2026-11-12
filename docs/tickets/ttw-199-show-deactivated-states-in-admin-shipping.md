# TTW-199 — Show deactivated states in the admin shipping lists

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

Found while working on TTW-194. TTW-194 states the invariant "admin screens that must show deactivated states keep showing them", but `ShippingAdminService.listStates` (`apps/api/src/shipping/shipping-admin.service.ts`, ~line 45) filters `where: { isActive: true }`, and `listLgas` filters `isActive: true` on LGAs. It is called by `apps/api/src/admin/admin-shipping.controller.ts`. An admin therefore cannot see a state that was deactivated.

Confirm against current `main` before designing: check who consumes these routes (`apps/admin`), whether the response exposes `isActive`, and whether any route can reactivate a state. The code may have moved.

## Proposal

- Make the admin state list (and, if the design review agrees, the admin LGA list) return deactivated rows too, with `isActive` in the response so the console can mark them.
- Keep `GET /v1/geo/states` (customer-facing, `GeoService`) active-only. Do not change it.
- Update DTOs, Swagger, `docs/openapi/openapi.json` and `packages/types` through `pnpm openapi:generate`.
- Do not invent an admin screen or a reactivation flow. If the console needs one, record it in the design review and propose a ticket.

## Invariants

- The customer-facing lists stay active-only.
- Admin routes keep their existing `@Roles(...)` protection.

## Implementation plan

1. Start `codex/ttw-199-show-deactivated-states-in-admin-shipping` from current `main`, in its own worktree. Move this file into it and add the ticket rows to `docs/tickets/README.md` and `docs/tickets/ROADMAP.md`.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below (Standard) before implementing.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit: the admin list returns an inactive state and flags it; the public geo list still hides it.
- Integration on real Postgres: deactivate a state, then call the admin route (listed, `isActive: false`) and `GET /v1/geo/states` (absent).
- Logs, metrics, traces, and alerts: nothing new.

## References

- `apps/api/src/shipping/shipping-admin.service.ts` — `listStates`, `listLgas`.
- `apps/api/src/admin/admin-shipping.controller.ts` — routes.
- `apps/api/src/geo/geo.service.ts` — public active-only list.
- `docs/tickets/ttw-194-refuse-a-deactivated-state-on-addresses.md` — origin.

## Acceptance criteria

- [x] The admin state list includes deactivated states and marks them.
- [x] The public geo list is unchanged (active only).
- [x] Required quality gates pass, with evidence recorded below.
- [x] Contracts and docs are updated where applicable.

## Out of scope

- Refusing a deactivated state when a shipping rule is created → TTW-200.
- A new admin screen or a reactivation flow, unless the design review shows it already exists.

## Design review

Standard risk, recorded before implementation.

**Finding confirmed on current code.** `ShippingAdminService.listStates` filtered `where: { isActive: true }` and `listLgas` filtered `isActive: true` on LGAs (`apps/api/src/shipping/shipping-admin.service.ts`). The routes are `GET /v1/admin/geo/states` and `GET /v1/admin/geo/states/:code/lgas` (`AdminShippingController`, class-level `@Roles(UserRole.ADMIN)`).

**Facts checked.**

- The routes return raw Prisma rows with no response DTO, so `isActive` is already in each row and the OpenAPI entries only say "List of states". Removing the filter changes the data, not the contract: no DTO, Swagger or `packages/types` change, and `pnpm openapi:generate` is not needed (`pnpm openapi:check` confirms no drift).
- Only consumer: the zone detail page (`apps/admin/app/admin/shipping/zones/[id]/page.tsx`, via `apps/admin/lib/shipping.ts`), which fills the State and LGA selects used to add an area to a zone.
- No admin route reactivates a state or an LGA (the admin controller only reads geo data). Nothing else writes `isActive` on states except the e2e seed.

**Decision.**

- `listStates`: return all states. Sorting is unchanged.
- `listLgas`: also return deactivated LGAs. Reason: an LGA deactivated on its own is the same blind spot, and a state's deactivated LGAs would otherwise stay invisible for a deactivated state. The 404-less empty list for an unknown state is unchanged.
- `GeoService` (customer routes) is untouched.

**Risk found, outside this ticket.** The zone-area picker will now offer deactivated states and LGAs with no mark, because the console type `GeoState`/`GeoLga` has no `isActive` and the page does not use it. `createArea` still accepts them until TTW-200 (refuse a deactivated state in shipping rules) lands. Follow-up proposed: a console ticket to mark or disable deactivated entries in the picker, and to add `isActive` to the console types. Not done here (the ticket forbids inventing a screen).

## Implementation reviews

- Independent review (`/code-review`, high), run on the uncommitted diff: no blocking finding. Three notes:
  1. The picker shows deactivated states unmarked until the console follow-up and TTW-200 land. Recorded above, accepted.
  2. The unit test checks the shape of the Prisma `where` on a mock. Kept as a cheap guard. The e2e test proves the behaviour on real Postgres.
  3. `listLgas` returns `[]` for an unknown state while the public route answers 404. Existing behaviour, out of scope.

## Verification evidence

Tests written first, seen failing for the right reason (run before the change):

- `pnpm --filter api exec jest src/shipping/shipping-admin.service.spec.ts`: 2 failed, 1 passed (`where` still contained `isActive: true`).
- `pnpm --filter api test:e2e -- test/admin-geo-deactivated.e2e-spec.ts`: 2 failed, 2 passed (deactivated state and deactivated LGA missing from the admin lists).

After the change:

- `pnpm --filter api test:e2e -- test/admin-geo-deactivated.e2e-spec.ts`: 4 passed.
- Neighbouring e2e (`admin-geo-deactivated`, `geo-reference`, `shipping-zone-coverage`, `address-lga-state`, `address-edit-state`, `address-clear-lga`): 6 suites, 19 tests passed.
- `pnpm --filter api test`: 149 suites, 1410 tests passed.
- `pnpm --filter api typecheck`: no error.
- `pnpm --filter api lint`: 0 errors, 14 warnings, all pre-existing (none in the changed files, checked with eslint on them).
- `prettier --check` on the changed files: clean.
- `pnpm openapi:check`: passed (no drift). `pnpm docs:validate`: passed.

Not verified: no browser run of the console picker (no console change was made).

## Completion summary

The admin geo lists (`listStates`, `listLgas`) now return deactivated states and LGAs with their `isActive` flag. The customer lists are unchanged and still active-only (covered by the e2e test). Files: `shipping-admin.service.ts`, new `shipping-admin.service.spec.ts`, new `test/admin-geo-deactivated.e2e-spec.ts`, ticket rows in README and ROADMAP.

Deviation from the plan: no OpenAPI/types regeneration, because the response has no DTO and already carried `isActive`.

Remaining: console follow-up (mark or disable deactivated entries in the zone-area picker, add `isActive` to console types), to be ticketed. TTW-200 refuses a deactivated state when a rule is created.
