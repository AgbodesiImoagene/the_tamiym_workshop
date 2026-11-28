# TTW-266 — Store product colours as hex codes and pick them by name

**Epic:** 8 — Client review delivery\
**Status:** In progress (code reviewed; not committed; shared database repair not run)\
**Risk:** High (admin write validation, admin screen, data repair script)\
**Blocked by:** None\
**Blocks:** None

## Background

The product owner wants a product colour stored as a hex code, and chosen in the admin by typing its name (Green, Gray, Orange).

Today:

- `ProductOptionValue.metadata.hex` is not validated on write: `create-option-value.dto.ts` and `update-option-value.dto.ts` accept any `metadata`. Only the read side checks it (`product-card-summary.ts:9`, `hexOf`), so a bad value silently shows no colour square.
- The admin edits `metadata` as raw JSON (`admin-product-merchandising.tsx`, "Metadata (JSON)"), and the "Add value" form cannot set it at all.
- The colour option is recognised by its code `color` only (`product-card-summary.ts:7`, `apps/app/lib/product-variants.ts:35`). The British spelling `colour` is ignored.
- 8 products of the shared test database use the code `colour` with no hex. The e2e test `pricing-quote.e2e-spec.ts:205` creates such a product at each run (to be confirmed against the database).

## Proposal

1. API: one module `products/color-option.ts` holds the hex rule and the colour option code. The service refuses, with 400, a `metadata` that is not an object, or whose `hex` key is present and invalid, **on a colour option**. A colour value without `hex` stays allowed.
2. The code `colour` (any case) is saved as `color` on option create and update; spaces around `color` are removed, its letter case is kept. A product that would then have two colour options, under any spelling or case, gets 409. Old data that already holds two keeps both stored codes, so their other fields can still be saved. `product-card-summary.ts` reads both spellings.
3. `packages/ui`: a list of common colour names with their hex, a name search, and a `ColorPicker` (popover, search field, keyboard selection). No new dependency.
4. Admin: for a colour option, the JSON field is replaced by the picker, on each value row and on the "Add value" form. Other metadata keys are kept. Other options keep the JSON field. A hex that is not in the list is shown as it is, and is not changed until another colour is chosen.
5. A script repairs test data: renames `colour` to `color` and fills a missing or invalid hex from the value name. Dry run by default, never guesses an unknown name, and refuses a database whose **name** does not match `test|e2e`, with no override.

Deliberate decisions:

- The hex check lives in the service, not in the DTO: the DTO does not know which option the value belongs to (the option is in the URL and in the database).
- Rejected: a Prisma migration (no schema change), a third-party colour-name package, a free hex input in the picker (not requested).

## Invariants

- Creating or updating the value of a colour option never stores an invalid `hex`. Renaming an option to `color` does not recheck its existing values (out of scope).
- The API never gives a product a second colour option.
- No new option is stored with the code `colour`.
- Values of non-colour options are accepted as before.
- The repair script writes nothing without `--apply`.

## Implementation plan

1. Tests first (see below), failing for the right reason.
2. API: `color-option.ts`, service validation and normalisation, card summary, Swagger text.
3. `packages/ui`: `lib/colors.ts`, `components/color-picker.tsx`, exports.
4. Admin: `admin-product-merchandising.tsx`.
5. Script: `apps/api/src/products/fix-colour-options.ts` (logic) and `apps/api/scripts/fix-colour-options.ts` (command).
6. `pnpm openapi:generate`, Playwright spec and manifest, docs.
7. Gates, browser walk on a throwaway database, independent review.

Deviations:

- Branch is `claude/ttw-266-colour-hex-picker-e11820` (created with the session from `main` at `0783974`), not `codex/…`: it matches the ticket hook and CI.
- The hex check is in the service, not in the two DTO files named in the request; the DTOs only gained Swagger text.
- The admin also shows the stored code after "Save option", and an alert when that save fails.
- Swagger success and error responses were added on the four option routes.
- After the first review: the script got its own database check (the seed helper also accepts `test` anywhere in the URL, and `NODE_ENV=test`); the second-colour 409 covers every spelling and case; an admin value row follows the saved data; the picker opens on the current colour and its popup has a name.

## Test and observability plan

- Unit (API Jest): hex accepted and refused on create and update, non-colour option unchanged, `colour` normalised, 409 on collision, card summary reads `colour`, repair logic (dry run, unknown name, collision).
- Unit/component (`apps/app` Jest, the only runner that renders `@tamiym/ui`; `packages/ui` and `apps/admin` have none): name search (case, spaces, Gray/Grey, ranking, no result), list integrity (unique names, valid hex), picker (search, click, keyboard, custom hex shown).
- Integration (API e2e, real Postgres): admin HTTP calls for invalid hex (400, nothing stored), valid hex, `colour` normalisation, collision, repair script on real rows.
- Playwright (admin): create a colour option typed `colour`, add a value by picking "Green", reload, change it to "Orange", check the stored hex. Throwaway database only.
- Logs and metrics: none added.

## References

- `apps/api/src/products/product-card-summary.ts:7` — colour code and hex rule.
- `apps/api/src/products/products.service.ts:921` — option and option value writes.
- `apps/admin/components/admin-product-merchandising.tsx:267` — option value editing.

## Acceptance criteria

- [x] Create and update of a colour option value refuse an invalid `metadata.hex` with 400 and store nothing.
- [x] An option created or renamed with `colour` is stored as `color`; the product list shows colours for both spellings.
- [x] In the admin, a colour is found by typing its name, and its hex is saved and shown after reload.
- [ ] The repair script lists, then fixes, the `colour` test products; it was run on the shared database only with the user's agreement.
- [x] Required quality gates pass with evidence recorded below.
- [x] Swagger, OpenAPI, Playwright manifest and docs are updated.

## Out of scope

- Colour filter on the customer side.
- Typing a free hex in the picker.
- The metadata hex of non-colour options is not checked, although `apps/web/components/public-fundraiser-detail.tsx` and the workshop `OptionPicker.tsx` can put it in a style (admin-only writes; existing behaviour).
- `assertTestDatabase` in `apps/api/scripts/_prisma-script-client.ts` (used by the seed) accepts a non-test database in some cases: existing behaviour, to fix separately.
- `pricing-quote.e2e-spec.ts:205` still writes a `colour` option straight into the database, so old rows come back at each run on a shared database.
- Two colour options created at the same instant with different letter case are not blocked by the database.
- Badge and tag flags → TTW-267.
- `apps/app/lib/product-variants.ts` still reads `color` only; repaired and new data use `color`.
- Checking existing values when an option's code is changed to `color`.

## Design review

Reviewer: implementing session (Claude), 2026-11-25.

- Blast radius: admin option writes, product list card summary, one admin panel, new exports of `@tamiym/ui`. No schema change, no customer screen change.
- Duplication: one hex rule shared by validation, card summary and repair logic. No colour list or combobox existed.
- Interfaces: request and response shapes unchanged; new 400 and 409 cases; a stored option code can differ from the one sent (`colour` → `color`).
- Edge cases: `metadata` null, string or array; `hex` null or empty; mixed-case code; product holding both spellings; custom hex outside the list.
- Security: admin-only endpoints, guards unchanged; the hex rule is anchored, so a colour option value cannot carry another CSS value (other options are not checked, see Out of scope); the script refuses non-test databases.
- Risks: merge conflicts with TTW-267 (`products.service.ts`, `openapi.json`, ticket index).
- Verdict: ready to implement once the user approves the plan.

## Implementation reviews

Reviewer: one independent subagent, read-only, throwaway database only (approved by the user with the plan). Charter: correctness, security, admin UI, tests.

1. Pass 1, 2026-11-25 — **CHANGES REQUIRED**.
   - Blocking: the repair script reused `assertTestDatabase`, which accepted a non-test database (`test` anywhere in the URL, `NODE_ENV=test`, override variable). Fixed: own check on the database name, no override.
   - A second colour option was possible with another case, spaces or beside an old `colour`; an old duplicate then could not be saved. Fixed.
   - Renaming an option to `color` keeps its invalid hex. Kept out of scope as approved; invariant reworded.
   - Admin value row kept stale state after a save. Fixed.
   - Picker: Enter replaced the current colour, `aria-selected` followed the stored colour, unnamed popup. Fixed.
   - Nits left: a product with both `colour` and `Colour` is skipped by the script; non-object metadata of a repaired value is replaced; a failed transaction loses the printed report (rerunning is safe).
2. Pass 2, 2026-11-25 — full review, **PASS**. One integration run gave an unexplained 404 once, then 20/20 three times; the reviewer's likely cause (another local server on the port `supertest` picked) is not proven.
3. Narrow check, 2026-11-28 — **PASS** on the three minor points fixed after pass 2 (custom hex at open, list scroll on search, 409 description). Scrolling not checked in a real browser.

After the narrow check, only unit tests were added to `products.service.spec.ts` (diff coverage) and this ticket was written.

## Verification evidence

Tests were written first and seen failing (missing modules, then each review finding: 11 API unit, 6 integration, 5 picker, 1 browser). The four unit tests added for diff coverage describe code that was already written.

On the final code, 2026-11-28:

| Command                                                                                                                    | Result                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec turbo run typecheck lint --force`                                                                               | 12/12 tasks, 0 errors (warnings: admin 22, api 14; the two in the changed admin component predate this ticket)                                 |
| `pnpm exec turbo run test --force`                                                                                         | web 84/84, app 551/551, api 2499/2499 (before the four coverage tests)                                                                         |
| `pnpm --filter api test:e2e product-colour-options products.e2e pricing-quote admin-product-surcharges`                    | 4 suites, 50/50, database `tamiym_workshop_test_ttw266`                                                                                        |
| Playwright, `chromium-admin`: `product-option-color`, `product-image-variant`, `product-surcharges`, auth setup            | 15/15, same database, API on 3101 and admin on 3103 through a temporary config (removed), because the developer's servers held 3001 and 3002   |
| `pnpm openapi:check`, `enums:check`, `docs:validate`, `playwright:validate`, Prettier on changed files, `git diff --check` | pass                                                                                                                                           |
| `turbo run test:coverage`, `pnpm coverage:ratchet`, `pnpm coverage:diff`                                                   | api 2503/2503 with the four coverage tests; ratchet passed (lines 86.53%); diff coverage 34/34 (100%), after a first run at 79.41% (floor 80%) |
| Repair script on the throwaway database                                                                                    | dry run listed 1 product made by `pricing-quote.e2e`, `--apply` repaired it, second run found 0; a non-test database is refused (unit tests)   |

Browser check: screenshots of the picker at 1440 px and 375 px (search "gre", chosen colour, search "grey" on mobile), taken before the review fixes.

One full `turbo run test` on 2026-11-25 failed one test of `apps/app` (`product-list-page.test.tsx`, not changed here) on a heavily loaded machine; it passed alone, in the next app run and in both later full runs.

Not run: the full Playwright suite, the full API integration suite, `pnpm build` of web and app, `audit:prod`, CI (nothing is pushed), and the repair script on any shared database.

## Completion summary

- Shipped in the branch (not committed): hex validation and `colour` → `color` in the API, a colour name list and `ColorPicker` in `@tamiym/ui`, the picker in the admin product page, a repair script.
- No migration, no new dependency.
- Repair command (dry run; add `--apply` to write): `DOTENV_CONFIG_PATH=.env.test pnpm --filter api exec ts-node -r dotenv/config -r tsconfig-paths/register scripts/fix-colour-options.ts`
- Left to do: user's agreement and run of the repair on the shared database; commit, push, CI and merge when asked.
- Merge: `docs/tickets/README.md` conflicts with `main` (rows added by both). Uncommitted work of TTW-267, TTW-269 and TTW-272 touches some of the same files; regenerate `openapi.json` and `openapi.generated.ts` after merging instead of merging them by hand.
- A dev seed (TTW-268 seed session) should reuse `NAMED_COLORS` for its colour values.
