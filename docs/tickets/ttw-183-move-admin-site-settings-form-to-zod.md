# TTW-183 — Move the admin site settings form to Zod and React Hook Form

**Epic:** 0 — Trustworthy delivery system  
**Status:** Not started  
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

- [ ] The page uses one Zod schema and React Hook Form; no hand-written VAT check is left in the component.
- [ ] Everything visible stays the same, shown by the Playwright tests and a browser walkthrough.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Other admin forms that also use `useState`: separate tickets if needed.
- Any change to the site settings API.

## Design review

Standard risk: record a design review before implementation.

## Implementation reviews

## Verification evidence

## Completion summary
