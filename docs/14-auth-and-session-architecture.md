# Auth and session architecture (TTW-020)

## Threat model (summary)

| Threat                                            | Mitigation                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Admin session reused on customer app (or reverse) | Distinct cookie names per auth surface; JWT carries `surface`; Origin→surface map; role×surface reject at login/refresh/me |
| CSRF via `SameSite=None` cross-site cookies       | Double-submit CSRF cookie + `X-CSRF-Token` on cookie-authenticated mutations; Origin must match surface allowlist          |
| Silent bearer weakening cookie CSRF               | Bearer-only requests skip CSRF **only when no surface access cookie is present**; cookie presence forces CSRF              |
| Unnormalized email login                          | Password login normalizes email like register/Google                                                                       |
| Legacy shared cookies after cutover               | Clear legacy `access_token`/`refresh_token`; revoke refresh rows without matching `authSurface`                            |

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

## CSRF policy

Mutating methods (`POST`/`PUT`/`PATCH`/`DELETE`) authenticated via a surface access cookie require:

1. `Origin` or `Referer` in that surface’s allowlist, and
2. Header `X-CSRF-Token` equal to the surface CSRF cookie (timing-safe compare).

Exempt: public auth endpoints that establish session; webhook/provider routes; requests authenticated **only** by `Authorization: Bearer` with **no** surface access cookie present.

## JWT / refresh

Access JWT claims: `sub`, `email`, `role`, `surface`.
Refresh `AuthToken` rows store `authSurface`. Login/refresh for surface S revokes that user’s refresh tokens with a different or null surface.

## Migration

Deploy additive `authSurface` column → issue only surface-scoped cookies → revoke null-surface refresh tokens on next login/refresh → clear legacy cookies.
