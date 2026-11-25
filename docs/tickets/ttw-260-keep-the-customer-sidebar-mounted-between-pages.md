# TTW-260 — Keep the customer sidebar mounted between pages

**Epic:** 2B — Customer app polish  
**Status:** Complete  
**Risk:** Standard  
**Blocked by:** None  
**Blocks:** TTW-253 (UI alignment work is easier on one shared layout)

## Background

Every click on a sidebar link looks like a full page reload in `apps/app`. It is not a browser reload (the links use `next/link`); the structure causes it:

- There is no `app/dashboard/layout.tsx`. Each of the 13 pages renders its own `<CustomerDashboardShell>` around its content (`activeNav` passed by hand). On navigation the old page and its sidebar unmount and the new page mounts a fresh sidebar.
- Each page loads the signed-in user on its own, in a `useEffect` + `useState` calling `authApi.getMe()` (`dashboard/page.tsx`, `cart`, `checkout`, `orders`, `orders/[id]`, `products`, `products/[id]`, `fundraiser`, `fundraiser/[id]`, `profile`, `settings`, `design`, `orders/[id]/confirm`, and `components/workshop/WorkshopPageShell.tsx`). Nothing is cached between pages, so the name in the sidebar is empty (a grey placeholder since the placeholder-name fix, a made-up name before it) on every navigation, and `/auth/me` is requested again each time.
- `EmailVerificationBanner` already reads the same user with React Query (`queryKey: ['auth', 'me']`), so the user is fetched twice per page.
- The 401 → `/auth/login` redirect and the "Failed to load user data" error screen are copied in each page.

Seen running by the product owner on 2026-11-24. Reproduction: open `/dashboard`, click Products, then Cart: the sidebar redraws and the name flashes each time.

## Proposal

1. **One shared query definition** `authMeQueryOptions` in `apps/app/lib/` (key `['auth', 'me']`, `queryFn: authApi.getMe`, `staleTime` about 60 s, `retry` that never retries a 401 and retries other errors once). The hook and `EmailVerificationBanner` both use it, so they share one request and one cache entry. The banner keeps its own `refetchOnWindowFocus: 'always'` so it still refreshes when the person comes back from the verification link, even with a non-zero `staleTime`.
2. **Two hooks.** `useCurrentUser()` is a pure read (`user`, `isLoading`, `error`) with no side effect, so any number of pages can call it. `useRequireUser()` is the only place that redirects to `/auth/login` on a 401 (in a `useEffect`, `router.push` as today); only the layout and `/orders/[id]/confirm` call it.
3. **One shared layout** `apps/app/app/dashboard/layout.tsx` that renders `CustomerDashboardShell` once and derives the active menu entry from `usePathname()` with a pure function (matching by path segment, never a raw `startsWith`, with a fallback for an unknown path or a null pathname). The shell itself stays free of `usePathname`. Mapping, identical to today's `activeNav`: `/dashboard`, `/dashboard/profile`, `/dashboard/settings` → home; `/dashboard/products*` → products; `/dashboard/cart`, `/dashboard/checkout` → cart; `/dashboard/design*` → design; `/dashboard/orders*` → orders; `/dashboard/fundraiser*` → fundraiser.
   - While the user loads, the layout renders the children with the grey name placeholder. On a non-401 error it shows the single full-page error screen, with a retry button (decision: this also applies to the workshop routes, so a `/auth/me` failure there now shows the error instead of the editor; loading still never blocks the editor).
   - Pages drop their own full-screen "loading the user" and "failed to load user" branches (including the dashboard's "Loading your dashboard..." screen, replaced by an inline skeleton), so nothing nests a `min-h-screen` screen inside the shell.
   - **Cache hygiene.** The cached user must never outlive the session: the query cache is cleared on logout, on login, register and signup-code success, and when the layout redirects after a 401. After logging out and in as someone else in the same tab, the first screen shows the new person's name and data, and the first mutation carries the new CSRF token.
4. **`WorkshopPageShell` is removed**; the workshop routes (`/dashboard/design/new/<product>`, `/dashboard/design/<id>/edit`) get the sidebar from the layout. The editor still does not wait for the user (TTW-105 behaviour kept).
5. **`/orders/[id]/confirm`** is outside `/dashboard`. Its URL is the Paystack return URL and must not change, so the page keeps rendering the shell itself, using `useCurrentUser()` and `useRequireUser()`. A navigation from the payment provider is a real page load anyway.
6. The shell keeps its current look. While the user is loading, the sidebar shows the grey name placeholder. A non-401 error shows the existing full-page error once, from the layout.

Rejected alternatives:

- Moving everything into a `(customer)` route group so the confirm page shares the layout: bigger diff for a page that is entered from outside the app.
- Keeping per-page shells and only caching the user: removes the flash of the name but not the sidebar remount (scroll, focus, menu state).
- A new global store for the user: React Query is already the app's cache.

## Invariants

- An unauthenticated visitor to any `/dashboard/**` page, or to `/orders/[id]/confirm`, is sent to `/auth/login` (401 behaviour unchanged).
- The active menu entry of every page equals today's `activeNav`.
- URLs, page content, query keys and API calls other than `/auth/me` do not change.
- The email-verification banner still shows on every dashboard page and still refetches on window focus.
- A logged-out state after `Log out` still goes to `/auth/login`.
- A 401 on `/auth/me` is requested once (no retry) and redirects once.
- After logout, or a login as another person in the same tab, nothing of the previous user (name, cached queries, CSRF token) is shown or sent.

## Implementation plan

1. Tests first (see below), failing for the right reason.
2. Add `authMeQueryOptions`, `useCurrentUser`, `useRequireUser`, the pathname → entry function, and the cache clearing on logout, login, register and signup success.
3. Add `app/dashboard/layout.tsx`. Remove the shell, the local user fetch and the user-loading/user-error full-screen branches from each dashboard page, in groups (dashboard home, profile and settings; products; cart and checkout; orders; fundraiser; design and workshop). Keep `user` and `isLoading` from the hook where a page needs them (`enabled: !!user`, `initiateOrderPayment` email, `products/[id]` "Loading product...", checkout email notice).
4. Convert `orders/[id]/confirm` to the two hooks (keeps its own shell).
5. Delete `WorkshopPageShell`; move its test to the layout.
6. Update the e2e navigation spec and this ticket's evidence; run `pnpm playwright:validate`.

## Test and observability plan

- Unit/component: pathname → entry for every route (including `/dashboard/design/new/x`, `/dashboard/orders/abc`, an unknown path and a null pathname); `useCurrentUser` makes one `/auth/me` call for two consumers; `useRequireUser` redirects once, and `getMe` is called exactly once on a 401; the banner still refetches on window focus with a non-zero `staleTime`; the layout keeps the same sidebar element across a route change; one error screen with retry on a non-401 error; logout then a different user shows the new name and clears the cache. The existing page tests that mock `authApi.getMe` needed no change; `WorkshopPageShell.test.tsx` moved into the layout test, never weakened. The shell test keeps mocking only `useRouter`.
- Integration/e2e (desktop viewport only, since the sidebar is hidden below `lg`): extend `dashboard-navigation.comprehensive.spec.ts`: tag the `aside` element, click Home → Products → Cart → Orders, assert the tag survives and `/v1/auth/me` is requested once from the first `goto` (no reload or focus event in between); a logged-out visit to a dashboard page lands on login (not written); the logout then login as another user case is covered by Jest with the real cache (it would invalidate the shared saved sessions in e2e). Re-run `email-verification-banner`, `design-workshop.*`, `checkout-*`, `orders.comprehensive`, `products-cart`, `settings*`, `campaign-authoring*`, `design-order` and `customer.smoke`. The PRD manifest already lists the navigation spec; only a new spec file would need an entry.
- Failure, retry, and concurrency: `/auth/me` 500 shows one error screen, recoverable by retry; 401 while navigating redirects once; 401, then login, does not bounce back to `/auth/login`.
- Logs, metrics, traces, and alerts: none (client only).

## References

- `apps/app/components/customer-dashboard-shell.tsx` — the shell each page wraps itself in.
- `apps/app/components/workshop/WorkshopPageShell.tsx` — the workshop's own copy of the user fetch.
- `apps/app/components/email-verification-banner.tsx:68` — already uses `['auth', 'me']`.
- `apps/app/app/dashboard/cart/page.tsx:12-50` — representative per-page fetch and 401 handling.
- `docs/tickets/ttw-105-align-workshop-layout-with-figma.md` — workshop routes sit in the dashboard sidebar.

## Acceptance criteria

- [ ] Clicking between dashboard pages does not remount the sidebar (e2e proves it) and the name does not flash.
- [ ] `/auth/me` is requested once per session load, not once per page (e2e proves it).
- [ ] No page under `apps/app/app` renders `CustomerDashboardShell` except `orders/[id]/confirm`; `WorkshopPageShell` is gone.
- [ ] 401 redirect, error screen, active menu entry and email-verification banner behave as before; the dashboard no longer shows a full-screen loading screen for the user.
- [ ] After logout and a login as another person in the same tab, the first screen shows the new name and no data of the previous user.
- [ ] `/orders/[id]/confirm` still works from a cold load (Paystack return), with one redirect owner.
- [ ] `pnpm --filter app typecheck`, `pnpm --filter app lint`, `pnpm --filter app test`, `pnpm playwright:validate` and the named Playwright specs pass with evidence recorded below.

## Out of scope

- Any visual change to the sidebar or pages → TTW-253.
- The mobile navigation design.
- Moving `/orders/[id]/confirm` under `/dashboard` (would change the Paystack return URL).
- The unstable product-list tests under load → TTW-255.
- `loading.tsx` or Suspense for the server-rendered workshop routes, cross-tab logout detection, and clearing any state beyond the query cache and CSRF token.
- Nested `min-h-screen` inside `EditDesignLoader` error screens and `design/page.tsx` (noted for TTW-253).

## Design review

Reviewer: independent agent, 2026-11-24, read-only. Verdict: **PASS WITH CHANGES**.

Confirmed: diagnosis true; pathname → entry mapping equals today's `activeNav` for every page; user only used for name, `enabled: !!user` gating, payment email and the checkout notice; no role checks.

| Id       | Severity      | Finding                                                                                           | Resolution                                                                                          |
| -------- | ------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| F1       | major         | Default `staleTime` 0 would refetch `/auth/me` on every page mount                                | Shared `authMeQueryOptions` with `staleTime`, used by hook and banner                               |
| F2       | major         | Banner focus refetch would stop working with a non-zero `staleTime`                               | Banner uses `refetchOnWindowFocus: 'always'` + test                                                 |
| F3       | major         | `retry: 1` would delay the 401 redirect and error screen                                          | Retry never on 401 + test (`getMe` called once)                                                     |
| F4       | blocker       | Cached user survives logout / user switch in the same tab                                         | Clear the query cache on logout, login, register, signup success, 401 redirect + Jest and e2e tests |
| F5       | major         | Redirect inside the shared hook would fire once per consumer                                      | `useCurrentUser` pure read; `useRequireUser` redirects, used by layout and confirm only             |
| F6       | major         | Full-screen loading/error branches in pages would still flash or nest in the shell                | Pages drop them; layout owns one error screen with retry                                            |
| F7, F8   | major (tests) | Test impact: 11 page tests, workshop shell test, desktop-only e2e remount check, request counting | Test plan rewritten above                                                                           |
| F9       | minor         | A `/auth/me` 500 now replaces the editor                                                          | Accepted as the single behaviour, stated in Proposal                                                |
| F10      | minor         | Fewer `getMe` calls refresh the CSRF token less                                                   | Safe (login/register store it); user-switch test covers the first POST                              |
| F11      | minor         | Banner now persists its resend feedback across pages                                              | Accepted, noted                                                                                     |
| F12, F13 | minor         | Missing criteria and out-of-scope items                                                           | Added above                                                                                         |

## Implementation reviews

**Review 1** (independent agent, 2026-11-24): PASS WITH CHANGES. Correctness, regression risk, security/session and scope PASS; tests PASS WITH CHANGES. Design findings F1-F13 all checked as implemented.

| Id  | Finding                                                             | Resolution                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | Session-hygiene claim only tested through a direct `resetSession()` | `__tests__/dashboard/session-hygiene.test.tsx`: real `authApi` + real `Providers`; login, register, signupVerify and logout reset the session and set/clear the CSRF token; logout then login as another person shows the new name on the first screen |
| R2  | 401 case not run with the real cache clearing                       | Same file: one `/auth/me` and one redirect after the real `clear()`                                                                                                                                                                                    |
| R3  | "401, then login" not tested                                        | Same file: after login the dashboard shows the person, no second redirect                                                                                                                                                                              |
| R4  | Ticket claimed a logged-out e2e                                     | Wording fixed: not written                                                                                                                                                                                                                             |
| R5  | Dead `if (error && !user)` full-screen branch in checkout           | Removed; the inline `{error}` still shows quote and address errors                                                                                                                                                                                     |
| R6  | Nested fragment in `design/page.tsx`                                | Collapsed                                                                                                                                                                                                                                              |
| R7  | Plan and evidence disagreed on adapted tests                        | Wording fixed                                                                                                                                                                                                                                          |
| R8  | New e2e imports and selectors                                       | Reviewed by reading: fine; still unrun                                                                                                                                                                                                                 |

## Verification evidence

Run on branch `codex/ttw-260-keep-the-customer-sidebar-mounted`, 2026-11-24.

| Command                       | Result                      |
| ----------------------------- | --------------------------- |
| `pnpm --filter app typecheck` | pass, no error              |
| `pnpm --filter app lint`      | pass, 0 warnings            |
| `pnpm --filter app test`      | 50 suites, 394 tests passed |
| `pnpm playwright:validate`    | passed                      |

New tests, written first and failing for a missing module before the code existed: `__tests__/lib/dashboard-nav.test.ts` (route → entry), `__tests__/lib/current-user.test.tsx` (one request for two readers, no refetch on a later page, 401 not retried, other errors retried once, one redirect, banner focus refetch with a fresh user, cache cleared on session reset), `__tests__/dashboard/dashboard-layout.test.tsx` (sidebar element kept across a page change with one `getMe`, active entry, placeholder while loading, 401 redirect once, one error screen that recovers, workshop route inside the sidebar). The old `WorkshopPageShell.test.tsx` cases (sidebar around the editor with Design current, 401 redirect) now live in the layout test; the component is deleted. No other existing test was changed.

**CI on `main`** (merge `8a06515` then fix `bfd5e97`, 2026-11-24/25):

| Run                                    | Commit    | Result                                                                                                                                                                                                                      |
| -------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CI` 45503397872                       | `bfd5e97` | success                                                                                                                                                                                                                     |
| `Playwright Comprehensive` 45503397921 | `bfd5e97` | success: 276 passed, 3 skipped. It ran the new sidebar persistence spec (`dashboard-navigation.comprehensive.spec.ts`, sidebar kept and `/v1/auth/me` requested once) and `email-verification-banner.comprehensive.spec.ts` |

Earlier on the merge `07826ad` the smoke test `session-boundaries.smoke.spec.ts` ("customer app stores the API CSRF token in sessionStorage") failed once and passed on retry: since this ticket the dashboard heading appears before `/auth/me` returns, so the test read `sessionStorage` too early. It now waits for the token with `expect.poll` (same assertions), done under TTW-262.

**Not verified:**

- Nothing was run by hand in a browser; the visual result was only seen by the product owner on the dev server.
- No real browser journey. The logout then login as another person case is covered by Jest only (the e2e would invalidate the shared saved sessions).
- A second review iteration was not run after the review-1 fixes (tests and two small removals).
- Two real browser tabs at once and the production case (API on another origin) are not exercised.

## Completion summary

The customer sidebar now lives in one `app/dashboard/layout.tsx` and stays mounted between dashboard pages. The signed-in user is read from one cached query shared with the verification banner, with a single owner of the 401 redirect (`useRequireUser`), and the cache is reset on every session change. Pages no longer render the shell or load the user themselves; `WorkshopPageShell` is gone. Alongside, the sidebar no longer shows a made-up name while loading, the Home icons are larger, and the Home counters count only paid orders. Merged into `main` (`07826ad`), CI and Playwright Comprehensive green on `bfd5e97`. Follow-ups: none for this ticket (session renewal is TTW-262; the same layout work is not needed for `apps/web` or `apps/admin`).
