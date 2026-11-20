# TTW-229 — Wire the back button on the profile and settings pages

**Epic:** 8 — Client review delivery  
**Status:** Complete  
**Risk:** Low  
**Blocked by:** None  
**Blocks:** None

## Background

The chevron at the top of the profile and settings pages looks like a "back" button but does nothing. In `apps/app/components/customer-settings-form.tsx` it is a `<button type="button">` with the icon path `m15 18-6-6 6-6`, placed before the `<h1>{pageTitle}</h1>`, with no `onClick` and no accessible name. The same component renders `apps/app/app/dashboard/profile/page.tsx` and `apps/app/app/dashboard/settings/page.tsx`. It was spotted during TTW-091 (removal of the fake profile picture) and left out of that ticket.

## Proposal

Decision of the owner: the chevron goes back in the browser history.

- Click calls `router.back()` (`useRouter` from `next/navigation`).
- When the page was opened directly (no previous page of this site), `router.back()` would leave the app or do nothing, so go to `/dashboard` with `router.push` instead. The check lives in `apps/app/lib/can-go-back.ts` and uses `window.navigation.canGoBack` (Navigation API, same-site entries only) and falls back to `window.history.length > 1` in browsers without it. Plain `history.length` alone was tried first and failed in Playwright: a direct visit already has an earlier entry (`about:blank`), so Back left the app.
- Add an English `aria-label` ("Go back"). No design change.

Rejected: a plain link to `/dashboard` (the owner chose history), and hiding the chevron on a direct visit (design change).

## Invariants

- Same look: classes and icon unchanged.
- Nothing else in the form (profile, password, address) changes.
- UI text stays in English.

## Implementation plan

1. Write the failing Jest tests (back with history, fallback without history, accessible name).
2. Wire the button.
3. Add a Playwright assertion for both cases.
4. Run the gates and record the evidence.

## Test and observability plan

- Unit/component: `apps/app/__tests__/settings/customer-settings-form.test.tsx` (mock `next/navigation`).
- Integration/e2e: `tests/e2e/app/settings.comprehensive.spec.ts` (direct visit falls back to `/dashboard`; arriving from the dashboard returns to it).
- Failure, retry, and concurrency: not applicable.
- Logs, metrics, traces, and alerts: none.

## References

- `apps/app/components/customer-settings-form.tsx` — the button.
- `apps/app/app/dashboard/profile/page.tsx`, `apps/app/app/dashboard/settings/page.tsx` — users of the form.
- `apps/app/__tests__/checkout/checkout-page.test.tsx` — how `next/navigation` is mocked.

## Acceptance criteria

- [x] Clicking the chevron goes back one page when there is history.
- [x] Without history it goes to `/dashboard`.
- [x] The button has an English accessible name.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- Any redesign of the page header.
- Removing the profile picture (TTW-091, separate branch; the touched zones are distinct).

## Design review

Low risk: implementation review only.

## Implementation reviews

**Review 1** (independent session, `ttw-091` documentation session) — 4 findings, all handled:

1. The Playwright test always ended on `/dashboard` and could not tell `router.back()` from `router.push('/dashboard')`. Fixed: two tests. "Came from" starts on `/dashboard`, clicks `manage`, clicks "Go back", then `goForward()` must return to settings (proves a step back, not a new entry). "Opened directly" uses a fresh tab per path (`/dashboard/settings`, `/dashboard/profile`) and must end on `/dashboard`.
2. Without `window.navigation`, `history.length > 1` also counts pages of other sites. `document.referrer` was considered and rejected: it is only set at the first document load and does not follow in-app navigation, so it would send a customer who navigated inside the app to the dashboard instead of back. **Choice: keep the rule and record the limit** (below).
3. The Jest test redefined `window.history.length` without restoring it. Fixed in `__tests__/lib/can-go-back.test.ts` (original descriptor restored in `afterEach`).
4. The `window.navigation` cast was duplicated. Fixed: `canGoBack()` in `apps/app/lib/can-go-back.ts` with its own test; the component test mocks it.

Verdict: PASS after fixes (re-verified below).

## Deviations from the plan

- First version used `history.length > 1` only: it failed in Playwright (a direct visit already has an earlier `about:blank` entry). Replaced by the Navigation API check with a `history.length` fallback.
- Known limit: in browsers without the Navigation API (Firefox and Safari at the time of writing), a customer who reached the page from an external link and has no earlier page of this site is sent back to that external site. Accepted as a small, low-risk edge; the Navigation API covers Chromium.

## Verification evidence

All run from the worktree on `claude/ttw-229-settings-back-button-6561ab`.

- Red first: the 3 new Jest tests failed before the change (`Tests: 3 failed, 121 passed`).
- After review 1: `pnpm --filter app test -- "settings|can-go-back"`: `Test Suites: 13 passed`, `Tests: 126 passed` (3 component tests for the button, 2 for `canGoBack`).
- `pnpm --filter app typecheck`: no error. `pnpm --filter app lint`: no error.
- `pnpm format:check`: "All matched files use Prettier code style!". `pnpm docs:validate`: passed. `pnpm playwright:validate`: passed.
- `pnpm --filter app build` then `pnpm exec playwright test tests/e2e/app/settings.comprehensive.spec.ts --project=setup --project=chromium-app`: `20 passed`, including "back button returns to the page the customer came from" and "back button goes to the dashboard when the page was opened directly" on desktop-1440, tablet-834 and mobile-393. (One build attempt failed on Next.js's online security advisory check and was repeated; the run above is on the fresh build.)
- Not covered: Firefox and Safari (no Playwright project for the customer app there); their path is the `history.length` fallback, covered by Jest only.

## Completion summary

The chevron on the profile and settings pages now goes back in the history, or to `/dashboard` on a direct visit, with the accessible name "Go back". No design, API or schema change. Not committed to `main`, not pushed. Note: this ticket was first numbered TTW-228. That number went to the state-mismatch e2e ticket, already merged into `main` (`80ffb5b`), so this one was renumbered TTW-229 before being pushed.
