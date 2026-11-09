# TTW-194 — Refuse a deactivated state when an address is saved

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

Found by the independent review of TTW-087 (finding 4). `GET /v1/geo/states` lists only active states (`apps/api/src/geo/geo.service.ts`), but `AddressNormalizationService.resolveState` (`apps/api/src/shipping/address-normalization.service.ts`) matches any `GeoState` row, active or not.

When an admin deactivates a state, the checkouts stop offering it, yet a direct API call (`POST` or `PATCH /v1/users/addresses` with that state name or code) is still accepted and resolved. The server and the list disagree on what a "known" state is, which undermines the TTW-087 rule that a saved Nigerian address carries a known state.

## Proposal

- Make `resolveState` match active states only, so a deactivated state is "unknown" and is refused with the existing `ADDRESS_STATE_UNKNOWN` (400) on create and on an edit that changes the state.
- Settle in the design review what happens to addresses already saved with a state that is deactivated later: they should keep loading, and an edit that does not change the state should keep working, as for any saved unknown state (TTW-087). The checkouts and settings form already ask the customer to pick a listed state.
- Check the other readers of `GeoState` that should or should not filter on `isActive`: `ShippingAdminService.listStates`/`listLgas` (admin), the shipping destination resolver, and the LGA lookup in `resolveLga`.

## Invariants

- A new address or a state change can only name an active state.
- A saved address with a later-deactivated state still loads and can be edited on other fields.
- Admin screens that must show deactivated states keep showing them.

## Implementation plan

1. Start `codex/ttw-194-refuse-a-deactivated-state-on-addresses` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below (High risk) before implementing.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit: `resolveState` ignores an inactive state; create and a state-changing edit are refused with `ADDRESS_STATE_UNKNOWN`; an edit that leaves a saved deactivated state untouched passes.
- Integration on real Postgres: deactivate a state, then POST an address naming it by name and by code (400), and PATCH another field of an address already saved with it (200).
- Logs, metrics, traces, and alerts: nothing new. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/shipping/address-normalization.service.ts` — `resolveState`.
- `apps/api/src/geo/geo.service.ts` — active-only list.
- `docs/tickets/ttw-087-offer-states-and-lgas-at-checkout.md` — origin.
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.

## Acceptance criteria

- [ ] The API refuses an address that names a deactivated state, by name or by code.
- [ ] A saved address with a later-deactivated state still loads and can be edited on other fields.
- [ ] Required quality gates pass, with evidence recorded below.
- [ ] Contracts and docs are updated where applicable.

## Out of scope

- Clearing a saved LGA → TTW-193.
- An LGA that contradicts the state → TTW-186.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
