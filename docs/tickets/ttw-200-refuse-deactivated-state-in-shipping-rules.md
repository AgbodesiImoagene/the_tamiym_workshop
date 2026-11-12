# TTW-200 — Refuse a deactivated state when a shipping rule is created

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

Found while working on TTW-194. A shipping rule maps a destination (a state for `ADMIN1`, an LGA of a state for `ADMIN2`) to a shipping zone. When an admin creates a Nigerian rule, `ShippingAdminService` (`apps/api/src/shipping/shipping-admin.service.ts`, ~lines 342 and 364) looks the state up with no `isActive` filter, so a deactivated state is accepted. The rule can never match a customer address, since TTW-194 refuses a deactivated state on addresses.

Confirm against current `main` before designing: the code may have moved, and there may be other writers of rules or zone areas (`ShippingZoneArea`) with the same gap.

## Proposal

- Refuse a rule whose state (`ADMIN1` match value, or `ADMIN2` `matchContext`) is deactivated, with a clear 400 error, as is already done for "State X not found".
- Decide in the design review what happens to rules that already exist for a state deactivated later: recommended is that they keep working and stay editable (no data migration).
- Recommendation to confirm with the user before coding: refuse, rather than allow a rule for a state nobody can pick.
- Update Swagger, DTO docs and `pnpm openapi:generate` if the error response changes.

## Invariants

- A new rule can only name an active state.
- Existing rules for a state deactivated later are not deleted or altered.

## Implementation plan

1. Start `codex/ttw-200-refuse-deactivated-state-in-shipping-rules` from current `main`, in its own worktree. Move this file into it and add the ticket rows to `docs/tickets/README.md` and `docs/tickets/ROADMAP.md`.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below (Standard) before implementing.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit: creating an `ADMIN1` rule and an `ADMIN2` rule for a deactivated state is refused; an active state still works.
- Integration on real Postgres: deactivate a state, then POST the rule through the admin route (400); an existing rule for that state is untouched.
- Logs, metrics, traces, and alerts: nothing new.

## References

- `apps/api/src/shipping/shipping-admin.service.ts` — rule creation, state lookups.
- `docs/runbooks/shipping-zone-coverage.md` — update if it describes the old behaviour.
- `docs/tickets/ttw-194-refuse-a-deactivated-state-on-addresses.md` — origin.

## Acceptance criteria

- [x] The API refuses a shipping rule that names a deactivated state.
- [x] Existing rules are unchanged.
- [x] Required quality gates pass, with evidence recorded below.
- [x] Contracts and docs are updated where applicable.

## Out of scope

- Showing deactivated states in the admin lists → TTW-199.

## Design review

Standard risk. Confirmed on current code (2026-11-12). Decision confirmed with the user: **refuse**.

Writers found in `ShippingAdminService`:

1. `createRule` → `normalizeRuleInput` (ADMIN1 state lookup, ADMIN2 parent-state lookup): no `isActive` check. Fixed.
2. `updateRule` → the same `normalizeRuleInput`, so a naive check would also block editing (priority, on/off) a rule that already exists for a state deactivated later. That breaks the invariant "existing rules stay editable". Design: `normalizeRuleInput` receives the existing rule; the state check is skipped only when the target (country, match type, state or LGA + state) is unchanged. Moving a rule to a deactivated state is refused.
3. `createArea` (legacy endpoint, also creates or re-enables a rule): same gap. Fixed with the same check.
4. `createZone`/`updateZone`: no state involved. `listLgas`/`listStates`: TTW-199, untouched.

Design points: the check reads `isActive` on the returned state row (not a `where` filter), so the "state not found" and "deactivated" errors stay distinct (400 `State <code> is deactivated`). No schema, DTO or OpenAPI change (400 is already documented), no migration, no new logs.

Threat/concurrency: admin-only routes. A state deactivated between the check and the insert leaves one rule that never matches; harmless and the same as a rule kept from before.

## Implementation reviews

- `/code-review` (high): 3 minor findings, no correctness bug. (1) duplicated "unchanged target" condition: kept as is, two short conditions. (2) moving a rule to another LGA of the same deactivated state is refused: intended ("new target"). (3) two missing unit tests (LGA area, switching a kept rule back on): added. Result: PASS.

## Verification evidence

- Tests first, failing for the right reason: unit `shipping-admin.service.spec.ts` 5 failed / 5 passed (no error thrown); e2e `shipping-rule-deactivated-state.e2e-spec.ts` failed with `expected 400, got 201`.
- After the fix: unit shipping folder 55 passed (before adding 2 tests); `shipping-admin.service.spec.ts` 12 passed; e2e `shipping-rule-deactivated-state` + `shipping-zone-coverage` 2 suites / 6 tests passed on Postgres.
- `pnpm --filter api typecheck` OK; eslint on `src/shipping` and the new e2e OK; `pnpm openapi:check` passed; `pnpm docs:validate` passed.
- Full `pnpm test`: api 149 suites / 1419 tests passed, app 8 suites / 66 tests passed.

## Completion summary

A new shipping rule (ADMIN1 or ADMIN2) or legacy area for a deactivated state is refused with 400 `State <code> is deactivated`. Existing rules are untouched and stay editable (priority, on/off); moving one to another deactivated state is refused. Runbook `shipping-zone-coverage.md` updated.

Deviations: the ticket named only rule creation; the same gap existed in `createArea` and `updateRule`, both covered. Out of scope, to report: a deactivated **LGA** (`GeoLga.isActive`) is still accepted by rules and areas.
