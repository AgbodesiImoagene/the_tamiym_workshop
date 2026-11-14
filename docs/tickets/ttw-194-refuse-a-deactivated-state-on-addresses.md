# TTW-194 — Refuse a deactivated state when an address is saved

**Epic:** 8 — Client review delivery\
**Status:** Complete\
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

- [x] The API refuses an address that names a deactivated state, by name or by code.
- [x] A saved address with a later-deactivated state still loads and can be edited on other fields.
- [x] Required quality gates pass, with evidence recorded below.
- [x] Contracts and docs are updated where applicable.

## Out of scope

- Clearing a saved LGA → TTW-193.
- An LGA that contradicts the state → TTW-186.

## Design review

Confirmed against `main` 09239e1: `resolveState` matched any `GeoState` row; `GeoService` lists active states only.

- `resolveState` returns an active state only: text path filters `isActive: true` in the query; explicit-code path reads by code and treats `isActive === false` as unknown. A deactivated state is then "unknown", so the existing TTW-087 rule refuses it with `ADDRESS_STATE_UNKNOWN` (400) on create and on an edit that changes the state. No new branch.
- Saved address whose state is deactivated later: an edit that does not change the state (field absent, or same text or code resent) is not a state change (`isStateChange`), so it passes and keeps its `stateCode` and LGA, as for any saved unknown state.
- Other readers: `GeoService` already filters active; `resolveLga` inherits the resolved state code; the destination resolver reads `geoLga` by id only. No change.
- Choice: the explicit-code path keeps `findUnique` plus a post-check so the existing unit assertion on that call is not rewritten.
- No schema change, no migration, no OpenAPI change (same 400 code).

**Found, not fixed (out of scope):** `ShippingAdminService.listStates` already filters `isActive: true`, which contradicts the invariant "admin screens keep showing deactivated states". Admin shipping-rule creation (`shipping-admin.service.ts` ~342 and ~364) also accepts a deactivated state. Proposed as a separate ticket.

## Implementation reviews

`/code-review high` on the working tree: 4 findings. Fixed: ticket not updated (this section); e2e now checks refused POSTs create no row, covers a move by `stateCode`, and deletes its `ZT` state row.

**Independent security review (2026-11-14), High-risk gate:** read-only review by a fresh-context reviewer of the TTW-194 diff (`git diff 09239e1 e62668f`) and of the code around it. Result: **no finding at confidence 8/10 or more.** What it checked, with evidence in the code: ownership is enforced before normalisation (`addresses.service.ts`: 404 for a missing address, 403 when `address.userId !== userId`) and the change touches neither path; both `resolveState` branches refuse a deactivated state (explicit code returns null when `isActive === false`, text path filters `isActive: true`) and an explicit code takes priority over the text, so an active code cannot be paired with deactivated text; a non-NG address cannot move to NG carrying one (`existing.countryCode !== 'NG'` throws); accents and look-alike characters resolve to unknown because the comparison is an exact match ignoring case; `address.create` and `address.update` are called only in `addresses.service.ts` and both go through the normaliser (the only other writer is the privacy `updateMany` that writes `'REDACTED'`); the 400 is the existing generic `ADDRESS_STATE_UNKNOWN`, so it does not reveal that a state exists but is deactivated; an edit that leaves the state untouched is not a state change, so a saved address stays editable.

Not verified by the reviewer: the Prisma schema, the DTO validators (for example the length and format of `stateCode`) and the database collation.

LOW observations, not findings: (1) an edit that resends the saved deactivated `stateCode` with a different state text can store text that does not match the code; the same already happens for any saved state, only the owner can do it on their own address, and what downstream code trusts the text was not checked; (2) a saved address in a deactivated state still reaches shipping, because `shipping-destination-resolver.service.ts` filters on rule and zone `isActive`, not on `GeoState.isActive` (a business rule, not a security issue); (3) the check and the write are not atomic, so a state deactivated between them could still be saved (theoretical race, excluded). Kept as is, on purpose: the mixed filter in `resolveState` (see Design review, "Choice").

## Verification evidence

Run in the worktree `.claude/worktrees/ttw-194`:

- Tests first: 3 new unit tests failed (state accepted instead of refused); the e2e failed with `expected 400, got 201`.
- `pnpm --filter api test -- src/shipping/address-normalization.service.spec.ts`: 45 passed, existing tests untouched.
- `pnpm --filter api test -- --coverage`: 148 suites, 1413 tests passed.
- `pnpm --filter api test:e2e` on `address-deactivated-state`, `address-edit-state`, `address-lga-state`, `address-clear-lga`, `geo-reference`: all passed.
- `pnpm --filter api typecheck`: OK. `pnpm --filter api lint`: 0 errors (14 pre-existing warnings, none in touched files). `pnpm format:check`, `pnpm openapi:check`, `pnpm docs:validate`: OK.
- `pnpm coverage:diff`: 2/2 changed lines covered (floor 80%).
- Not run: browser journey (no UI change), `pnpm build`, full e2e suite.
- Merged into `main` with TTW-199 and TTW-200 (merge `8e64509`) and pushed. CI on `main` after the push: `CI` and `Playwright Comprehensive` success on `c89d85b` (run 43449191615); the address e2e specs also pass in every later green run (for example `f59b223`, `3d05c6c`, `d9b8f58`).

## Completion summary

The API now refuses a deactivated state on create and on a state-changing edit, by name and by code, while a saved address keeps loading and stays editable on other fields. Merged into `main` and pushed with TTW-199 and TTW-200; CI is green on `main`. The independent security review required for a High-risk ticket found nothing at confidence 8 or more (see Implementation reviews); three LOW observations are recorded there.
