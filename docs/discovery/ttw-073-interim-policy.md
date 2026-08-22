# TTW-073 — Structured data interim policy (slice 1)

**Version:** `structured-data/v1-interim-2026-08-22`  
**Ticket:** TTW-073  
**Status:** Engineering interim — product/marketing formal sign-off deferred

## Emitted schema types (slice 1)

| Type             | Surfaces                       | Source                           |
| ---------------- | ------------------------------ | -------------------------------- |
| `Organization`   | Global layout                  | `ORGANIZATION_FACTS` constants   |
| `WebSite`        | Global layout                  | Same + `publisher` `@id` link    |
| `BreadcrumbList` | Marketing pages via `pagePath` | `getBreadcrumbs()`               |
| `WebPage`        | `/fundraiser/[slug]`           | Public fundraiser DTO title/desc |

## Explicitly omitted (deferred)

| Type                              | Reason                                               |
| --------------------------------- | ---------------------------------------------------- |
| `Product` / `Offer`               | Requires authoritative commerce DTO parity (TTW-031) |
| `AggregateRating` / `Review`      | No approved public review data                       |
| `LocalBusiness` / `PostalAddress` | No verified public NAP beyond contact email/phone    |
| `sameAs` social profiles          | Footer social URLs are placeholders (`#`)            |

## Invariants

- JSON-LD is built server-side from approved public constants/DTO fields only.
- `serializeJsonLd` escapes `<` and `assertPublicJsonLdValue` blocks private field names.
- Markup must match visible page title/description/canonical URLs at render time.
- Incomplete commerce data omits `Product`/`Offer` rather than guessing.

## References

- `apps/web/lib/structured-data/builders.ts`
- `apps/web/components/json-ld.tsx`
- `docs/discovery/ttw-070-organic-discovery-brief.md` — entity map
