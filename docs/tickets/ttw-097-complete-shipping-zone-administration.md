# TTW-097 — Complete shipping zone and rate administration

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-098

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 8.2, Shipping zones cannot be corrected** (Medium, P1, 6–10 h, status "To do"): A rate cannot be edited or deleted, a state cannot be removed from a zone, a zone cannot be deleted.

## Proposal

- Wire the admin screens to the existing `PATCH` and `DELETE` routes for rates, rules and zones in `admin-shipping.controller.ts`.
- Removing a state or LGA from a zone has no route today: add it.
- Confirm before deleting anything, and audit the changes.

## Invariants

- Editing a rate never changes an existing order.
- Admins are warned before a change leaves a state uncovered.

## Implementation plan

1. Start `codex/ttw-097-complete-shipping-zone-administration` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: update and delete with authorization.
- Playwright: fix a rate and remove a state from a zone.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `PATCH/DELETE /v1/admin/shipping-rates/{id} not called` — row 8.2
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] An admin can correct every zone and rate mistake from the screen.
- [x] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [x] Swagger, shared contracts, migrations and docs are updated where applicable.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Recorded after the first implementation pass (the order the workflow asks for was not followed: design was settled while reading the code).

- **Finding confirmed on `main`:** `PATCH/DELETE` already existed for zones, rules and rates but the screen did not call them; there was no route to remove an area, and no audit.
- **Area removal:** `DELETE /v1/admin/shipping-zones/:zoneId/areas/:areaId` deletes the area and the rule `createArea` mirrors from it (ADMIN1 by state code, ADMIN2 by LGA id and state), in one transaction. Known limit: a rule an admin created by hand with the same match is removed too.
- **Coverage warning:** every PATCH/DELETE of zone, rule, rate and area runs in a transaction. The set of covered states (active zone, active ADMIN1/ADMIN2 NG rule, at least one rate the quote engine can use: active, INTERNAL, NGN, STANDARD, inside its effective window) is computed before and after. If a state drops out, the change rolls back with `409 SHIPPING_COVERAGE_WOULD_BE_LOST` and the list of states; `?acknowledgeCoverageLoss=true` confirms. Known limits: CITY/POSTAL rules are not counted, and an LGA-level rule counts its whole state as covered.
- **Audit:** `shipping.{zone,rule,rate,area}.{updated,deleted}` written right after the commit, outside the transaction and best-effort (`AuditService.log` swallows its own errors, and a failed insert inside the transaction would abort it; no PII).
- **Invariant 1:** orders keep a `shippingBreakdown` snapshot and have no foreign key to rates; proved by an e2e test (fee and total unchanged after editing then deleting the rate).
- **Not done:** a rule PATCH from the screen (rules can only be deleted there); the API route exists.

## Implementation reviews

`/code-review` (high) on the working tree: 10 findings. Fixed: rate effective window in the coverage guard; zone deletion no longer refetches a 404; duplicated query helper; this ticket; concurrent delete now answers 404 (P2025 mapped); the audit row is written after the commit, outside the transaction; the coverage scans are skipped for changes that cannot alter coverage (name, fee, priority, delivery days); e2e state codes are unique per run and the audit rows are cleaned up.

Second, fresh-session review (FAIL, then fixed): the guard now only counts the rate `InternalZoneRateProvider` asks for (INTERNAL, NGN, STANDARD) and scans when a rate's service level, provider or currency changes; guarded changes take a Postgres advisory lock (`pg_advisory_xact_lock`) so two admins cannot each remove one of the last two rates; one clock for both scans; the zone form no longer resets on a refetch; the audit wording above. The lock is proved by an e2e test that holds it from another transaction and checks the deletion waits (it fails without the lock).

Third review (fresh session, PASS with 4 non-blocking findings), 1 to 3 fixed (a fourth review, PASS, no blocking finding, confirmed the fixes; it re-ran 245 unit tests, not the e2e or Playwright): `updateRate` and `updateRule` now read the row inside the transaction, after the lock, so a request that waited cannot write back a stale copy (for example an `isActive` another admin just changed) or audit a stale `before`; the lock is also taken for a confirmed change (`acknowledgeCoverageLoss=true`) that can affect coverage, so it waits for a guarded one (only the scans are skipped); the transaction has an explicit `maxWait` 5 s / `timeout` 15 s because it can queue behind the lock. Finding 4, not fixed: the guard does not use `ShippingDestinationResolver`, so its fallback to areas that have no rule is not modelled (same known limit as below).

Left as known limits, not fixed: the coverage model counts only ADMIN1/ADMIN2 rules, and an LGA rule counts its whole state as covered (a proper fix reuses `ShippingDestinationResolver`); removing an area also removes a hand-made rule with the same match, because rules carry no marker of who created them (without it, a legacy area removal would leave the state matching the zone).

## Verification evidence

- `pnpm --filter api test:coverage`: 163 suites, 1844 tests passed. `pnpm coverage:ratchet` passed. `pnpm coverage:diff`: 87/88 changed lines covered (98.86%).
- `pnpm test` (web 79, app 121, api 1815 before the extra specs): all passed.
- `pnpm --filter api test:e2e -- test/shipping-zone-admin-corrections.e2e-spec.ts` (real Postgres): 13/13 (re-run after the third-review fixes).
- `pnpm exec playwright test tests/e2e/admin/shipping-zone-corrections.comprehensive.spec.ts --project=setup --project=chromium-admin`: 3/3 (8 with setup).
- `pnpm lint` (0 errors, existing warnings only), `pnpm typecheck`, `pnpm format:check`, `pnpm openapi:check`, `pnpm docs:validate`, `pnpm playwright:validate`, `pnpm build`: passed.
- Not run: `pnpm audit:prod`, `pnpm migrations:check` (no migration), browsers other than Chromium.

## Completion summary

An admin can edit and delete rates, delete rules and zones, and remove a state or LGA from a zone from the zone page, with a confirmation and a warning before a state loses delivery. No schema change, no migration. Local commit only; nothing pushed.
