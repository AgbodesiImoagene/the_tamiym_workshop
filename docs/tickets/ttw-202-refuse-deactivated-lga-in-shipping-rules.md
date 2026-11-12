# TTW-202 — Refuse a deactivated LGA in shipping rules, areas and address linking

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Standard\
**Blocked by:** None (TTW-200 is merged in `main`)\
**Blocks:** None

## Background

Found by the review of TTW-200. TTW-200 makes `ShippingAdminService` (`apps/api/src/shipping/shipping-admin.service.ts`) refuse a new shipping rule or legacy area that names a deactivated **state**. A deactivated **LGA** (`GeoLga.isActive = false`) is still accepted: the LGA lookups in `normalizeRuleInput` (ADMIN2) and `createArea` do not check `isActive`.

Customer-facing lists (`GeoService`) offer active LGAs only, so a rule for a deactivated LGA is one that customers cannot pick. Unlike states, address normalization (`resolveLga` in `apps/api/src/shipping/address-normalization.service.ts`) does not check `isActive` on LGAs either, so first confirm what an address naming a deactivated LGA does today.

Confirm against current `main` before designing: the code may have moved.

## Proposal

- Refuse a new ADMIN2 rule or LGA area whose LGA is deactivated, with a clear 400, in the same way TTW-200 does for states (existing rules stay editable; moving a rule to a deactivated LGA is refused).
- Settle in the design review whether address normalization should also treat a deactivated LGA as unknown (a saved address keeps loading and stays editable), or whether that is a separate ticket. Do not change addresses without recording the decision. Recommendation: keep this ticket on the admin writers, and open a ticket for addresses if the review finds a gap.
- No schema change expected. Update Swagger only if the error response changes.

## Invariants

- A new rule or area can only name an active LGA of an active state.
- Existing rules for an LGA deactivated later are not deleted and stay editable.

## Implementation plan

1. Start `codex/ttw-202-refuse-deactivated-lga-in-shipping-rules` from current `main`, in its own worktree. Move this file into it and add the ticket rows to `docs/tickets/README.md` and `docs/tickets/ROADMAP.md`.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below (Standard) before implementing.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit (addresses): `address-normalization.service.spec.ts` — a deactivated LGA is not linked on create (id, text) or on a move; an active one is; a saved link is kept when the edit does not touch the LGA. Integration: `address-deactivated-lga.e2e-spec.ts`.
- Unit: an ADMIN2 rule and an LGA area for a deactivated LGA are refused; an active LGA still works; an existing rule for a deactivated LGA stays editable.
- Integration on real Postgres: deactivate an LGA, then POST the rule and the area through the admin routes (400); an existing rule is untouched.
- Logs, metrics, traces, and alerts: nothing new.

## References

- `apps/api/src/shipping/shipping-admin.service.ts` — rule and area writers, LGA lookups.
- `apps/api/src/shipping/address-normalization.service.ts` — `resolveLga`.
- `docs/tickets/ttw-200-refuse-deactivated-state-in-shipping-rules.md` — origin; same pattern for states.
- `docs/runbooks/shipping-zone-coverage.md` — update if it describes the old behaviour.

## Acceptance criteria

- [x] The API refuses a new rule or area that names a deactivated LGA.
- [x] Existing rules are unchanged and stay editable.
- [x] Required quality gates pass, with evidence recorded below.
- [x] Contracts and docs are updated where applicable.

## Out of scope

- Marking deactivated entries in the admin picker → TTW-201.

## Design review

Standard risk. Confirmed on current code (2026-11-12, base `main` 3558f81, which contains TTW-199 and TTW-200).

Finding confirmed:

1. `normalizeRuleInput`, ADMIN2 branch: `geoLga.findFirst` filters by state and id/name only, no `isActive`. Gap.
2. `createArea` with `lgaId`: same `geoLga.findFirst`, no `isActive`. Gap.
3. `updateRule` reuses `normalizeRuleInput` with the existing rule. A plain check would block editing a rule whose LGA was deactivated later. Design: same as TTW-200. The LGA check (and the state check) is skipped only when the target (country, match type, LGA id, state code) is unchanged. Moving a rule to a deactivated LGA is refused.
4. `listLgas`, `createZone`, `updateZone`: untouched (TTW-199 keeps deactivated LGAs visible to admins).
5. Address normalization: `resolveLga` (`address-normalization.service.ts`) has no `isActive` check, whereas `resolveState` returns null for a deactivated state (TTW-194). So an address naming a deactivated LGA is still saved with that `lgaId`. **Decision (user, 2026-11-13): fix it in this ticket.** `resolveLga` now treats a deactivated LGA as unknown (post-check on the row, like the explicit-code path of `resolveState`): a new or changed address is not linked to it (`lgaId` null, the text is kept, no error, since an unknown LGA was never refused, unlike an unknown state). A saved address keeps the `lgaId` it already has, because an edit that does not change the LGA keeps the saved id (TTW-186), so it still loads and stays editable. No schema or OpenAPI change.

Design points: the check reads `isActive` on the returned LGA row (not a `where` filter) so "LGA not found" and "LGA is deactivated" stay distinct (400 `LGA <name> is deactivated`). The state check runs first, so a deactivated state keeps the TTW-200 message. No schema, DTO, OpenAPI, migration or log change.

Threat/concurrency: admin-only routes; an LGA deactivated between the check and the insert leaves one rule that never matches, same as a rule kept from before.

## Implementation reviews

- `/code-review` (high): 5 findings, no correctness bug. (1) runbook and (2) ticket evidence were still pending at review time: done. (3) addresses still accept a deactivated LGA: out of scope, see deviations. (4) no unit test for the by-name path: added. (5) the duplicated "unchanged target" condition comes from TTW-200: kept. Result: PASS. A second `/code-review` (high) on the whole branch: 5 findings, no bug. Title and index rows updated to mention addresses; a test for the resend case added; noted that `shipping-destination-resolver` still matches ADMIN2 rules by the LGA name text, so an address typed with a deactivated LGA name (lgaId null) can still be priced by an existing rule for it, which fits "existing rules keep working". The address change was added afterwards and covered by its own tests (full gates re-run below).

## Verification evidence

- Tests first, failing for the right reason: unit `shipping-admin.service.spec.ts` 3 failed / 21 passed (no error thrown for a deactivated LGA); e2e `shipping-rule-deactivated-lga.e2e-spec.ts` failed with `expected 400, got 500` (the rule was not refused; it hit the unique constraint).
- After the fix: `jest src/shipping` 5 suites / 75 tests passed (76 with the by-name test added after review); e2e `shipping-rule-deactivated-lga` + `shipping-rule-deactivated-state` + `shipping-zone-coverage` 3 suites / 7 tests passed on Postgres.
- `pnpm --filter api typecheck` OK; eslint on `src/shipping` and the new e2e OK; `pnpm openapi:check` passed; `pnpm docs:validate` passed.

## Completion summary

A new ADMIN2 rule or LGA area naming a deactivated LGA is refused with 400 `LGA <name> is deactivated` (the state check runs first). Existing rules stay editable; moving one to a deactivated LGA is refused. Runbook `shipping-zone-coverage.md` updated.

Deviations: the TTW-200 unit fixture `LGA` got `isActive: true` (it had no such field, so the new check read it as deactivated); no assertion changed.

Scope extended at the user's request (2026-11-13): `resolveLga` now ignores a deactivated LGA, so addresses are no longer linked to one. Tests first: 3 new unit tests failed (LGA linked), the e2e failed with the deactivated LGA's id returned instead of null; after the fix, `jest src/shipping` 81 passed, e2e `address-deactivated-lga` + `address-deactivated-state` + `address-lga-state` + `address-edit-state` + `address-clear-lga` + `shipping-rule-deactivated-lga` 6 suites / 7 tests passed, typecheck and eslint OK.
