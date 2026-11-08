# TTW-183 — Move the admin site settings form to Zod and React Hook Form

**Epic:** 0 — Trustworthy delivery system  
**Status:** Done  
**Risk:** Standard  
**Blocked by:** None  
**Blocks:** None

## Background

The project's frontend rule says forms use Zod and React Hook Form (`CLAUDE.md`, "Rules distilled from `.cursor/rules/`"). The admin site settings page does not:

- `apps/admin/app/admin/settings/site/page.tsx` (408 lines) keeps the form in `useState` (lines 87-90: `form`, `message`, `error`, `vatRateInvalid`) and validates by hand. TTW-084 added the VAT check `parseVatRate` (at most 100, at most 2 decimals) and the "VAT not configured" alert there.
- The libraries are already installed in the admin app (`zod`, `react-hook-form` and `@hookform/resolvers` in `apps/admin/package.json`). Only `apps/admin/app/auth/login/page.tsx` uses them.

This page sets the VAT rate, which feeds every price. Hand-written checks spread through the component are easy to bypass by mistake when someone adds a field. A Zod schema keeps them in one place that can be tested.

Left over from TTW-084, which kept the existing structure to stay within its scope.

## Proposal

To confirm at design review:

- One Zod schema for the form: VAT as a percentage from 0 to 100 with at most 2 decimals; payout fields with their current rules.
- React Hook Form for state, errors and dirty tracking. "Reset unsaved changes" uses `reset()`.
- Keep what users see today: field labels, the "No VAT rate is set…" alert, error messages, `aria-invalid` / `aria-describedby`, and an empty VAT field when the API returns `vatRate: null`.
- No API change.

## Invariants

- The page never sends a VAT rate of 0 unless the admin typed 0.
- An empty, out-of-range or over-precise VAT rate is refused before any request.
- Saving only the payout settings still requires a VAT rate when none is set (TTW-084 behaviour).

## Implementation plan

1. Freeze current behaviour first: the existing Playwright tests (`tests/e2e/admin/catalog-settings.comprehensive.spec.ts`), plus any missing case (out-of-range rate, more than 2 decimals, `vatRate: null`).
2. Write the Zod schema and switch the page to React Hook Form.
3. Play the page through in a browser: load, edit, invalid values, save, reset.

## Test and observability plan

- Unit/component: the admin app has no unit runner. Test the schema through Playwright, or add a small test where the schema lives if a runner becomes available.
- Integration/e2e: `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` on its 3 viewports.
- Failure, retry, and concurrency: a save error from the API still shows in the `role="alert"` message.
- Logs, metrics, traces, and alerts: none.

## References

- `apps/admin/app/admin/settings/site/page.tsx:87-90` — form state in `useState`.
- `apps/admin/app/admin/settings/site/page.tsx` — `parseVatRate`, `toFormState`, Save handler.
- `apps/admin/app/auth/login/page.tsx` — existing Zod and React Hook Form example in the admin app.
- `docs/tickets/ttw-084-create-default-site-settings.md` — VAT rules added to this page.

## Acceptance criteria

- [x] The page uses one Zod schema and React Hook Form; no hand-written VAT check is left in the component.
- [x] Everything visible stays the same, shown by the Playwright tests and a browser walkthrough.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- Other admin forms that also use `useState`: separate tickets if needed.
- Any change to the site settings API.

## Design review

Standard risk. Reviewed 2026-11-08 against `apps/admin/app/admin/settings/site/page.tsx` at `81d003b`.

**Current behaviour to keep (frozen by Playwright first):**

- VAT field empty while loading and when the API returns `vatRate: null`; the "No VAT rate is set…" alert (`#vatRateNotConfigured`, `role="alert"`) shows in that case and is referenced by the field's `aria-describedby`.
- Save with an empty, out-of-range (> 100) or over-precise (> 2 decimals) VAT rate sends no request and shows "Enter a VAT rate between 0 and 100, with at most 2 decimals, before saving." in `#siteSettingsError` (`role="alert"`); the field gets `aria-invalid="true"` and `aria-describedby` gains `siteSettingsError`.
- Changing only payout fields still needs a VAT rate when none is set.
- A valid save sends `PATCH /admin/site-settings` with the VAT rate as a 4-decimal fraction (7.55 % → 0.0755), numbers for the day fields, `minimumPayoutAmount: null` when blank; then shows "Site settings saved.". An API error shows its message in the same `role="alert"` paragraph.
- Save and Reset are disabled until something changes; Reset restores the loaded values and clears messages.
- Payout fields have no client-side checks today (the API validates them). The ticket's "payout fields with their current rules" means none are added here: new checks would be a visible change.

**Design:**

- `apps/admin/lib/site-settings-form.ts`: one Zod schema, `siteSettingsFormSchema`. Input = the form's strings and booleans; field checks for `vatRatePercent` (same regex `^\d{1,3}(\.\d{1,2})?$` on the trimmed text, then ≤ 100, same message); an object-level `transform` turns valid input into the `UpdateSiteSettingsInput` payload (so parsing and conversion live in one place). Also exports `defaultSiteSettingsForm` and `toSiteSettingsForm(settings)` (moved unchanged).
- Page: `useForm<Input, unknown, Payload>({ resolver: zodResolver(schema) })`. Inputs use `register`; Select and Checkbox use `Controller`. Loaded settings call `reset(toSiteSettingsForm(data))`, so `formState.isDirty` replaces the JSON comparison; Reset calls `reset(toSiteSettingsForm(data))` with the same loaded values.
- Success and API error come from the mutation state (`isSuccess`, `error`) instead of two `useState`; `saveMutation.reset()` clears them on each Save attempt and on Reset. The VAT message comes from `formState.errors.vatRatePercent`. No `useState` is left.
- No `<form>` element is added: the button stays a click handler (`handleSubmit(onValid)`), so Enter-to-submit and native browser validation bubbles do not appear.
- Behaviour differences considered: (1) after a refused Save, today the error text stays while the admin types (only `aria-invalid` drops, even while the value is still invalid). With React Hook Form's default re-validation, the message and `aria-invalid` follow the value: they stay while it is invalid and disappear together once it is valid. (2) Today Reset clears the message but leaves `aria-invalid="true"` and `aria-describedby="siteSettingsError"` pointing at a paragraph that no longer exists; `reset()` clears both.

**Decision (user, 2026-11-08):** accept React Hook Form's behaviour (error state follows the value). Covered by the test "site settings drop the VAT error once the value is valid or reset (TTW-183)", which fails on the old page (`aria-invalid` missing while `7.555` is typed) and passes on the new one.

**Risks:** dirty tracking (RHF compares with the last `reset` values — same as the old JSON comparison); the `PATCH` payload shape (covered by a Playwright test that reads the request body); parallel viewports share one database, so tests that save mock the `PATCH` response instead of writing.

**Tests:** `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` on its 3 viewports (desktop 1440, tablet 834, mobile 393): empty / out-of-range / 3-decimal rate refused with no request; `vatRate: null` alert, empty field and payout-only save refused; valid save payload and message (mocked `PATCH`); API error shown in the alert (mocked `PATCH`); Reset restores values. Run green on the current page before any change.

## Implementation reviews

**2026-11-08 — `/code-review` (high), fresh pass over the full diff.** 6 findings:

1. Reset called `saveMutation.reset()` during an in-flight save, which detached the observer (Save re-enabled, outcome never shown). **Fixed:** Reset only clears the mutation when it is not pending (`page.tsx`, Reset handler).
2. Tests read field values right after Save appeared, before the form's load `reset()` effect is guaranteed to have run. **Fixed:** `openSiteSettings` waits for a non-empty VAT field (opt-out for the `vatRate: null` test, which waits for the alert instead).
3. Same race for the checkbox and select initial state in the payload test. **Fixed** by (2).
4. `z.enum` failures on currency/payout mode would not be rendered. **Not changed:** both lists come from the generated Prisma enums the API stores, so the API cannot return another value; noted here for the record.
5. The PATCH mock re-fetched with `GET` while keeping the PATCH body. **Fixed:** the mock answers `{ id: 'default', ...body }` (the page sends every field), no extra request.
6. Design notes drifted (Reset call, second behaviour difference). **Fixed** above.

All fixes re-verified by the final Playwright runs below. Verdict after fixes: PASS.

## Verification evidence

Local isolated stack (shared machine with other sessions): Postgres DBs `tamiym_workshop_ttw183` / `tamiym_workshop_ttw183_test` (`prisma migrate deploy` + `seed:e2e`), Redis DB 12, API on 3021 (`NODE_ENV=test`, `AUTH_ADMIN_ORIGINS=http://localhost:3023`), admin `next build` with `NEXT_PUBLIC_API_URL=http://localhost:3021/v1` served on 3023. The web and customer apps are not used by the admin project; small static servers answered on 3020/3022 so Playwright's `webServer` check passed. Runs: `PLAYWRIGHT_API_URL=http://localhost:3021 PLAYWRIGHT_WEB_URL=http://localhost:3020 PLAYWRIGHT_APP_URL=http://localhost:3022 PLAYWRIGHT_ADMIN_URL=http://localhost:3023 pnpm exec playwright test --project=setup --project=chromium-admin tests/e2e/admin/catalog-settings.comprehensive.spec.ts`.

- **Freeze on the old page (built from `81d003b`)**, `--workers=1`: 28 passed, 5 failed by load timeouts (machine load average ~500 from other sessions; the untouched "payout and pricing panels" test failed the same way). Rerun of those with `--retries=2`: 11 passed, 1 flaky (passed on retry #1, `route.fetch` timeout). Every frozen test therefore passed on the old page on all 3 viewports.
- The first draft of the Reset test asserted that `aria-invalid` clears after Reset; on the old page it does not (defect recorded in the design review), so that assertion was dropped from the freeze test and moved to the new test below.
- **New test on the old page:** "site settings drop the VAT error once the value is valid or reset (TTW-183)" failed as expected (`aria-invalid` missing while `7.555` is still typed).
- **Final code**, `--workers=1 --retries=2`: `36 passed (1.4m)`, no retry used. Then default workers, no retries: `36 passed (1.5m)` (3 viewports × 12 tests incl. setup).
- `apps/admin`: `tsc --noEmit` exit 0; `eslint app/admin/settings/site/page.tsx lib/site-settings-form.ts` 0 problems (the unused `EmptyState` import warning in the page was removed); `eslint .` 0 errors, 21 warnings, none in touched files.
- `pnpm playwright:validate`: "Playwright manifest validation passed."; `prettier --check` on the 4 touched files: clean.
- `grep -c "useState\|parseVatRate" apps/admin/app/admin/settings/site/page.tsx` → 0.
- **Browser walkthrough** (built-in browser, admin 3023, seeded admin with TOTP): page loads with the saved rate; `7.555` + Save → field `aria-invalid="true"`, `aria-describedby="siteSettingsError"`, alert text unchanged, `role="alert"`; typing `7.55` removes message and mark; Save → "Site settings saved.", DB row `vatRate = 0.0755`; reload shows `7.55`; typing `12` enables Save/Reset, Reset restores `7.55` and disables both; no console errors.

Not verified: the web/app Playwright projects (not affected by this change) and CI (nothing pushed).

## Completion summary

- New `apps/admin/lib/site-settings-form.ts`: one Zod schema validates the VAT rate (0-100, at most 2 decimals, empty refused) and converts the form into the `PATCH /admin/site-settings` body; defaults and `toSiteSettingsForm` moved there unchanged.
- `apps/admin/app/admin/settings/site/page.tsx` uses React Hook Form (`register`, `Controller`, `reset`, `formState.isDirty`) and the mutation state for success/error; no `useState`, no hand-written VAT check. Labels, messages, alerts, ARIA wiring and the API are unchanged.
- Behaviour change approved by the user: the VAT error state follows the value (cleared once valid or on Reset).
- 7 Playwright cases added in `tests/e2e/admin/catalog-settings.comprehensive.spec.ts` (3 viewports each).

Follow-ups (not done here): the e2e seed stores `vatRate` 0.07 instead of 0.075 (`toAmount` rounding, observed in the `site_settings` row) — that is TTW-181's scope.
