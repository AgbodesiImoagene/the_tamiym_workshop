# ADR — TTW-020 auth surface isolation and CSRF

## Status

Accepted (implementation authority for TTW-020; product owner may amend).

## Decision

1. Two auth surfaces: `CUSTOMER` and `ADMIN`, derived from route + Origin allowlists (never from request body).
2. Distinct httpOnly access/refresh cookies and readable CSRF cookies per surface; host-only; clear legacy shared names.
3. Role×surface: ADMIN only on ADMIN; CUSTOMER|ORGANIZER only on CUSTOMER.
4. CSRF: Origin allowlist + double-submit for cookie-authenticated mutations; bearer-only without cookies is exempt.
5. Normalize login email; store `authSurface` on refresh tokens; revoke incompatible refresh rows on login/refresh.

## Consequences

Frontends must send credentials and `X-CSRF-Token` on mutating calls. Playwright/admin/app clients must use surface-correct cookies. TTW-023 may later add MFA and hashed refresh without changing surface cookie names.
