# TTW-262 — Renew the customer app session before it expires

**Epic:** 2B — Accounts and sign-in  
**Status:** Complete  
**Risk:** High (API and client)  
**Blocked by:** None  
**Blocks:** TTW-148 (client acceptance: a customer must not be signed out every 15 minutes)

## Background

People using `apps/app` are sent back to the login page after about 15 minutes, although their sign-in should last 7 days.

- The API already does the right thing. The access token lasts 15 minutes (`ACCESS_TOKEN_COOKIE_MAX_AGE_MS`, `JWT_ACCESS_EXPIRES_IN="15m"`), the refresh token 7 days (`REFRESH_TOKEN_TTL_MS`, `apps/api/src/constants.ts`). `POST /auth/refresh` (`apps/api/src/auth/auth.controller.ts:722`) issues a new access token and rotates the refresh token (`AuthSessionService.rotateSession`: the old hash stops working, and two parallel refreshes with the same token let only one win).
- **The app never calls it.** `authApi.refresh()` exists (`apps/app/lib/auth.ts`) but nothing uses it: no page, no component, and `apiClient` (`apps/app/lib/api.ts`) does not retry anything. When the access cookie expires, the next request answers 401, and the dashboard layout (TTW-260, `useRequireUser`) sends the person to `/auth/login` even though the 7-day refresh cookie is still valid.
- Seen by the product owner on 2026-11-24 ("I get signed out after a while"). Not yet reproduced at the screen; the code path above explains it.
- `POST /auth/refresh` is CSRF-checked when the browser sends session cookies (`csrf.guard.ts`): it needs an allowlisted `Origin` and the `X-CSRF-Token` header. The app keeps that token in `sessionStorage` (`lib/api.ts`), which is empty in a new tab or after a browser restart. In production the API cookie is host-only on another origin, so it cannot be read either: the refresh would answer 403.
- Every refresh and login mints a **new** CSRF token (`setSurfaceAuthCookies`), so after one tab refreshes, the other tabs hold a stale token.
- `/auth/refresh` has no rate limit today.

## Proposal

Two parts, built in this order.

**Part 1 — API (so a refresh can always be proven safe).**

1. `POST /auth/refresh` **keeps** the existing CSRF cookie value instead of minting a new one on every refresh. Today every refresh and login mints a new token (`setSurfaceAuthCookies`), so one tab's refresh makes the other tabs' stored token stale and their next POST/PATCH/DELETE is refused with 403.
2. New `GET /auth/csrf` (decision on the open question, option (d) of the design review): `@Public()`, safe method, needs a surface session cookie (refresh or access), resolves the surface with the same Origin rule as `resolveSessionSurface`, returns only `{ csrf_token }` (the existing cookie value, minted only if absent) with `Cache-Control: no-store`, behind a new `AuthRateLimit` bucket. It never touches `CsrfGuard`, so the TTW-020 double-submit policy is unchanged. A new tab (empty `sessionStorage`) can then get the token it needs to refresh.
3. Swagger, OpenAPI regeneration, shared types, `docs/14-auth-and-session-architecture.md` and API integration tests (see below). A rate limit on `/auth/refresh` itself (it has none) is added as defence in depth, sized well above normal use.

**Part 2 — `apps/app` client.** One lower-level `apiFetch` (headers, including the CSRF header, rebuilt on every attempt) behind `apiClient`, with:

1. **Refresh and replay once.** On a 401 that is eligible (rule below): `GET /auth/csrf`, `POST /auth/refresh`, `setCsrfToken`, then replay the original request once with fresh headers. Replay only for 401, never for 403/5xx, except one CSRF resync: a 403 "Missing or invalid CSRF token" triggers `GET /auth/csrf` and one replay (the guard rejects before the handler, so replay is safe).
2. **Single flight, across tabs.** One refresh in flight per tab (shared promise) and one per browser through `navigator.locks.request('ttw-customer-refresh', …)`, so two tabs never use the same refresh cookie at once (the loser would get 401 and be signed out). The lock holder stores the new CSRF token before releasing it.
3. **Eligibility rule.** Refresh only when all hold: status 401; the path is not under `/auth/` except `/auth/me`, `/auth/sessions*` and `/auth/change-password`; it is not the refresh or csrf call itself; it was not already replayed; the body can be re-sent (JSON, `FormData`, `Blob`; not a stream). So login, register, signup start/resend/verify, forgot/reset password, verify/resend verification, logout, refresh and csrf never refresh, and a wrong-password 401 never triggers a replay of a side-effecting request.
4. **Failure taxonomy.** A refresh answered 401/403 means the session is over: the original 401 reaches the caller and `useRequireUser` redirects as today. A network error, 5xx or 429 on refresh surfaces a retryable error and does **not** sign the person out. The shared promise is reset in a `finally`.
5. **Uploads.** The two raw `fetch` calls (`uploadThumbnail`, `uploadDesignAsset` in `apps/app/lib/designs.ts`) go through `apiFetch` (`Content-Type` left unset for multipart), because workshop uploads happen during long editing sessions, exactly when the access cookie expires. The public read at `designs.ts` with `credentials: 'omit'` is not affected.
6. A successful refresh does **not** call `resetSession()` (same user); `useRequireUser`, `resetSession` and the React Query retry rules from TTW-260 stay as they are (a 401 now only reaches them after refresh failed).

Rejected alternatives: (a) accept 403 in a new tab (leaves the complaint for returning visitors, the most common real case); (b) `/auth/me` first (needs a live access token); (c) Origin allowlist as the only CSRF proof on refresh (reopens a documented, tested TTW-020 decision for no benefit over (d)); refreshing on a timer; a 7-day access token.

Known limit: `OptionalJwtAuthGuard` on the shared-design read turns an expired token into a visitor view instead of a 401, so no refresh happens there (to confirm during implementation which screens call it).

## Invariants

- A refresh token is never used twice: one refresh in flight per browser (shared promise in the tab, `navigator.locks` across tabs).
- A person is never signed out because another tab refreshed, and another tab's refresh never makes the next mutation fail with a stale CSRF token.
- A request is replayed only after a guard-level 401 (the handler never ran), once, with rebuilt headers and the same body. Never after 403 (except the one CSRF resync), 5xx or a handler-level 401.
- A network error, 5xx or 429 while refreshing never signs the person out.
- An expired or revoked refresh token ends in the login page, as today. No endless loop of refresh calls.
- Logout still revokes the session; a refresh cannot bring a logged-out session back.
- Login, registration and logout requests are never retried through a refresh.
- The 401 → login redirect (TTW-260) and the cache reset on session change still work unchanged.
- No token, cookie or CSRF value is written to the console, logs or an error message.

## Implementation plan

1. API tests first: refresh reuses the CSRF cookie; `GET /auth/csrf` guard cases; rate limits. Then the API change, `openapi:generate`, `generate:enums` if needed, doc 14.
2. Client tests first (see below), failing for the right reason. Then `apiFetch` with eligibility rule, single flight, `navigator.locks`, CSRF resync.
3. Route `uploadThumbnail` and `uploadDesignAsset` through `apiFetch`; confirm which screens use the optional-auth shared-design read.
4. Playwright specs (run once, at the end of a batch of work), `playwright:validate`, docs and ticket evidence.

## Test and observability plan

- API integration (real Postgres + Redis, `apps/api/test`, like `auth-surface.e2e-spec.ts`): refresh keeps the CSRF cookie value; refresh with a valid token, a stale token, no token, a wrong Origin and no Origin; `GET /auth/csrf` answers only with a surface session cookie, never for a wrong surface, never cacheable; concurrent refresh with the same token has one winner (existing test kept); rate limits on refresh and csrf.
- Unit (`apps/app/__tests__/lib/`, `fetch` and `navigator.locks` mocked): 401, csrf, refresh, replay returns the data; the replay carries the **new** CSRF token and the same body; five parallel 401s send one refresh; two tabs (lock) never refresh together; a 401 from refresh never refreshes again; eligibility table (login, register, signup start/resend/verify, forgot/reset, verify/resend verification, logout, refresh, csrf never refresh; `/auth/me`, sessions, change-password do); a wrong-password 401 on change-password is not replayed more than the rule allows; 403 CSRF resyncs once; refresh network error, 5xx and 429 do not redirect and reset the shared promise; no token stored: `GET /auth/csrf` is called first; `console.*` never called with a token; FormData upload replayed; banner and layout `/auth/me` 401 at once give one refresh; an `idempotencyKey` order creation is replayed with the same key; a successful refresh does not reset the session.
- Playwright (run once at the end): clear only `ttw_customer_access` (`context.clearCookies({ name })`, host-only on the API host), click a sidebar link: still signed in, sequence `GET /v1/auth/csrf` then `POST /v1/auth/refresh` exactly once; clear both cookies: login page, no loop. Check `attachStrictPageGuards` tolerates the expected 401. Note the saved storage states carry no `sessionStorage`, so e2e starts as a "new tab", but on localhost the CSRF cookie is readable, so e2e cannot show the production 403: the unit test with no stored token and the API tests cover that.
- Failure, retry, and concurrency: parallel requests, two tabs, API outage during refresh, rate-limit answer.
- Logs, metrics, traces, and alerts: the API already records `auth.session.refreshed`; the new endpoint is counted in the existing auth metrics; the client logs nothing.

## References

- `apps/app/lib/api.ts` — request client with no retry, CSRF token handling.
- `apps/app/lib/auth.ts` — `refresh()` defined, never called.
- `apps/app/lib/current-user.ts` — `useRequireUser`, the 401 redirect owner (TTW-260).
- `apps/api/src/auth/auth.controller.ts:722` — `POST /auth/refresh`.
- `apps/api/src/auth/auth-session.service.ts` — `rotateSession` (rotation, sibling-surface revocation).
- `apps/api/src/auth/guards/csrf/csrf.guard.ts` — CSRF policy for refresh.
- `docs/14-auth-and-session-architecture.md` — session design.

## Acceptance criteria

- [ ] With an expired access token and a valid refresh token, a customer keeps working, in the same tab and in a new tab: one refresh, no visible sign-out.
- [ ] Parallel failing requests, and two tabs, cause one refresh; no person is signed out by another tab's refresh, and no mutation fails on a stale CSRF token afterwards.
- [ ] The replayed request uses the new CSRF token; the two workshop uploads are renewed and replayed.
- [ ] Login, registration, logout and the other listed `/auth` calls are never refreshed or replayed.
- [ ] An expired refresh token still ends on `/auth/login`, with no loop; a refresh network error, 5xx or 429 does not sign the person out.
- [ ] `POST /auth/refresh` keeps the CSRF cookie value; `GET /auth/csrf` exists with Swagger, regenerated OpenAPI and types, a rate limit and `no-store`.
- [ ] `docs/14-auth-and-session-architecture.md` describes the client renewal, the new GET, the CSRF reuse and the "a guard 401 happens before the handler" invariant.
- [ ] Required gates pass with evidence: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm --filter api test:e2e` (auth suites), `pnpm openapi:check`, `pnpm coverage:ratchet`, `pnpm coverage:diff`, `pnpm docs:validate`, `pnpm playwright:validate`, the new Playwright spec.

## Out of scope

- **`apps/web` and `apps/admin` need the same renewal and it matters before going live.** `apps/admin` has an `authApi.refresh()` that nothing calls (`apps/admin/lib/auth.ts`), and `apps/web` has no refresh method at all (new code), so their users are signed out after 15 minutes too. The admin console also has MFA and a separate cookie surface, so it needs its own look. Not done here by decision of the product owner (2026-11-24): `apps/app` only. A follow-up ticket for each front must exist and be done before the launch (listed in the ROADMAP under "Mise en ligne").
- Background or timed refresh, "remember me" lengths, refresh token reuse detection.
- Cross-tab sign-out detection.

## Design review

Reviewer: independent agent (design and security), 2026-11-24, read-only. Verdict: **PASS WITH CHANGES**. Diagnosis confirmed: nothing calls refresh; the access cookie is 15 min, the refresh and CSRF cookies 7 days; no other cause of the sign-out found (a customer and an admin session of one user cannot coexist, so sibling-surface revocation does not log a customer tab out).

| Id         | Severity | Finding                                                                                                                                                             | Resolution                                                      |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| F-1        | blocker  | Every refresh/login mints a new CSRF token: other tabs go stale and their next mutation gets 403                                                                    | Part 1.1 (reuse the cookie) + client CSRF resync                |
| F-2        | blocker  | New tab in production cannot refresh (no token, host-only cookie)                                                                                                   | Option (d): `GET /auth/csrf` (Part 1.2); (a), (b), (c) rejected |
| F-3        | major    | Two tabs refreshing at once: the loser is signed out                                                                                                                | `navigator.locks` + shared promise                              |
| F-4        | major    | Replay must rebuild headers (CSRF rotates)                                                                                                                          | `apiFetch` rebuilds on each attempt                             |
| F-5        | major    | Eligibility rule too coarse; handler-level 401s exist                                                                                                               | Explicit rule (Part 2.3)                                        |
| F-6        | major    | Two raw `fetch` uploads bypass the client                                                                                                                           | Routed through `apiFetch`                                       |
| F-7        | major    | Replay safety rests on JwtAuthGuard running first                                                                                                                   | Invariant documented; replay only for guard 401                 |
| F-8        | major    | Optional-auth route turns expiry into a visitor view                                                                                                                | Recorded as a known limit                                       |
| T-1        | major    | e2e cannot show the production 403                                                                                                                                  | Unit test with no stored token + API tests                      |
| S-1 to S-9 | minor    | Banner/layout parallel `/auth/me`, redirect rules, recursion, payment replay, logging, network-error taxonomy, lock ordering, scope split, no rate limit on refresh | Folded into the proposal, tests and criteria above              |

Correction to the first draft: `apps/web` has no refresh method (the "copy" claim was wrong), and `/auth/refresh` has no rate limit.

## Deviations from the plan

- **`GET /auth/csrf` requires a real session cookie.** The first version answered 200 to a request carrying only the CSRF cookie (the existing-value shortcut of `ensureSurfaceCsrfCookie` ran before any session check). Found by the Playwright run, fixed test-first (API e2e + unit test "only a CSRF cookie is not a session"), as the ticket asks.
- **Always `GET /auth/csrf` before `POST /auth/refresh`** (even when a token is stored), instead of only when none is stored: the cookie value is always right and a stale stored token cannot make the refresh fail. One cheap extra request every 15 minutes. A 401/403 on the CSRF call ends the session without calling refresh (a visitor with no cookie costs one request).
- **Cross-tab dedupe by a timestamp** (`ttw_customer_renewed_at` in `localStorage`): inside the lock, a tab whose request started before the last successful renewal skips its own refresh and just replays. Without it, two tabs would refresh one after the other (safe, but two refreshes). Falls back to sequential refreshes when `localStorage` or `navigator.locks` is missing.
- **Rate-limit identity** for the two new buckets is a truncated sha256 of the session cookie (refresh, then access, customer then admin), or of the body `refresh_token`, or `ip:<ip>` when there is none. The generic guard would otherwise key both on the shared `anon` identity. Buckets: `session_refresh` 30/min per identity and 120/min per IP, `csrf_token` 60 and 240.
- **Renewal failures that are not a sign-out** are thrown as `{ statusCode: <refresh status or 503 for a network error>, code: 'SESSION_RENEWAL_FAILED' }`, never 401.
- `csrfHeaders()` (only used by the two uploads) was removed from `apps/app/lib/api.ts`: dead code after they moved to `apiFetch`.
- `useRequireUser` / `resetSession` (TTW-260) do not exist on this branch (TTW-260 is unmerged), so "a successful refresh does not call `resetSession()`" is satisfied by construction: renewal never touches the session cache. Screens redirect to `/auth/login` themselves on a 401, as before. Likely merge conflict with TTW-260: it edits `apps/app/lib/auth.ts` and `current-user.ts`; this ticket edits neither (only `lib/api.ts`, `lib/designs.ts`).
- **Known limit confirmed:** the only `OptionalJwtAuthGuard` route is `GET /designs/:id/thumbnail`, loaded by the browser as an image, not through `apiFetch`, so it is not affected.
- `apps/web` and `apps/admin` untouched, as decided (follow-up tickets before launch).

## Implementation reviews

Independent implementation review (security and session/CSRF/replay charter, High risk), read-only agent, 2026-11-24. Verdict: **PASS WITH CHANGES**, no blocker.

| Id   | Severity | Finding                                                                                           | Resolution                                                                                                                                                                                                                                                                      |
| ---- | -------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | major    | No timeout on the renewal calls: a hung refresh holds `navigator.locks` and freezes every tab     | 15 s `AbortController` timeout in `renewalCall`, mapped to a retryable `SESSION_RENEWAL_FAILED`; unit test with a never-answering refresh (fake timers), promise reset checked                                                                                                  |
| 2    | major    | A "renewed at" stamp from the future (clock stepped back, garbage) could skip every later refresh | Stamps greater than `Date.now()` or not numeric are ignored; two unit tests                                                                                                                                                                                                     |
| 3    | minor    | Refresh kept any CSRF cookie value, including a planted one                                       | Refresh keeps it only if it is 64 hex characters, otherwise mints a new one (API e2e + unit). `ensureSurfaceCsrfCookie` (`GET /auth/me`, `GET /auth/csrf`) left unchanged: existing tests assert it echoes any existing value; recorded in doc 14                               |
| 4    | minor    | `GET /auth/csrf` answered 200 without a token, then refresh got 403 and looked like a sign-out    | Retryable error instead; unit test                                                                                                                                                                                                                                              |
| 5    | minor    | Body token fields could buy a fresh rate-limit identity on refresh                                | Session buckets ignore body fields (e2e + guard unit test). Per-token identity resets on rotation and a shared IP can be exhausted: the IP limit is the real cap, accepted. Redis outage = 503 on refresh, retryable: written in doc 14                                         |
| 6    | minor    | Test gaps                                                                                         | Added `/auth/me-evil`, `/auth/mex`, `/auth`, `/auth/sessionsX`, `/auth/me/../login`, future/garbage stamp, hung renewal, csrf 200 without token. Refresh with a wrong or no Origin is already covered by `auth-surface.e2e-spec.ts` ("cross-site refresh…", "no Origin at all") |
| 7    | nit      | A refresh in flight during logout could set cookies after the logout clear                        | Not fixed, narrow window; the old refresh token is already rotated and the next 401 ends in login. Follow-up candidate                                                                                                                                                          |
| 8    | nit      | A wrong-password 401 on `/auth/change-password` triggers one refresh and one second attempt       | Accepted by the ticket rule                                                                                                                                                                                                                                                     |
| 9–10 | nit      | `Headers` instance/array headers dropped; path matching case-sensitive                            | Pre-existing / harmless: every caller passes a plain record and lowercase paths                                                                                                                                                                                                 |

Second review pass: not requested, the verdict had no blocker and every major and minor is fixed with a test.

## Verification evidence

Run from the worktree, 2026-11-24. Order: tests first (red), then code (green).

- Red first: `pnpm test:e2e auth-session-renewal` → 9 failed / 5 passed before the API change; `npx jest __tests__/lib/api-session-renewal.test.ts` (apps/app) → 41 failed / 4 passed before `apiFetch`.
- `pnpm test:e2e auth-session-renewal` (apps/api): 15/15 pass (refresh keeps CSRF cookie, body-only mints new, rotated token 401, parallel refresh one winner, csrf cases incl. no cookie / CSRF-cookie-only / wrong or missing Origin / other surface / no-store, rate limits).
- `npx jest __tests__/lib/api-session-renewal.test.ts` (apps/app): 45/45 pass (replay with new CSRF and same body, 5 parallel 401 = one refresh, two tabs with a lock never refresh together, eligibility table, 401/403/5xx/429/network on refresh, CSRF resync once, FormData uploads, no console output).
- `pnpm typecheck`: 6/6 successful. `pnpm lint`: 0 errors (existing warnings only). `pnpm format:check`: pass.
- `pnpm test` (after the review fixes): api 2383 tests, app 419 tests, web 84 tests, all pass.
- API auth e2e: `pnpm test:e2e auth- e2e-app-auth google-oauth` (after the review fixes): 7 of 8 suites pass (72/73 tests). The failing one, `auth-link-retention.e2e-spec.ts` ("jobs never failed", a BullMQ mail-job timeout), fails the same way on the main checkout without these changes (environment: mail queue), so it is not caused by this ticket.
- `pnpm openapi:generate` then `pnpm openapi:check`: drift check passed. `pnpm docs:validate`: pass. `pnpm playwright:validate`: pass (spec added to `APP-CUSTOMER-DASH`).
- `pnpm test:coverage`, `pnpm coverage:ratchet`: pass (api lines 86.34%). `git fetch origin main` then `pnpm coverage:diff`: 22/22 lines covered (100%, floor 80%); it needed new unit tests for the controller and the guard (added).
- Playwright `tests/e2e/app/session-renewal.comprehensive.spec.ts` (2 tests) passes: with only `ttw_customer_access` cleared, a sidebar click ends on Product List, still signed in, exactly `GET /v1/auth/csrf` then `POST /v1/auth/refresh`; with both cookies cleared, login page, no refresh call. **Not run the standard way:** the `setup` project fails on this machine's shared database (`order-cancel.e2e@tamiym.test` is not seeded: `Invalid credentials`; re-seeding the shared DB is forbidden), so the spec ran with `--no-deps` (it logs in itself), and with the installed Google Chrome (`channel: 'chrome'` through a temporary config, deleted) because Playwright's bundled Chromium is not downloaded here. The spec was rerun after the review fixes (API and app rebuilt) and passes. A repetition x3 hit the 5 logins per minute limit, as expected from the repeat; single runs are green.

Not verified: the production case (API on another origin, empty `sessionStorage`, unreadable cookie) beyond the unit test with no stored token and the API tests; two real browser tabs at once (covered by the mocked `navigator.locks` unit test only); Firefox/WebKit; the full Playwright matrix.

## Completion summary

The customer app now renews its session: on an eligible 401 it asks `GET /auth/csrf`, refreshes once (one flight per tab and per browser, with a timeout), and replays the request once with the new CSRF token, including the two workshop uploads. The API keeps the CSRF cookie across refreshes (only a well-formed value), exposes `GET /auth/csrf` (session cookie required, `no-store`) and rate limits both routes. Doc 14, Swagger, OpenAPI and shared types are updated. Acceptance criteria are all met with the evidence above, except the limits listed under "Not verified". Follow-ups before launch: the same renewal for `apps/web` and `apps/admin` (listed in the ROADMAP under "Mise en ligne"), and optionally aborting a renewal on logout (review nit 7). Expect a merge conflict risk with TTW-260 only if it touches `apps/app/lib/api.ts` (it edits `auth.ts` and `current-user.ts`).

## Follow-up after the first CI run on `main` (2026-11-24)

`Playwright Comprehensive` failed on the merge commit `07826ad` (run 45497523841):

- **`session-renewal.comprehensive.spec.ts` "without any session cookie…"** failed twice: the page stayed on `/dashboard/products` (and once the sidebar link was not found). Cause: a request with no session credential was counted under the shared identity `ip:<address>` (60 per minute for `GET /auth/csrf`), so in a busy suite signed-out visitors were answered 429, which the client reads as a retryable error and the layout shows as an error screen instead of redirecting to the login page. The same would hit visitors behind one address in production. Fix: `AuthRateLimitGuard` no longer counts a `session_refresh` / `csrf_token` request that carries no session cookie and no body `refresh_token` (the handler answers 401 at once). Tests first: two guard unit tests (red, then green) and an API e2e (`auth-session-renewal`, 65 and 35 credential-less calls, never 429). The guard test that asserted the old `ip:` identity for a cookie-less refresh was replaced by these (it encoded the defect). Doc 14 updated.
- **`session-boundaries.smoke.spec.ts` "customer app stores the API CSRF token in sessionStorage"** failed once then passed on retry. Since TTW-260 the dashboard heading appears before `/auth/me` returns, so the test read `sessionStorage` too early. It now waits for the token with `expect.poll`; the assertions are unchanged.

Not re-run: the two Playwright specs (ports 3001/3002 are held by other sessions' servers); the API e2e `auth-session-renewal` passed (18/18) in isolation and in most full runs, but failed intermittently (404/403 on unrelated calls) while other sessions' API processes ran against the shared Redis/database.

## CI on `main` after the fixes (2026-11-25)

| Run                                    | Commit    | Result                                                                                       |
| -------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `CI` 45503397872                       | `bfd5e97` | success                                                                                      |
| `Playwright Comprehensive` 45503397921 | `bfd5e97` | success: 276 passed, 3 skipped, including both `session-renewal.comprehensive.spec.ts` tests |

The no-cookie spec first failed on `07826ad` and `8a06515` because it clicked a sidebar link: the signed-in user is cached for a minute (TTW-260), so no request answered 401 inside the page. It now loads the page with `page.goto`; the claim it checks is unchanged. The first suspicion (429 from the shared per-IP identity) was not the cause of that failure, but the guard fix stays: signed-out visitors are no longer counted in those buckets.

Follow-ups before launch (ROADMAP, "Mise en ligne"): the same renewal for `apps/web` (no refresh method yet) and `apps/admin`.
