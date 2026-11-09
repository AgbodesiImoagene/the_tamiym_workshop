# TTW-185 — Drop the old state and LGA when an edited address names an unknown state

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High\
**Blocked by:** TTW-086\
**Blocks:** TTW-087, TTW-186

**State: Verified.** Merged into `main` at the owner's request (merge commit `57e4444`, change `716191e`, TTW-186 opened in `daaa283`) and pushed. On the merged `main` (with TTW-182), before the push: `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm openapi:check` passed. `pnpm test`: api 1341, app 45 and web 43 tests passed. The API e2e suites `address-edit-state`, `shipping-zone-coverage`, `pricing-quote` and `order-create-idempotency` passed (22 tests). GitHub CI run 42539469480 on `57e4444`: success, all 18 jobs (including Unit Tests, API Integration, Coverage, OpenAPI Contracts, Migration Baseline and Playwright Smoke). Playwright Comprehensive run 42539469547: success.

## Background

Found while working on TTW-086 (its independent review flagged it as out of scope). Same family as client-review row 5.6: a wrong address gives a wrong shipping fee.

`AddressNormalizationService.normalize` merges the edit with the saved address. When the edit's state does not resolve to a `GeoState` row, it keeps the saved code:

- `apps/api/src/shipping/address-normalization.service.ts:120` — `stateCode = resolvedState?.code ?? existing?.stateCode ?? null`.
- `apps/api/src/shipping/address-normalization.service.ts:121` — same for `lgaId`.
- `apps/api/src/shipping/address-normalization.service.ts:116` — the old state code is also used to look up the LGA.
- `apps/api/src/shipping/address-normalization.service.ts:243-245` — an explicit but unknown `stateCode` (for example `ZZ`) also returns `null`, so the old code is kept there too.

Journey: the customer checkout (`apps/app/app/dashboard/checkout/page.tsx:128`, `upsertPrimaryAddress`) and the settings form (`apps/app/components/customer-settings-form.tsx:153`) send a free-text `state` with no `stateCode` to `PATCH /v1/users/addresses/:id` (`apps/api/src/addresses/addresses.service.ts:117-121`). A saved Lagos address (`stateCode: LA`) edited to "Federal Capital Territory", "FCT" or "Abuja" keeps `stateCode: LA`. With the full geo seed the FCT row is named "Abuja Federal Capital Territory" (`apps/api/prisma/nigeria-lgas.curated.json:53-54`), so none of these spellings resolve; any typo of another state does the same. `ShippingDestinationResolver` then matches the Lagos ADMIN1 rule on `stateCode` (`apps/api/src/shipping/shipping-destination-resolver.service.ts:117-121`), and the order is priced at the Lagos rate.

Reproduced on the TTW-086 branch: a Lagos address edited to "Federal Capital Territory" was quoted ₦2,000 (Lagos rate) instead of being refused with `SHIPPING_ADDRESS_NOT_COVERED`. The normalization service is identical on `main` and on that branch (`git diff --stat main codex/ttw-086-reject-addresses-outside-shipping-zones -- apps/api/src/shipping apps/api/src/addresses` only lists `shipping.errors.ts`).

A related stale value: when the edit names a different, known state but no LGA, the old `lgaId` and `administrativeAreaLevel2` (for example Ikeja) stay on the address. An ADMIN2 rule without `matchContext` would still price it as Ikeja.

TTW-087 (state and LGA lists at checkout) does not close this on its own: lists only protect our own forms, and any API client can still send a free-text `state`. Its invariant "a saved address always carries a state known to the shipping rules" depends on this fix on the server.

## Proposal

In `AddressNormalizationService.normalize`, on update:

- If the request changes the state (it sends `state`, `administrativeAreaLevel1` or `stateCode`) and the value does not resolve, set `stateCode` to `null` instead of keeping the saved one. The address is then refused at quote time with `SHIPPING_ADDRESS_NOT_COVERED` (TTW-086) unless a rule matches its state name.
- If the resolved state differs from the saved one, do not keep the saved `lgaId` or `administrativeAreaLevel2` unless the request sends a new LGA that belongs to the new state.
- Look up the LGA only with the newly resolved state code when the request changes the state.
- Keep the saved values when the request does not touch the state (for example a phone-only edit).

Rejected for now: refusing the save with a 400 "unknown state". It would block customers until TTW-087 offers the lists, and the free-text "Abuja"/"FCT" spellings have no alias yet. TTW-087 can make the save strict once the lists exist.

## Invariants

- An edit that changes the state never leaves a `stateCode` or `lgaId` that the edit contradicts. (LGA-only edits → TTW-186.)
- An address whose state is unknown is never priced with another state's rate.
- An edit that does not touch the state keeps the saved `stateCode` and `lgaId`.
- Create behaviour is unchanged (it already stores `null` for an unknown state).

## Implementation plan

1. Start `codex/ttw-185-drop-stale-state-on-address-edit` from current `main` after TTW-086 is merged, in its own worktree.
2. Record the design review below, as `AGENTS.md` requires for High risk.
3. Write the tests first and show them failing for the right reason.
4. Change `normalize` as proposed. No schema, DTO or OpenAPI change expected.
5. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit (`apps/api/src/shipping/address-normalization.service.spec.ts`), failing on `main` today:
  - existing `{ stateCode: 'LA', lgaId: 'lga-ikeja' }`, input `{ state: 'Federal Capital Territory' }`, `geoState.findFirst` → `null`: expect `stateCode: null`, `lgaId: null`.
  - same with input `{ stateCode: 'ZZ' }`, `geoState.findUnique` → `null`: expect `stateCode: null`.
  - existing Lagos/Ikeja, input `{ state: 'Ogun' }` resolving to `OG`, no LGA: expect `stateCode: 'OG'`, `lgaId: null`, `administrativeAreaLevel2: null`.
  - existing Lagos/Ikeja, input `{ phone: '...' }` only: expect `stateCode: 'LA'`, `lgaId: 'lga-ikeja'` (no regression).
- Integration (`apps/api/test/`, real Postgres, production `AppModule`): save a Lagos address, `PATCH` it to "Federal Capital Territory", request a quote, expect `SHIPPING_ADDRESS_NOT_COVERED` instead of the Lagos rate. Same flow for an order creation.
- Failure, retry, and concurrency: none specific; the change is a pure merge rule.
- Logs, metrics, traces, and alerts: nothing new. No PII in logs.

## References

- `apps/api/src/shipping/address-normalization.service.ts:108-123` — merge rule.
- `apps/api/src/addresses/addresses.service.ts:117-121` — update path.
- `apps/api/src/shipping/shipping-destination-resolver.service.ts:117-121` — ADMIN1 match on `stateCode`.
- `apps/app/app/dashboard/checkout/page.tsx:128` — checkout sends free-text `state`.
- `docs/tickets/ttw-086-reject-addresses-outside-shipping-zones.md`, `docs/tickets/ttw-087-offer-states-and-lgas-at-checkout.md`.

## Acceptance criteria

- [x] Editing a saved address to an unknown state is refused at quote and order time with `SHIPPING_ADDRESS_NOT_COVERED`, never priced at the old state's rate.
- [x] Editing to a different known state without an LGA clears the old LGA.
- [x] Edits that do not touch the state keep the saved state and LGA.
- [x] Required quality gates pass, with evidence recorded below.
- [x] Docs updated where applicable (the TTW-086 policy, if it lists address rules).

## Out of scope

- State and LGA lists in the forms, and a strict 400 on unknown states → TTW-087.
- Aliases such as "FCT" or "Abuja" for the FC state → separate ticket if wanted.

## Design review

Recorded 2026-11-08, before implementation (High risk). Reviewed against the code on `main` at `f4133f2`.

- **Defect confirmed by reading.** `normalize` falls back to `existing.stateCode` and `existing.lgaId` when the edit's state does not resolve (`address-normalization.service.ts:116,120,121`); an explicit unknown `stateCode` returns `null` from `resolveState` (`:243-245`) and falls back the same way. `admin2Input` falls back to the saved `administrativeAreaLevel2` (`:103-106`), so a move to another known state keeps the old LGA name and id.
- **Deviation from the proposal: "sends" is not "changes".** The checkout (`apps/app/app/dashboard/checkout/page.tsx:128`) and the settings form resend the whole address, with the same `state`, on every save. If any `state` in the request counted as a change, an address whose saved state text does not resolve but whose `stateCode` is valid (set by Google Places or an explicit `stateCode`) would lose its code on every checkout and be refused. Rule adopted: the state changes only when
  - an explicit `stateCode` is sent and differs (case-insensitive) from the saved `stateCode`, or
  - an `administrativeAreaLevel1` or `state` text is sent and matches (trimmed, case-insensitive) neither the saved `administrativeAreaLevel1` nor the saved `state`.
- **When the state changes:** `stateCode = resolvedState?.code ?? null`; the LGA is looked up with the new code only. When the resolved code differs from the saved one (including `null`), the saved `lgaId` and `administrativeAreaLevel2` are dropped; only an LGA sent in the request and belonging to the new state is kept (`resolveLga` already filters on `stateCode`).
- **When it does not change:** current behaviour, unchanged (phone-only edit, resent identical state).
- **Create:** unchanged (`existing` is `null`).
- **Scope:** one service file, unit tests, one new integration spec, one sentence in `docs/runbooks/shipping-zone-coverage.md`. No schema, DTO, OpenAPI or front-end change.
- **Security / data:** no new input, no new log, no PII. The fix can only clear codes, never set one the request did not resolve, so it cannot widen which rate applies.
- **Concurrency / retry:** none; pure merge rule inside the existing update.
- **Regression risk:** saved addresses with an unresolvable state text are protected by the "same text is no change" rule; a new unknown text is refused at quote time, which is the intended behaviour (TTW-086).

## Implementation reviews

### Review 1 — independent implementation review (fresh subagent, 2026-11-08)

Charter: merge-rule correctness against the four invariants, edge cases (explicit `stateCode` vs text, precedence, empty strings, case and whitespace, saved `stateCode` null, explicit `lgaId` from another state, non-NG country), checkout resend regression, test quality, security. Read-only; ran the unit spec (11/11 at the time).

**Verdict: PASS**, nothing blocking. Findings and outcome:

1. Non-blocking, existing bug. `resolveLga` looks up an explicit `lgaId` with no state filter when `stateCode` is null (`address-normalization.service.ts`, `resolveLga`). An API client sending `lgaId` on an address whose state is unknown and unchanged (or on create) can still store an LGA of another state, and an ADMIN2 rule on that LGA id with no `matchContext` would price it. The app forms never send `lgaId`. The fix touches create, so it is **moved to TTW-186**.
2. Non-blocking. An edit that changes only the LGA text to an unknown name keeps the saved `lgaId` (same state, so invariant 2 holds, but invariant 1 read literally does not). **Moved to TTW-186**; invariant 1 is scoped to state changes in this ticket.
3. Nit. A country-only edit keeps the saved `stateCode`/`lgaId`. No pricing impact (rules filter on `countryCode`). Not changed.
4. Nit. When `administrativeAreaLevel1` and `state` are both sent, `administrativeAreaLevel1` decides, as in `resolveState`. No front end sends both. Not changed.
5. Nit, test gaps. **Fixed**: added unit tests "clears the saved LGA when an explicit stateCode moves to another known state", "keeps the saved LGA when a different text resolves to the same state" and "refuses an old-state lgaId sent with a new known state" (the last one uses a mock that honours `where`, and the tests assert the LGA lookup arguments).
6. Nit, outside this change. CITY and ADMIN2 name rules without `matchContext` match the customer's own text whatever the state. Zone-configuration matter, noted for TTW-087.

The reviewer also confirmed that the `null === null` hole it was about to report was already closed by the `keepSavedLga` tightening (test "drops a saved LGA that had no state code when the edit names another unknown state").

## Verification evidence

Environment: own test database `tamiym_workshop_test_ttw185` (created with `pg`, `prisma migrate deploy`, `pnpm --filter api seed:e2e`), `REDIS_DB=12`. Branch `codex/ttw-185-drop-stale-state-on-address-edit` from `main` at `f4133f2`.

**Tests first, failing for the right reason (before the fix):**

- `pnpm exec jest src/shipping/address-normalization.service.spec.ts` → `Tests: 3 failed, 6 passed, 9 total`. The three failures received the stale values: `"stateCode": "LA"`, `"lgaId": "lga-ikeja"`, `"administrativeAreaLevel2": "Ikeja"` (unknown state text, unknown explicit `ZZ`, and move to `OG`).
- Added while implementing, each shown failing first: "ignores an explicit lgaId when the edited state is unknown" (`+ "lgaId": "lga-ikeja"`), "drops a saved LGA that had no state code when the edit names another unknown state" (`+ "lgaId": "lga-ikeja"`, `+ "administrativeAreaLevel2": "Ikeja"`).
- `test/address-edit-state.e2e-spec.ts` on the old code → `Tests: 1 failed, 1 passed`. After `PATCH` to "Atlantis …" the quote answered `status: 200, shippingFee: 2000` (Lagos rate) instead of `400 SHIPPING_ADDRESS_NOT_COVERED`.

**After the fix:**

- Unit, normalization spec: `Tests: 14 passed, 14 total`.
- Unit, full API: `pnpm --filter api test` → `Test Suites: 148 passed, 148 total`, `Tests: 1341 passed, 1341 total`, exit 0.
- Integration, full API: `pnpm --filter api test:e2e` → `Test Suites: 27 passed, 27 total`, `Tests: 156 passed, 156 total`, exit 0 (run before the last `keepSavedLga` tightening and the review's extra unit tests); then `address-edit-state.e2e-spec.ts` + `shipping-zone-coverage.e2e-spec.ts` on the final code → `Tests: 7 passed, 7 total`, exit 0.
- `pnpm --filter api typecheck` → exit 0. `pnpm --filter api lint` → exit 0, 0 errors, 14 existing warnings, none in touched files. `prettier --check` on touched files → clean.
- Playwright, after `seed:e2e`: `PLAYWRIGHT_API_URL=http://localhost:3011 PORT=3011 pnpm exec playwright test tests/e2e/app/checkout-shipping-coverage.spec.ts --project=setup --project=chromium-app` → `4 passed (42.5s)` (3 auth setup + "refuses an uncovered state, keeps the cart, then quotes a covered state"). The API ran on 3011 because port 3001 was held by an unrelated local project; web/app/admin were built with `NEXT_PUBLIC_API_URL=http://localhost:3011/v1`.

New tests:

- `apps/api/src/shipping/address-normalization.service.spec.ts`, `describe('normalizeForUpdate state changes')`: 12 cases (unknown text, unknown explicit code, explicit `lgaId` with unknown state, saved LGA with no code, move to a known state without LGA, with an LGA of the new state, with an LGA of the old state, explicit code move, phone-only edit, checkout resend of an unresolvable text, different text resolving to the same code, same explicit code resent).
- `apps/api/test/address-edit-state.e2e-spec.ts` (production `AppModule`, real HTTP `POST`/`PATCH /v1/users/addresses`, `POST /v1/orders/quote`, `OrdersService.create`): "refuses the quote and the order once a Lagos address is edited to an unknown state" (also checks no order row and no reserved stock) and "keeps the Lagos rate when the checkout resends the same address with a new phone".

## Completion summary

Done:

- `AddressNormalizationService.normalize` (`apps/api/src/shipping/address-normalization.service.ts`): new `isStateChange`. On a state change, `stateCode` is the newly resolved code or `null`, never the saved one; the saved `lgaId` and `administrativeAreaLevel2` are kept only when the resolved code is non-null and equal to the saved code; the LGA lookup uses the new code only, and is skipped when the new state is unknown. Edits that do not change the state, including the checkout resending the same state text, behave as before. Create unchanged.
- Runbook `docs/runbooks/shipping-zone-coverage.md`: what `state=none` means and the edit rule.
- No schema, DTO, OpenAPI, shared-contract or front-end change; no new log or metric.

Deviation from the plan: "sends a state" was narrowed to "sends a different state" (see Design review), and two extra edge cases (explicit `lgaId` with an unknown state; saved LGA without a code) were added.

Remaining / follow-ups, moved to [TTW-186](ttw-186-refuse-lga-outside-address-state.md):

- Explicit `lgaId` with a null `stateCode` is still accepted without a state filter on create and on edits that keep an unknown state (review finding 1). Proposed fix: refuse it or derive `stateCode` from the LGA row. → TTW-186.
- An LGA-only edit to an unknown LGA name keeps the saved `lgaId` (review finding 2). → TTW-186.
- Aliases "FCT"/"Abuja" for FC remain out of scope.
