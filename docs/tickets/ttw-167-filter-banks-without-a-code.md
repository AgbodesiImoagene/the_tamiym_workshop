# TTW-167 — Keep banks without a code out of the bank list

**Epic:** 3 — Complete customer and fundraiser revenue journeys\
**Status:** Complete\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

`listBanks` copies every entry of the Paystack bank list into the API response without checking it (`apps/api/src/payouts/paystack-transfer.provider.ts:40` before this ticket). The fundraiser payout form renders each entry as `<SelectItem value={bank.code}>` (`apps/app/app/dashboard/fundraiser/page.tsx:484`).

The Radix `Select` throws when an item has an empty value (`A <Select.Item /> must have a value prop that is not an empty string`, `@radix-ui/react-select` `dist/index.mjs:825`). One entry with `code: ''` would therefore crash the whole form.

This is a possible risk, not a proven one. On 2026-11-06 the live list had 297 entries and none had an empty code, so the filter is a safeguard against a future or changed response. The independent review of TTW-165 found it. The project is not in production.

## Proposal

Filter in `listBanks`, the single place that reads this list: keep only entries whose `code` is a string that is not empty once trimmed. Log a warning with the number of skipped entries, so a bank that disappears from the selector can be traced.

The kept codes are returned unchanged. The form is not touched: once the API filters, it cannot receive an empty code from this endpoint.

Rejected:

- **Filtering in the form.** It would protect one screen only and leave the API returning entries no caller can use.
- **Failing the whole request.** One bad entry would stop an organiser choosing any bank.

## Invariants

- `GET /v1/banks` never returns an entry whose code is empty, blank, null or missing.
- Entries with a code keep their code, name and order.
- The response shape, guards and error behaviour do not change.

## Implementation plan

1. Write the unit test and the e2e test and show they fail on the unfiltered list.
2. Filter in `listBanks` and log the skipped count.
3. Run the API gates and record the evidence.

## Test and observability plan

- Unit/component: `apps/api/src/payouts/paystack-transfer.provider.spec.ts` runs the real provider with `fetch` stubbed. No component test: the form does not change.
- Integration/e2e: `apps/api/test/banks.e2e-spec.ts` boots the real app and calls `GET /v1/banks` as an organiser, with only the Paystack call stubbed.
- Failure, retry, and concurrency: a Paystack `status: false` response still returns `[]` (unit test). There is no retry or shared state.
- Logs, metrics, traces, and alerts: one warning with the skipped count. It carries no bank data, secret or user data. The existing `paystack.banks.list` span is unchanged.

## References

- `apps/api/src/payouts/paystack-transfer.provider.ts`: `listBanks`.
- `apps/api/src/fundraising/banks.controller.ts:42`: the only caller.
- `apps/app/app/dashboard/fundraiser/page.tsx:484`: the select.
- `docs/tickets/ttw-165-fix-image-variant-select-crash.md`: same crash on the admin product page, and the review that raised this risk.

## Acceptance criteria

- [x] `listBanks` drops entries with an empty, blank, null or missing code, and the unit test fails without the filter.
- [x] `GET /v1/banks` returns only selectable banks through the real app, and the e2e test fails without the filter.
- [x] Entries with a code are returned unchanged, and a Paystack `status: false` response still returns an empty list.
- [x] Required quality gates pass with evidence recorded below.
- [x] Contracts, migrations, observability, and documentation are updated where applicable: no contract or migration change, one new warning log.

## Out of scope

- Duplicate codes and banks marked `supports_transfer: false` in the live list → TTW-175.
- `listBanks` does not check `res.ok`, so a JSON `status: false` response gives an empty list with no log, and a non-JSON response such as an HTML 502 makes `res.json()` throw and gives a 500. `resolveAccount` does not check it either. This is existing behaviour.
- Paystack pagination. Measured on 2026-11-06 without a key: `perPage` is ignored unless `use_cursor=true` is sent, so the current request receives all 297 Nigerian entries and nothing is cut at 100.

## Design review

**2026-11-06, implementing session, not independent.** High risk because Paystack is an external integration, as `AGENTS.md` requires. The change itself is small: read-only list, no money movement, no write, no change to auth or to the Paystack request.

- Blast radius: `GET /v1/banks` only. `BanksController.listBanks` is the only caller, and the form is its only consumer.
- Duplication: no other code reads this list.
- Interfaces: `BankItem` and the response shape do not change. The OpenAPI entry has no response schema and its description stays true, so no regeneration is needed.
- Edge cases: empty, blank, null and missing codes. A list where nothing is valid returns `[]`, which the form already handles as an empty select.
- Main risk: hiding a real bank whose code is malformed. The warning makes this visible, and that bank could not have been selected anyway.
- Security: only an integer count is logged. A bank without a code cannot reach `resolveAccount` or the transfer recipient call through the form.

Verdict: proceed.

## Implementation reviews

**Review 1, 2026-11-06, `/code-review` on the staged diff.** Ran in the implementing session, so it does not count as independent. Ten candidates, not verified one by one:

1. **Fixed.** The README row used the state `In review`, which `pnpm docs:validate` refuses. It now says `In progress`.
2. **Not changed, existing.** The `perPage=100` cap and the missing `res.ok` check. See Out of scope.
3. **Not changed, not proven.** A `null` entry in the array still throws and gives a 500. It did before this ticket too, and it cannot crash the form, which would only receive an error.
4. **Not changed, not proven.** A padded code such as `' 044 '` is returned unchanged, and an entry with a code but no name is kept. Neither crashes the select.
5. **Not changed, by decision.** The form has no guard of its own, because the fix was asked for on the API side.
6. **Not changed, minor.** The e2e `fetch` stub forwards other calls without their options, and no other call happens in this test. `PaystackBank.id` is unused. The log says "1 entries" for a single entry.

**Security review, 2026-11-06, `/security-review` checklist, run inline in the implementing session.** No finding. No new input, the guards are unchanged, and the new log contains only a count. The skill asks for sub-tasks and they were not used, so this is not independent either.

**Review 2, 2026-11-06, independent reviewer (fresh session, read-only) on commit `cd1916b`.** Verdict: PASS, no blocking finding. Accuracy, tests, contracts, security and ticket each passed. None of the findings left unfixed in Review 1 needs fixing before merge.

The reviewer reran `pnpm --filter api typecheck` (exit 0), `pnpm --filter api lint` (exit 0, 0 errors, 14 warnings), `pnpm openapi:check`, `pnpm docs:validate`, `prettier --check` on the six files, and the unit spec. On a temporary copy it ran `test/banks.e2e-spec.ts` with and without the filter (passes, then fails on the `''` and `null` entries) and eight mutations of the provider, seven of which were caught. `git merge-tree` reports no conflict with `main` at `e0e74f1`. It did not rerun the full unit and e2e suites or the build.

Findings:

1. **Minor, fixed after the review.** The ticket said a Paystack failure gives an empty list, which is only true of a JSON `status: false` response. The wording is now precise.
2. **Minor, fixed after the review.** Nothing protected "code returned unchanged": trimming the returned code left all tests green. The unit test `returns a kept code unchanged` now covers it. The reviewer did not see this test; it was run as recorded below.
3. **Minor, left as is.** The reference to the TTW-165 ticket points to a file that only exists on `codex/ttw-165-fix-image-variant-select`. It resolves when TTW-165 merges.
4. **Information.** This ticket says `In review` and the index says `In progress`, because the validator refuses `In review` in the index. A numeric `code` is dropped and counted as "without a code", as the proposal says.

The reviewer singled out the `perPage=100` limit as the only unfixed point that could affect an organiser with real data. It predates this ticket. Checked afterwards against the live list: nothing is cut, see Verification evidence.

## Verification evidence

Environment: macOS, Node v24.22.1, PostgreSQL 17 native, Redis, disposable database `tamiym_workshop_ttw167_test`. CI has not run this branch and uses Postgres 16.

Before the fix:

- `npx jest src/payouts/paystack-transfer.provider.spec.ts`: 1 failed, 2 passed. `drops entries with an empty, blank, null or missing code and logs how many` received the four invalid entries.
- `pnpm test:e2e -- test/banks.e2e-spec.ts`: 1 failed. `gives organisers only the banks that can be selected` received the `''` and `null` entries.

After the fix, all from one run:

- `pnpm --filter api typecheck`: exit 0.
- `pnpm --filter api lint`: exit 0, 0 errors, 14 warnings, none in the files of this ticket.
- `pnpm --filter api test`: 144 suites, 1210 tests passed.
- `pnpm --filter api build`: exit 0.
- `pnpm openapi:check`: `OpenAPI contract drift check passed.`
- `pnpm --filter api test:e2e`: 18 suites, 94 tests passed, including `test/banks.e2e-spec.ts`.
- `pnpm docs:validate`: `Documentation validation passed.`

After the independent review, for the added test `returns a kept code unchanged`:

- `npx jest src/payouts/paystack-transfer.provider.spec.ts`: 4 tests passed. With the returned code trimmed on purpose: 1 failed, and the code was restored.
- `pnpm --filter api typecheck`: exit 0.
- `pnpm --filter api lint`: exit 0, 0 errors, 14 warnings, none in the files of this ticket.
- The full unit and e2e suites were not rerun after this test-only change.

Live list, `curl` without a key, 2026-11-06:

- `country=nigeria&perPage=100` and `country=nigeria&perPage=10`: 297 entries, no pagination data.
- `country=nigeria&use_cursor=true&perPage=100`: 99 entries and a next cursor.
- The 297 entries contain no empty, blank or padded code and no missing name.

On the merge with `main` at `bffe8f6`, which includes TTW-005 and TTW-163, before pushing:

- `pnpm --filter api typecheck`: exit 0.
- `pnpm --filter api lint`: exit 0, 0 errors, 14 warnings.
- `pnpm --filter api test`: 145 suites, 1217 tests passed.
- `pnpm --filter api build`: exit 0.
- `pnpm openapi:check` and `pnpm docs:validate`: passed.
- `pnpm --filter api test:e2e`: 20 suites, 118 tests passed, on a disposable database since deleted.

CI on GitHub: run 42254214658 on `main` (`d35a278`) passed.

Not verified:

- All bank data in the tests is stubbed. The live list was only read by hand on 2026-11-06, without a key, so the same response with a real key is assumed, not proven.
- The form was not played in a browser. It did not change, and the tests stop at the API response. The Radix error is read from its source, not reproduced on this page.

## Completion summary

`GET /v1/banks` no longer returns banks with an empty, blank, null or missing code, and logs how many it skipped. The response shape and the form are unchanged, so there is no OpenAPI change and no migration. The independent review passed. Merged into `main` at the user's request and without a PR. `ci.yml` only runs on pushes to `main` or `develop` and on PRs, so pushing this branch alone would start no run. Follow-up: TTW-175, for the duplicate codes and the banks without transfers found in the live list.
