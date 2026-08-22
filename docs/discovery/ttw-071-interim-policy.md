# TTW-071 — Search technical foundations interim policy (slice 1)

**Version:** `search-foundations/v1-interim-2026-08-22`  
**Ticket:** TTW-071  
**Status:** Engineering interim — product/marketing formal sign-off deferred

## Canonical origin

| Env var               | Surface                              | Default (local)         |
| --------------------- | ------------------------------------ | ----------------------- |
| `NEXT_PUBLIC_WEB_URL` | Public web metadata, sitemap, robots | `http://localhost:3000` |
| `WEB_PUBLIC_ORIGIN`   | Server fallback only                 | same as above           |

Origin is **never** derived from `X-Forwarded-Host` or other request headers.

## Indexability matrix (v1)

| Path                          | Index                           | Mechanism                              |
| ----------------------------- | ------------------------------- | -------------------------------------- |
| `/`, `/about`, `/fundraiser`  | Yes                             | Route `metadata`                       |
| `/fundraiser/[slug]`          | Conditional (ACTIVE, in-window) | `generateMetadata` + API 404 otherwise |
| `/fundraiser/[slug]/checkout` | No                              | Route layout `noindex`                 |
| `/auth/*`                     | No                              | Auth layout `noindex`                  |
| `/orders/*`                   | No                              | Orders layout `noindex`                |
| `/verify-email`               | No                              | Layout `noindex`                       |
| 404 / not found               | No                              | `not-found` metadata                   |

## Discovery files

- `app/robots.ts` — allow indexable marketing paths; disallow auth/orders/verify-email
- `app/sitemap.ts` — static paths + `GET /v1/public/fundraisers` slugs
- Checkout paths rely on page-level `noindex` (not listed in sitemap)

## Deferred (slice 2+)

- Production-build crawl gate (TTW-078)
- www/non-www redirects in `next.config.ts` (TTW-062 host alignment)
- Default OG image asset and per-campaign images
- Search Console / analytics baselines (TTW-077)

## References

- `docs/discovery/ttw-070-organic-discovery-brief.md` — URL inventory
- `apps/web/lib/metadata.ts` — metadata builders
- `apps/api/src/fundraising/public-fundraisers.controller.ts` — public slug list
