# Auth and session architecture (TTW-020)

## Threat model (summary)

| Threat                                            | Mitigation                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin session reused on customer app (or reverse) | Distinct cookie names per auth surface; JWT carries `surface`; Origin→surface map; role×surface reject at login/refresh/me                                    |
| CSRF via `SameSite=None` cross-site cookies       | Double-submit: browser auto-sends the CSRF cookie, JS sends the same value (from `sessionStorage`) in `X-CSRF-Token`; Origin must match surface allowlist     |
| Forced logout / session rotation via CSRF         | `auth/logout` and `auth/refresh` are `@Public()` but **not** CSRF-exempt: any request presenting a surface access/refresh cookie is CSRF-checked              |
| Cross-surface logout or refresh                   | Surface comes from Origin only; a cookie-bearing request with an unknown Origin is rejected (never defaulted); logout revokes/clears just that surface        |
| Silent bearer weakening cookie CSRF               | Bearer-only requests skip CSRF **only when no surface session cookie is present**; cookie presence forces CSRF; bearer JWTs still carry and enforce `surface` |
| Role change after session mint                    | `JwtStrategy.validate` re-checks role×surface on every request (bearer included), so a promoted/demoted account's old session stops working                   |
| Unnormalized email login                          | Password login normalizes email like register/Google                                                                                                          |
| Legacy shared cookies after cutover               | Clear legacy `access_token`/`refresh_token`; revoke refresh rows without matching `authSurface`                                                               |

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
2. **Response body `csrf_token`** — returned by every session-issuing response: `POST /auth/register`, `POST /auth/login`, `POST /auth/admin/login`, `POST /auth/refresh`, and `GET /auth/me`. The frontend stores it in `sessionStorage` (`ttw_customer_csrf` in `apps/app`, `ttw_admin_csrf` in `apps/admin`) and echoes it in the `X-CSRF-Token` header on mutations. This half proves the request was made by our JS, not by a cross-site page.

`GET /auth/me` echoes the _existing_ cookie value when the browser already holds one and only mints a token when none is present, so opening a second tab (or landing back from the Google OAuth redirect) recovers the token without invalidating other tabs. Frontends read `sessionStorage` first and fall back to `document.cookie` for same-origin/local setups and API-driven tests.

## CSRF policy

Mutating methods (`POST`/`PUT`/`PATCH`/`DELETE`) that present a surface **access or refresh** cookie require:

1. `Origin` (fallback `Referer`) resolving to the surface whose cookie is presented, and
2. Header `X-CSRF-Token` equal to that surface's CSRF cookie (timing-safe compare).

Exempt:

- Non-mutating methods.
- `@Public()` session-establishing paths, matched by path suffix: `auth/login`, `auth/admin/login`, `auth/register`, `auth/google`, `auth/google/callback`, `auth/forgot-password`, `auth/reset-password`, `auth/verify-email`, `auth/resend-verification`.
- Exact path `…/webhooks/paystack` — authenticated by Paystack signature.
- Requests with **no** surface session cookie: `Authorization: Bearer` clients and body-only `POST /auth/refresh` (`{ "refresh_token": ... }`), neither of which a cross-site page can forge.

`POST /auth/refresh` and `POST /auth/logout` are `@Public()` (they authenticate the refresh token themselves) but are **not** on the exemption list: presenting a session cookie to them is CSRF-checked exactly like an authenticated mutation.

## Surface binding on refresh / logout

- Origin is the only trusted surface signal for a browser. A request that presents surface session cookies with an unresolvable Origin, or an Origin belonging to the other surface, is rejected (`401`) — it is never defaulted to CUSTOMER.
- CUSTOMER is assumed only for a cookie-less call that supplies `refresh_token` in the body (non-browser client).
- Logout revokes only the resolved surface's refresh row (legacy `authSurface: null` rows are revocable from either surface) and clears only that surface's cookies plus the legacy names.

## JWT / refresh

Access JWT claims: `sub`, `email`, `role`, `surface`.
`validate` rejects a token with a missing/unknown `surface`, and re-checks role×surface on every request — for bearer tokens as well as cookies — so a role change invalidates sessions minted on the wrong surface. Cookie requests must additionally match the Origin-derived surface.
Refresh `AuthToken` rows store `authSurface`. Login/refresh for surface S revokes that user’s refresh tokens with a different or null surface.

## Migration

Deploy additive `authSurface` column → issue only surface-scoped cookies → revoke null-surface refresh tokens on next login/refresh → clear legacy cookies.
