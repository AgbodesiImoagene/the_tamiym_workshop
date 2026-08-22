# TTW-072 — Public information architecture interim policy (slice 1)

**Version:** `public-ia/v1-interim-2026-08-22`  
**Ticket:** TTW-072  
**Status:** Engineering interim — product/marketing formal sign-off deferred

## Page-type map (v1)

| Path                 | Type    | Intent clusters           | Index       | Owner             |
| -------------------- | ------- | ------------------------- | ----------- | ----------------- |
| `/`                  | hub     | Q-BRAND, Q-BULK, Q-DESIGN | Yes         | Product/Marketing |
| `/solutions/bulk`    | service | Q-BULK                    | Yes         | Product/Marketing |
| `/fundraiser`        | service | Q-FUND, Q-FUND-HOW        | Yes         | Fundraising PM    |
| `/about`             | landing | Q-BRAND, Q-TRUST          | Yes         | Product/Marketing |
| `/policies/privacy`  | policy  | Q-TRUST                   | No          | Product/Marketing |
| `/policies/terms`    | policy  | Q-TRUST                   | No          | Product/Marketing |
| `/fundraiser/[slug]` | dynamic | Q-SUPPORT                 | Conditional | Engineering + API |

## Cannibalization rules

- `Q-BULK` primary destination is `/solutions/bulk`; home retains `#catalog`, `#workshop`, and `#design` anchors only.
- `Q-FUND` primary destination remains `/fundraiser`; home links to it contextually.
- Policy pages stay `noindex` until TTW-074 publishes full legal copy.

## Editorial model (code registry)

- Static page definitions live in `apps/web/lib/content/registry.ts` with owner, lifecycle, review cadence, and intent clusters.
- Claim-heavy stats and editorial sections require `evidence` records (owner, source id, reviewed date).
- Navigation and footer links are sourced from `apps/web/lib/public-ia.ts` and validated in CI.

## Navigation and breadcrumbs

- Primary nav: Bulk orders, Fundraisers, Workshop (customer app), About.
- Breadcrumbs render on marketing pages via `MarketingBreadcrumbs` + `getBreadcrumbs()`.
- Related links are explicit on `/solutions/bulk` (no auto-generated link farms).

## Deferred (slice 2+)

- CMS or database-backed editorial workflow
- Guide/how-to library (TTW-074)
- Full privacy/terms publication (TTW-074, TTW-025)
- Content freshness dashboard (TTW-077)
- Location/doorway programmatic pages

## References

- `docs/discovery/ttw-070-organic-discovery-brief.md` — query clusters and journeys
- `apps/web/lib/content/registry.ts` — governed page registry
- `apps/web/lib/public-ia.ts` — nav, footer, breadcrumbs
