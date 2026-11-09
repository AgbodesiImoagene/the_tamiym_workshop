# Auth and session architecture (TTW-020)

## Threat model (summary)

| Threat                                            | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin session reused on customer app (or reverse) | Distinct cookie names per auth surface; JWT carries `surface`; Origin→surface map; role×surface reject at login/refresh/me                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| CSRF via `SameSite=None` cross-site cookies       | Double-submit: browser auto-sends the CSRF cookie, JS sends the same value (from `sessionStorage`) in `X-CSRF-Token`; Origin must match surface allowlist                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Forced logout / session rotation via CSRF         | `auth/logout` and `auth/refresh` are `@Public()` but **not** CSRF-exempt: any request presenting a surface access/refresh cookie is CSRF-checked                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Cross-surface logout or refresh                   | Surface comes from Origin only; a cookie-bearing request with an unknown Origin is rejected (never defaulted); logout revokes/clears just that surface                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Silent bearer weakening cookie CSRF               | Bearer-only requests skip CSRF **only when no surface session cookie is present**; cookie presence forces CSRF; bearer JWTs still carry and enforce `surface`                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Role change after session mint                    | `JwtStrategy.validate` re-checks role×surface on every request (bearer included), so a promoted/demoted account's old session stops working                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Unnormalized email login                          | Password login normalizes email like register/Google                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Account takeover through Google sign-in           | A Google identity is linked to an existing account, or creates one, only when Google confirms the email (`email_verified: true`); otherwise the callback fails with the generic `google_failed` and writes nothing (TTW-082). Already-linked Google identities keep signing in                                                                                                                                                                                                                                                                                                                                       |
| Account pre-hijacking through Google sign-in      | When a confirmed Google email is linked to an existing customer or organiser account whose email was never confirmed (active or suspended), the same transaction removes its password, revokes every session and deletes pending reset/verification links. A notice email then asks the owner to check saved addresses and phone, or, if the account is suspended, to contact support; a suspended account is still refused. Addresses, phone, name and designs are kept. Password login and password change only write if the password they checked is still the stored one, so a removal in between wins (TTW-179) |
| Database leak of reset / verification links       | Only `sha256(token)` is stored (TTW-083); the raw token exists only in the email. Sending the stored digest as a token fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Redis leak of reset / verification links          | The mail jobs carry only `{ to, resetUrl }` / `{ to, verifyUrl }` and are added with `removeOnFail: true` (TTW-184): a job that fails for good is deleted from Redis with its link, and a `warn` without address, link or error message records it                                                                                                                                                                                                                                                                                                                                                                   |
| Legacy shared cookies after cutover               | Clear legacy `access_token`/`refresh_token`; revoke refresh rows without matching `authSurface`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Surfaces

- **CUSTOMER** — customer dashboard (`apps/app`) and public web login that issues customer sessions (`apps/web` → app). Roles allowed: `CUSTOMER`, `ORGANIZER`.
- **ADMIN** — admin dashboard (`apps/admin`). Roles allowed: `ADMIN` only.

Surface is **server-derived**:

1. Prefer request path: `/v1/auth/admin/*` → ADMIN; other `/v1/auth/*` login/register → CUSTOMER.
2. For authenticated API calls, resolve from `Origin` (fallback `Referer`) against `AUTH_ADMIN_ORIGINS` / `AUTH_CUSTOMER_ORIGINS` (comma-separated). Defaults: admin `http://localhost:3003`, customer `http://localhost:3000,http://localhost:3002`.
3. Never trust a client body field for surface.

## Cookies (host-only on API host; no shared `Domain`)

| Surface  | Access                | Refresh                | CSRF (readable)     |
| -------- | --------------------- | ---------------------- | ------------------- |
| CUSTOMER | `ttw_customer_access` | `ttw_customer_refresh` | `ttw_customer_csrf` |
| ADMIN    | `ttw_admin_access`    | `ttw_admin_refresh`    | `ttw_admin_csrf`    |

Legacy names `access_token` / `refresh_token` are cleared on every set/clear.

- Production: `Secure`, `SameSite=None` (cross-subdomain frontends).
- Non-production: `SameSite=Lax`.
- Access httpOnly; CSRF cookie **not** httpOnly (double-submit).

## CSRF transport: body-returned token + double-submit cookie

The cookies above are **host-only on the API origin** (no shared `Domain`), so a frontend served from another origin cannot read even the non-httpOnly CSRF cookie via `document.cookie`. The token therefore travels two ways:

1. **Cookie** — set by the API and attached automatically by the browser on credentialed requests. This half proves the caller is the same browser that holds the session.
2. **Response body `csrf_token`** — returned by every session-issuing response: `POST /auth/register`, `POST /auth/login`, `POST /auth/admin/mfa/enroll/confirm`, `POST /auth/admin/mfa/challenge`, `POST /auth/admin/mfa/recover`, `POST /auth/refresh`, and `GET /auth/me`. (`POST /auth/admin/login` returns only an MFA challenge — no session cookies or CSRF.) The frontend stores it in `sessionStorage` (`ttw_customer_csrf` in `apps/app`, `ttw_admin_csrf` in `apps/admin`) and echoes it in the `X-CSRF-Token` header on mutations. This half proves the request was made by our JS, not by a cross-site page.

`GET /auth/me` echoes the _existing_ cookie value when the browser already holds one and only mints a token when none is present, so opening a second tab (or landing back from the Google OAuth redirect) recovers the token without invalidating other tabs. Frontends read `sessionStorage` first and fall back to `document.cookie` for same-origin/local setups and API-driven tests.

## CSRF policy

Mutating methods (`POST`/`PUT`/`PATCH`/`DELETE`) that present a surface **access or refresh** cookie require:

1. `Origin` (fallback `Referer`) resolving to the surface whose cookie is presented, and
2. Header `X-CSRF-Token` equal to that surface's CSRF cookie (timing-safe compare).

Exempt:

- Non-mutating methods.
- `@Public()` session-establishing paths, matched by path suffix: `auth/login`, `auth/admin/login`, `auth/admin/mfa/enroll/start`, `auth/admin/mfa/enroll/confirm`, `auth/admin/mfa/challenge`, `auth/admin/mfa/recover`, `auth/register`, `auth/google`, `auth/google/callback`, `auth/forgot-password`, `auth/reset-password`, `auth/verify-email`, `auth/resend-verification`.
- Exact path `…/webhooks/paystack` — authenticated by Paystack signature.
- Requests with **no** surface session cookie: `Authorization: Bearer` clients and body-only `POST /auth/refresh` (`{ "refresh_token": ... }`), neither of which a cross-site page can forge.

`POST /auth/refresh` and `POST /auth/logout` are `@Public()` (they authenticate the refresh token themselves) but are **not** on the exemption list: presenting a session cookie to them is CSRF-checked exactly like an authenticated mutation.

## Surface binding on refresh / logout

- Origin is the only trusted surface signal for a browser. A request that presents surface session cookies with an unresolvable Origin, or an Origin belonging to the other surface, is rejected (`401`) — it is never defaulted to CUSTOMER.
- CUSTOMER is assumed only for a cookie-less call that supplies `refresh_token` in the body (non-browser client).
- Logout revokes only a live `AuthSession` whose `authSurface` matches the resolved surface (exact match — no null-surface legacy path) and clears only that surface's cookies plus the legacy names.

## JWT / refresh

Access JWT claims: `sub`, `email`, `role`, `surface`, `sid` (AuthSession id).
`validate` rejects a token with a missing/unknown `surface` or `sid`, re-checks role×surface on every request, and requires the named `AuthSession` to be live (not revoked/expired) with a matching surface. Cookie requests must additionally match the Origin-derived surface.

Refresh credentials are stored only as `sha256` hashes on `AuthSession` rows (`auth_sessions`), never as plaintext. Login/refresh for surface S revokes this user’s live sessions on other surfaces. Password reset/change and admin role change revoke all live sessions. Clients may `GET /auth/sessions`, `DELETE /auth/sessions/:id`, and `DELETE /auth/sessions`.

Legacy plaintext `AuthToken` REFRESH rows are deleted on the TTW-023 session cutover migration; remaining `AuthToken` rows are for email verification and password reset only.

Password-reset and email-verification tokens are stored only as a `sha256` digest (`auth_tokens.tokenHash`, TTW-083). The raw token exists only in the emailed link, and lookups hash the submitted token first, so a database read alone cannot produce a working link. Each token is single-use: consumption deletes the row inside the same transaction as the password or verification write, and a request that finds the row already gone (a replay or a simultaneous click) gets `400 Invalid or expired …` and writes nothing. Expired tokens are rejected and removed.

The link also passes through Redis, in the BullMQ mail job that sends it (TTW-184). The reset job holds `{ to, resetUrl }` and the verification job `{ to, verifyUrl }`; neither carries a separate token field. Both are added with `removeOnFail: true` (`AUTH_LINK_JOB_OPTIONS` in `apps/api/src/constants.ts`), so a job that has used all its attempts (8, exponential backoff from 4 s, about 8.5 minutes in all) is deleted from Redis with its link instead of joining the queue's retained failed jobs. `removeOnFail: { age }` would not be enough: BullMQ trims by age only when another job fails. A sent job was already removed (`removeOnComplete: true`). Operations still see the failure: `MailProcessor` logs a `warn` naming the job, its id, the attempt count and the error's name and code, never the address, the link or the error message, and the per-attempt `queue_jobs_total{outcome="failure"}` metric is unchanged. While a job waits or retries, its data still holds a working link; that window is the retry schedule, and the link itself expires after 1 h (reset) or 24 h (verification). Other mail jobs keep the queue defaults (`removeOnFail: { count: 200 }`).

## Admin MFA (TTW-023)

ADMIN console login requires TOTP (or a single-use recovery code) before an `AuthSession` is issued. CUSTOMER/ORGANIZER flows are unchanged.

1. `POST /auth/admin/login` verifies password only and returns `{ mfa: { status }, mfa_token }` — **no cookies**.
   - `ENROLLMENT_REQUIRED` when MFA is not yet enabled; `CHALLENGE_REQUIRED` when it is.
2. Enrollment: `POST /auth/admin/mfa/enroll/start` → otpauth URI + recovery codes (plaintext once); `POST /auth/admin/mfa/enroll/confirm` with TOTP → enable MFA and set admin session cookies.
3. Challenge: `POST /auth/admin/mfa/challenge` (TOTP) or `POST /auth/admin/mfa/recover` (one recovery code) → set admin session cookies.
4. TOTP secrets are AES-256-GCM encrypted with `MFA_TOTP_ENCRYPTION_KEY` (32-byte base64) and a `keyVersion` column for rotation. Recovery codes are stored as sha256 hashes only.
5. Another admin may `POST /admin/users/:id/mfa/reset` (audited) to clear MFA and revoke sessions.

## Auth abuse throttles (TTW-023)

Auth/recovery/MFA routes use Redis-backed `AuthRateLimitGuard` (not in-memory Nest Throttler):

- Keys: `ttw:auth:rl:id:{bucket}:{normalizedEmail|user:<id>|reset:<tokenHash>|mfa:<tokenHash>}` and `ttw:auth:rl:ip:{bucket}:{req.ip}`.
- MFA identity uses **verified** JWT `sub` (signature checked; forged tokens fall back to a token fingerprint).
- Password-reset identity is a truncated sha256 of the reset token (never a shared `anon` key).
- Counters use atomic Redis `INCR`+`PEXPIRE` (Lua) so TTL cannot be lost after a partial failure.
- Deny when **either** counter exceeds the bucket limit. Client IP comes from Express with `trust proxy = 1` (first hop only).
- Redis failures fail-closed with generic `503` (same copy as `429` limits).
- Metric: `auth_throttle_total{surface,bucket,outcome}` — never labels email or IP.
- Global Nest `ThrottlerModule` also uses Redis storage (`@nest-lab/throttler-storage-redis`) for non-auth IP limits.

`mfa_token` is a short-lived JWT (`purpose`: `mfa_enroll` | `mfa_challenge`, `surface`: ADMIN, TTL 5m), not a session.

## Migration

1. TTW-020: additive `authSurface` on `auth_tokens` + surface-scoped cookies (complete).
2. TTW-023 slice 2: create `auth_sessions`, delete all `AuthToken` REFRESH rows (force re-login), issue hashed refresh + JWT `sid` only. Clear any leftover legacy cookie names on set/clear.
3. TTW-023 slice 3: `admin_mfa_credentials` + `admin_mfa_recovery_codes`; admin login returns MFA challenge until enroll/challenge/recover completes.
4. TTW-083: `auth_tokens.token` replaced by `tokenHash`; the migration deletes every existing row, so outstanding reset and verification links stop working and users request a new one.
