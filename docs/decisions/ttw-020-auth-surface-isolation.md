# ADR — TTW-020 auth surface isolation and CSRF

## Status

Accepted (implementation authority for TTW-020; product owner may amend).

## Decision

1. Two auth surfaces: `CUSTOMER` and `ADMIN`, derived from route + Origin allowlists (never from request body).
2. Distinct httpOnly access/refresh cookies and readable CSRF cookies per surface; host-only; clear legacy shared names.
3. Role×surface: ADMIN only on ADMIN; CUSTOMER|ORGANIZER only on CUSTOMER. Enforced at login, refresh, and on **every** request in `JwtStrategy.validate` (bearer included, so a role change invalidates an already-minted session), which also requires the JWT to carry a known `surface`.
4. CSRF: Origin allowlist + double-submit for any request presenting a surface access/refresh cookie. Because the cookies are host-only on the API origin, a cross-origin SPA cannot read the CSRF cookie, so the token is **also returned in the response body** (`csrf_token` on register/login/admin login/refresh/`auth/me`); the browser auto-sends the cookie and the frontend sends the stored copy from `sessionStorage` in `X-CSRF-Token`. Only requests with no session cookie at all (bearer, body-only refresh) are exempt, alongside session-establishing public paths and signature-authenticated webhooks.
5. `auth/refresh` and `auth/logout` stay `@Public()` but are CSRF-checked whenever cookies are present, and their surface comes from Origin only: a cookie-bearing request with an untrusted Origin is rejected rather than defaulted to CUSTOMER. Logout revokes and clears only the resolved surface.
6. Normalize login email; store `authSurface` on refresh tokens; revoke incompatible refresh rows on login/refresh.

## Consequences

Frontends must send credentials and `X-CSRF-Token` on mutating calls, and must persist the `csrf_token` from login/refresh/`auth/me` responses (`sessionStorage`, key `ttw_<surface>_csrf`) rather than reading the API cookie. Playwright/admin/app clients must use surface-correct cookies and Origins. TTW-023 may later add MFA and hashed refresh without changing surface cookie names.
