# TTW-175 — Show organisers only banks they can be paid at

**Epic:** 3 — Complete customer and fundraiser revenue journeys\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-167, which changes the same function; the checks below, which need a real Paystack test key\
**Blocks:** None

## Background

The fundraiser payout form lists every bank `GET /v1/banks` returns. A read of the live Paystack list on 2026-11-06, without a key, found two problems. `country=nigeria` returned 297 entries.

**Banks that cannot receive transfers.** 24 entries have `supports_transfer: false`, for example Sycamore Microfinance Bank, Vista MFB and Bank of Agriculture. `listBanks` drops this field, so an organiser can save one of them as the account for their payouts. What Paystack does with a payout to such a bank has not been tested.

**Codes shared by two entries.** Six codes appear twice:

| Code     | First entry                | Second entry                     |
| -------- | -------------------------- | -------------------------------- |
| `057`    | Zenith Bank (NGN)          | Zenith Bank (USD)                |
| `50572`  | BANKIT MFB                 | BANKIT MICROFINANCE BANK LTD     |
| `50739`  | Goodnews Microfinance Bank | Prospa Capital Microfinance Bank |
| `50840`  | U and C MFB                | U&C Microfinance Bank Ltd        |
| `51253`  | Stellas MFB                | YCT MFB                          |
| `100025` | Kolomoni Microfinance Bank | KONGAPAY                         |

The form uses the code as the select value and looks the name up with `find` (`apps/app/app/dashboard/fundraiser/page.tsx:445`), so it always stores the first name. An organiser who picks Prospa Capital is stored with `bankName` "Goodnews Microfinance Bank", and that name is what the page shows afterwards (`page.tsx:564`). The code sent to Paystack is the same either way, so the name is wrong but the code is not. This comes from reading the code: it has not been played in the form. `key={bank.code}` is also duplicated.

Paystack's documentation, as quoted in `docs/paystack-integration-status.md:59`, lists banks with `currency=NGN`. The application asks for `country=nigeria`, which includes the USD Zenith entry. `currency=NGN` returned 296 entries.

## Proposal

1. Ask Paystack for NGN banks and keep only entries with `supports_transfer: true`.
2. Add the Paystack `id` to the `GET /v1/banks` response and use it as the select value and React key. The form sends the code and name of the entry that was picked.
3. Give the route a real response schema in OpenAPI, because the response changes.

### Decision

Decided by the user on 2026-11-06: hide the banks with `supports_transfer: false`. An organiser who banks only with one of them cannot add a payout account. Showing them disabled was rejected as more work for the same result, and the choice can be revisited if organisers complain.

### To check before coding

These need a real Paystack test key, and their results must be recorded here before step 2 of the plan.

- Whether Paystack rejects a transfer recipient for a `supports_transfer: false` bank, using a real test key.
- Whether `50739`, `51253` and `100025` reach the right institution. Two institutions on one code cannot be told apart by the code alone. If one of them cannot be reached, showing both is misleading.
- Whether a real key returns the same list. All figures here come from a call without a key.

Rejected: removing duplicates by code in the API. It would hide one institution of each pair and pick the winner by list order.

## Invariants

- An organiser can only pick an NGN bank that Paystack says can receive transfers.
- The stored `bankName` is the name of the entry the organiser picked.
- The stored `bankCode` is the code of that entry.
- TTW-167 still holds: no entry without a code is returned.

## Implementation plan

1. Run the checks above and record the results here. If a result contradicts the proposal, update it before coding.
2. Write the unit, e2e and form tests with the real shape of a Paystack entry, and show they fail.
3. Change the request and the filter in `listBanks`, and add `id` to `BankItem`.
4. Update the form, the shared types and OpenAPI.
5. Play the journey in a browser with a shared-code bank.

## Test and observability plan

- Unit/component: extend `apps/api/src/payouts/paystack-transfer.provider.spec.ts` for the transfer filter and the `id`.
- Integration/e2e: extend `apps/api/test/banks.e2e-spec.ts`, and add a browser journey that picks the second entry of a shared code and checks the stored name after a reload.
- Failure, retry, and concurrency: a list where no bank qualifies still gives an empty select. There is no retry or shared state.
- Logs, metrics, traces, and alerts: count the banks excluded for `supports_transfer` separately from those without a code, or log them at a lower level, because this exclusion is expected.

## References

- `apps/api/src/payouts/paystack-transfer.provider.ts`: `listBanks`.
- `apps/app/app/dashboard/fundraiser/page.tsx:445`, `:449`, `:484`, `:564`: name lookup, save, select and display.
- `apps/api/src/fundraising/payout-profiles.service.ts:114`: stores the code and name as sent.
- `docs/paystack-integration-status.md:59`: documented list request.

## Acceptance criteria

- [ ] The select offers no bank with `supports_transfer: false` and no USD entry.
- [ ] Picking the second entry of a shared code stores that entry's name, and it is shown after a reload.
- [ ] Each option has a unique value and key.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Contracts, migrations, observability, and documentation are updated where applicable.

## Out of scope

- Correcting existing payout profiles: the project is not in production.
- Checking the account holder name → TTW-130.
- Editing a bank account → TTW-135.

## Design review

To do before implementation.

## Implementation reviews

To do.

## Verification evidence

Live list read with `curl` on 2026-11-06, without a key:

- `https://api.paystack.co/bank?country=nigeria&perPage=100`: 297 entries, 24 with `supports_transfer: false`, 1 with currency USD, six duplicated codes.
- `https://api.paystack.co/bank?currency=NGN`: 296 entries.

## Completion summary

To do.
