# TTW-219 — Keep the default address when a save is refused, and normalise the country code

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

Found by the independent security review of TTW-216 (findings C3 and O3, 2026-11-14). Both predate TTW-216 and are outside its diff, so they were recorded and not fixed there. Confirm each against current `main` before designing: the code may have moved, and the first step must show whether each defect is real.

### 1. A refused address save can leave the customer without a default address

In `apps/api/src/addresses/addresses.service.ts`, `create` (about line 27) and `update` (about line 110) clear the user's other default address with `updateMany({ isDefault: false })` **before** the address is normalised, and outside a transaction. Normalisation can refuse the request (`ADDRESS_STATE_UNKNOWN` since TTW-087 and TTW-194, `ADDRESS_STATE_MISMATCH` since TTW-216). A refused create or edit with `isDefault: true` therefore leaves the user with no default address, and the old one is not restored.

### 2. A country code in full-width characters skips the state checks

`resolveCountryCode` in `apps/api/src/shipping/address-normalization.service.ts` upper-cases the sent `countryCode` and compares it with `'NG'`. A value such as the full-width letters "ＮＧ" is not `'NG'`, so the address is treated as non-Nigerian and **every Nigerian state check is skipped**: unknown state (TTW-087), deactivated state (TTW-194), mismatch (TTW-216). Whether the request reaches this code depends on the DTO validators (`create-address.dto.ts` has `countryCode?: string`; the reviewer did not read the global `ValidationPipe`). The TTW-194 security review did not cover this path.

## Proposal

1. **Default address.** Normalise and validate first, then clear the other default and write the address **in one database transaction**, so a refused or failed save changes nothing. Keep the rule "the first address becomes the default" as it is. Decide in the design review whether concurrent saves of two default addresses need a lock or a partial unique index (do not add a migration without recording it).
2. **Country code.** First reproduce the bypass with a test that fails (create and edit, full-width code, deactivated or unknown state). Then normalise the code once, at the entry of the service (Unicode NFKC, trim, upper-case) and accept only a valid two-letter ISO 3166 code; refuse anything else with a clear 400 at the DTO and in the service. If the DTO or `ValidationPipe` already stops the full-width case before the service, record that and still add the service-level normalisation as defence in depth only if the design review agrees.
3. Update DTO docs, Swagger and `pnpm openapi:generate` if the API contract changes.

## Invariants

- A refused or failed address save leaves the customer's addresses exactly as they were, default included.
- A Nigerian address cannot skip the state checks by writing the country code differently.
- Ownership, the TTW-194 and TTW-216 rules and the saved-address behaviour are unchanged.
- Non-Nigerian addresses with a valid ISO code keep working.

## Implementation plan

1. Start `codex/ttw-219-keep-the-default-address-and-the-country-code-safe` from current `main`, in its own worktree. Copy this ticket into `docs/tickets/` of that worktree and add the ticket rows to `docs/tickets/README.md` and `docs/tickets/ROADMAP.md`.
2. Confirm each defect against the current code with a failing test; if one is not real, record the evidence and drop it.
3. Record the design review below (High risk) before implementing.
4. Implement in small steps. Record any deviation here.
5. Run the gates, record exact results below, and obtain the independent implementation review and an independent security review (High risk).

## Test and observability plan

- Integration on real Postgres: create and edit with `isDefault: true` and a refused state: the old default is still the default; a successful save still moves the default; two quick saves leave exactly one default.
- Unit and integration: full-width and mixed-width country codes (create and edit), valid lower-case code, invalid code, empty code.
- Logs, metrics, traces, and alerts: nothing new. No PII in logs.

## References

- `apps/api/src/addresses/addresses.service.ts` — `create`, `update`, default-address handling.
- `apps/api/src/shipping/address-normalization.service.ts` — `resolveCountryCode`, the NG checks.
- `apps/api/src/addresses/dto/create-address.dto.ts`, `update-address.dto.ts` — country code validation.
- `docs/tickets/ttw-216-keep-one-state-per-address-the-code-decides-the-text.md` — origin (security review C3, O3).
- `docs/tickets/ttw-194-refuse-a-deactivated-state-on-addresses.md` — the rule a full-width code would bypass.

## Acceptance criteria

- [x] A refused or failed address save leaves the default address unchanged, with a real-Postgres test.
- [x] A full-width or otherwise malformed country code cannot skip the Nigerian state checks (or the evidence shows the entry point already refuses it).
- [x] Required quality gates pass, with evidence recorded below, including an independent implementation review and an independent security review.
- [x] Contracts and docs are updated where applicable.

## Out of scope

Observed by the TTW-216 security review, older than that ticket, **not** part of this one unless the design review shows they are the same defect: changing the country of a Nigerian address keeps its Nigerian `stateCode` and LGA (O2); no `MaxLength` on the state fields (O4); a NUL character in a state text (O5). Report them as proposals; do not fix them here.

## Design review

Recorded 2026-11-14, before implementation.

**Defects confirmed on current `main`** (e2e `apps/api/test/address-default-and-country-code.e2e-spec.ts`, run before any production change, 8 of 11 tests failed):

- Defect 1 is real: a create or an edit with `isDefault: true` and an unknown state answered 400 and left the customer with **no** default address (`defaults()` returned `[]`).
- Defect 2 is real: `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) and `@Length(2, 2)` both let the full-width code through (it has two characters), so a full-width code with an unknown state answered **201**, and the same with a deactivated state answered **201**. `countryCode: 'XX'` was also accepted (200 on edit): nothing checks that the code exists.
- Extra finding: six parallel `POST` with `isDefault: true` left **5 default addresses** for one user (the race the ticket asked us to decide on).

**Decisions**

1. _Order._ `AddressesService.create` and `update` call the normaliser first (it only reads reference data and refuses with 400), then open one `prisma.$transaction` that does everything that writes: take a lock, clear the other default, write the address. A refusal happens before the transaction, so nothing changes; a database failure inside it rolls back both writes.
2. _Concurrency: row lock, no migration._ The transaction starts with `SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE` (first written as `FOR UPDATE`, weakened after review; same pattern as `organizer-applications.service.ts`). Two default saves of the same user are then serialised, so exactly one default remains. A partial unique index (`WHERE is_default`) would be stronger, but the table may already hold duplicates in a database that is not ours to read, so the migration would need a clean-up step and a deploy order. It is recorded as a proposal, not done here. Saves of different users do not block each other.
3. _"First address becomes the default"_ is kept as is: the check `!existingDefault` moves inside the transaction (after the lock) and an explicit `isDefault: false` still wins, as before.
4. _Country code, one rule._ A new helper `apps/api/src/shipping/country-code.ts` turns the sent value into a canonical code: Unicode NFKC, trim, accept only two ASCII letters, upper-case, then check it is an ISO 3166-1 alpha-2 code (`isISO31661Alpha2` from `class-validator`, already a dependency). Checking the letters **before** upper-casing keeps look-alikes out (for example the Turkish dotless "ı", which upper-cases to "I").
5. _Where it is used._ (a) The DTOs (`create-address.dto.ts`, `update-address.dto.ts`) transform with the helper and validate with `@IsISO31661Alpha2`, so a bad code is a clear 400 at the edge and the controller receives `NG`. (b) `resolveCountryCode` in the normaliser calls the same helper and throws a 400 `ADDRESS_COUNTRY_CODE_INVALID` if it is given something invalid: defence in depth for any caller that does not go through the DTO. These are the only changes in `address-normalization.service.ts` (kept small on purpose: TTW-216, commit `8a95e54`, rewrites most of that file, so a merge conflict is likely and must be solved by hand when both land).
6. _Not changed._ Ownership checks, the TTW-087/194/216 state rules, `remove()` (delete then promote another default, also not transactional: reported below, not in this ticket), the `country` text (a full-width "Nigeria" in `country` is not read as Nigeria, but it is no bypass: the code decides).

**Risks and answers.** Existing clients that send `countryCode` in lower case keep working (now stored as `NG`). A client that sent an unknown code (`XX`) now gets a 400: accepted, not in production. Lock cost: one row lock for a few milliseconds per default-address save.

**Review level.** High: integration on real Postgres (added), independent implementation review and independent security review (below).

## Implementation reviews

Two independent reviewers with a fresh context, read-only, on 2026-11-14/15.

**Implementation review: PASS, no blocker.** Findings and answers:

1. `FOR UPDATE` on `users` also blocks inserts that reference the user by foreign key (orders, sessions). **Fixed:** the lock is now `FOR NO KEY UPDATE`, which still serialises address saves.
2. `update`: if the address is deleted in parallel, `tx.address.update` raises P2025 (500 instead of 404). Already the case before this ticket. **Not fixed**, proposal below.
3. `update` reads the saved address before the lock, so two parallel edits of the same address normalise on a possibly stale copy; the last write wins, as before. **Accepted.**
4. `update` with `isDefault: false` on the only default leaves no default. Behaviour unchanged by this ticket and untested. **Recorded**, not changed.
5. `resolveCountryCode` does not canonicalise the stored `existing.countryCode`. Stored codes were always upper-cased by the old code. **Accepted**, not changed.
6. A mid-transaction database failure is proven only by a mocked unit test, not on real Postgres. **Accepted.**

**Security review: PASS, no blocker.** No bypass found for full-width, mixed-width, lower-case, padded, zero-width-space, NUL, dotless-i, `ß`, ligature, array, object, number, boolean values through the real `ValidationPipe`. No other route writes addresses. Ownership is unchanged. The error message does not echo the value. The raw SQL is a tagged template (bound parameter). Findings and answers:

1. The DTO accepted look-alikes (`ıt`, `ß`) that the service then refused: safe, but it relied on the second barrier. **Fixed:** both DTOs also require `^[A-Z]{2}$` after the folding; two unit cases added.
2. Lock strength: same as implementation finding 1, **fixed**.
3. Theoretical deadlock with account anonymisation (`privacy.service.ts:403`, `addresses` then `users`), only if the same user edits an address while deleting their account; Postgres would abort one of them. **Accepted**, recorded.
4. Out of scope: admin shipping rules (`shipping-admin.service.ts:343`) only `trim().toUpperCase()` the country code. Not customer-exploitable. Proposal below.

After the two fixes, typecheck, lint, unit tests, OpenAPI check and the address e2e files were run again (see below).

## Verification evidence

All commands run from the ticket worktree on 2026-11-14/15.

- **Defects reproduced first** (before any production change): `apps/api/test/address-default-and-country-code.e2e-spec.ts`, 8 of 11 failed: default list `[]` after a refused create and after a refused edit; full-width code with unknown state and with deactivated state answered 201; `XX` accepted; six parallel default saves left 5 defaults.
- After the change: that file 11/11 pass (real Postgres and Redis).
- `pnpm --filter api typecheck`: pass. `pnpm --filter @tamiym/types typecheck`: pass.
- `eslint` on every changed file: no warning. `pnpm --filter api lint` on the whole API: 0 errors (14 warnings, none in files of this ticket).
- `pnpm --filter api test`: 153 suites, 1534 tests pass (before the last two review fixes); after them `jest src/addresses src/shipping`: all pass (59 tests in `src/addresses`).
- E2E, one file at a time: `address-clear-lga` 1/1, `address-deactivated-lga` 1/1 (one failure on the first run, pass on rerun), `address-deactivated-state` 1/1, `address-default-and-country-code` 11/11, `address-edit-state` 2/2, `address-lga-state` 1/1, `geo-reference` 6/6, `shipping-zone-coverage` 5/5. After the review fixes, `test/address-` (6 files, 17 tests) was run 5 times: 3 runs all green, 2 runs with one failure each in a different older file (`address-default-and-country-code` once, `address-lga-state` once), both green on rerun. The local test database is shared with other sessions running at the same time; we did not prove the cause, so this is recorded as an unexplained intermittent failure, not as fixed.
- `pnpm openapi:generate` then `pnpm openapi:check`: pass (only a `description` added on `countryCode`, 4 places).
- `pnpm docs:validate`: pass. Prettier `--check` on all files of this ticket: pass. (`pnpm exec prettier --check` over whole folders also lists 25 e-mail template files that this ticket does not touch.)
- `node scripts/quality/check-diff-coverage.mjs --base main`: 23/24 changed lines covered (95.83%, floor 80%). Base is local `main` because `origin/main` is older.

### Follow-up verification (2026-11-15): rollback on real Postgres and a browser run

**1. Rollback in the middle of the transaction, real Postgres.** Two tests added to `apps/api/test/address-default-and-country-code.e2e-spec.ts` ("a failed write rolls the cleared default back"). The failure is real, not mocked: the test file creates a database trigger on `addresses` that raises an exception for a row whose street line is a marker, then drops it afterwards. The write of the address therefore fails **after** the old default was cleared. Checked: the response is 500, the old default is still the only default, and the full `addresses` rows of the user are identical to the snapshot taken before (so nothing created, nothing modified). Result: 13/13 pass in that file.

_Proof that the tests bite:_ the transaction and the lock were removed temporarily (the same steps run on the plain client) and the file run again: **3 tests failed** — "create: the old default is still the default and nothing is created", "edit: the old default is still the default and nothing is modified" and "quick saves of several default addresses leave exactly one default" (5 defaults). The code was then restored with `git checkout -- apps/api/src/addresses/addresses.service.ts` (the committed version) and the file passes again.

**2. Browser test, real API, no mock.** New spec `tests/e2e/app/settings-default-address-refused.spec.ts` (project `chromium-app`, tags `@comprehensive @app`), added to `APP-CUSTOMER-DASH` in `docs/playwright/prd-test-manifest.json`; `pnpm playwright:validate` and `pnpm playwright:validate:test` pass. What the screens can really do, found by reading `apps/app`:

- The customer app has **one** address form (settings `customer-settings-form.tsx`, and the checkout form uses the same `upsertPrimaryAddress`). It always edits the default address (or creates the first), always sends `isDefault: true` and **never sends `countryCode`**. No screen can move the default to another address, and no screen can send `isDefault: false`.
- So the country-code fix is proven only by the API tests (e2e, unit, DTO), not by a browser test. The "moves the default" case is proven only by the API e2e ("a successful save still moves the default"), not in the browser. The browser test therefore also does **not** reproduce defect 1: the UI saves onto the address that is already the default, which the old code never cleared. It checks that the screen keeps working and that its refusal path leaves data unchanged.
- The spec registers its own customer, creates a default address (Lagos) and a second non-default address through the API, opens `/dashboard/settings`, picks a test state that is still offered, deactivates that state with one SQL statement (no admin route does it; `pg` is taken from the API package; `DATABASE_URL` comes from `apps/api/.env.test` locally or the CI env), then clicks Save. Expected and observed: the real API answers 400 `ADDRESS_STATE_UNKNOWN`; the list still has 2 addresses, the same one is the default and is still in Lagos, the other address is byte-identical (same `updatedAt`); after a reload the form still shows the default address; a valid save (changed street) answers 2xx, the address stays the default and the other one is unchanged. The test state is removed afterwards.
- How it was run: own database `ttw219_e2e` (migrations and the geo seed, dropped afterwards), own API built from this worktree on port 3101 (`NODE_ENV=test`, `REDIS_DB=7`, `AUTH_CUSTOMER_ORIGINS=http://localhost:3102`), customer app built with `NEXT_PUBLIC_API_URL=http://localhost:3101/v1` and served on 3102, Chromium, a temporary Playwright config with only this spec (deleted). The first attempt failed with 401 because the API did not know the 3102 origin as a customer origin: fixed with `AUTH_CUSTOMER_ORIGINS`. The spec passed 4 times in a row. Not run through the official `chromium-app` project with the full seed and `setup` project (that needs the web and admin builds and the admin seed); a CI run of `ci.yml` has not been read.
- `eslint` does not cover `tests/e2e` (it reports "file ignored"); the spec is only checked by Prettier and by running it.

## Completion summary

- **Default address.** `AddressesService.create` and `update` now normalise and validate first, then take a per-user lock (`FOR NO KEY UPDATE` on the `users` row) and clear the old default and write the new address in one transaction. A refused or failed save changes nothing; parallel default saves leave exactly one default. No migration.
- **Country code.** New `apps/api/src/shipping/country-code.ts` (NFKC, trim, two ASCII letters, upper-case, real ISO 3166-1 alpha-2). The DTOs fold the value and refuse anything else with 400; `resolveCountryCode` uses the same helper and throws `ADDRESS_COUNTRY_CODE_INVALID` for other callers. Changes in `address-normalization.service.ts` are limited to the import and `resolveCountryCode`.
- **Deviations from the ticket plan:** none in scope. A partial unique index was not added (decision 2).
- **Merge warning.** Branch `codex/ttw-216-keep-one-state-per-address-the-code-decides-the-text` (commit `8a95e54`, not merged) rewrote most of `address-normalization.service.ts`. Expect a conflict in `resolveCountryCode` and the import line when both land. Not merged, not rebased.
- **Not verified:** the intermittent e2e failure above (it happened once more in 5 extra runs of the `address-` files (one failure, test not identified; the 3 other runs were clean); the local test database is shared with other sessions); the browser spec has not been run through the official `chromium-app` project with the full seed, nor in CI; no screen sends `countryCode` or moves the default, so those two fixes have no browser proof (see follow-up verification). The mid-transaction rollback is now proven on real Postgres (follow-up).
- **Proposals, not done and no ticket created:** (a) partial unique index `addresses (user_id) WHERE is_default` after cleaning duplicates; (b) make `remove()` transactional (delete then promote another default); (c) turn P2025 into 404 when an address is deleted during an edit; (d) use `canonicalCountryCode` in admin shipping rules; (e) out-of-scope findings from the TTW-216 review (O2 country change keeps `stateCode`, O4 `MaxLength` on state fields, O5 NUL in a state text) stay open; (f) a full-width `country` text such as "Nigeria" is not read as Nigeria (the code decides, so no bypass).
