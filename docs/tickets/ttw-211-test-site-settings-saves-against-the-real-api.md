# TTW-211 — Test site settings saves against the real API without breaking parallel specs

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

Found in the TTW-209 audit. `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` answers the site settings PATCH with a stub (`mockSettingsSave`), so the success path of the save (the body the page sends, the "Site settings saved." state) never reaches the real API. The stub exists because site settings are one global row (VAT rate, payout mode, cadence) that checkout and payout specs read in parallel: a real save of 0 % or 100 % VAT from three viewport runs would change their totals.

## Proposal

Find a way to run the save for real without disturbing other specs, for example: a save that writes back the values just read (a real round trip), or a settings write serialised in a dedicated Playwright project and restored in a `finally`. Choose in the design review; do not weaken the existing assertions on the body (`vatRate: 0.0755`, boundaries 100 and 0). Keep the other two stubs (unset VAT rate, forced 400) as forced states.

## Invariants

- No shared setting other specs read stays changed after the spec ends.
- No test is deleted, skipped or weakened.
- Parallel viewport runs do not race on the row.

## Implementation plan

1. Design review: pick the approach, list the specs that read the settings.
2. Implement it for the save test; run it with parallel workers twice in a row.
3. Record evidence.

## Test and observability plan

- Playwright: converted spec, parallel workers, twice in a row, plus a checkout spec in the same run to prove totals are unchanged.
- Logs, metrics, traces, and alerts: none.

## References

- `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` — `mockSettingsSave`.
- `docs/tickets/ttw-209-replace-first-party-api-mocks-in-playwright.md` — audit.

## Acceptance criteria

- [ ] The save success test sends the PATCH to the real API and asserts the saved result.
- [ ] Specs that read the settings still pass in the same run, with unchanged totals.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- The stubbed unset-VAT and forced-400 tests.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
