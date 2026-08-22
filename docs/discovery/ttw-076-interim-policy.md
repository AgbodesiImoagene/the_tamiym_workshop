# TTW-076 — Performance and media discoverability interim policy (slice 1)

**Version:** `performance-media/v1-interim-2026-08-22`  
**Ticket:** TTW-076  
**Status:** Engineering interim — design asset recompression campaign deferred

## Representative public routes

| Route                           | Template         | Slice 1 focus               |
| ------------------------------- | ---------------- | --------------------------- |
| `/`                             | Home acquisition | Hero LCP, default OG        |
| `/about`                        | Trust landing    | Hero + editorial images     |
| `/fundraiser`                   | Service landing  | Hero LCP                    |
| `/fundraiser/[slug]`            | Campaign detail  | API thumbnail OG fallback   |
| `/guides/how-fundraising-works` | Guide            | Text-first, linked journeys |
| `/solutions/bulk`               | Bulk landing     | Hero + split sections       |
| `/404`                          | Error            | Text-only baseline          |

## Interim mobile lab budgets (not CI-gated yet)

| Metric | p75 target | Notes                                       |
| ------ | ---------- | ------------------------------------------- |
| LCP    | ≤ 2500 ms  | Documented baseline; enforcement in TTW-078 |
| CLS    | ≤ 0.10     | System fonts interim; custom fonts deferred |
| INP    | ≤ 200 ms   | Marketing pages are mostly static           |

Encoded in `apps/web/lib/media/budgets.ts`.

## Social preview contract

- Default OG image: `/assets/marketing/og-default.jpg` (1200×630, <250 KB target)
- `summary_large_image` requires `openGraph.images` and `twitter.images`
- Fundraiser detail pages use the first approved public design `thumbnailUrl` when present; otherwise default OG
- Private/quarantined customer media must never appear in previews

## Marketing asset baseline (slice 1 audit)

Large static JPEG/PNG heroes remain (4–10 MB source files). Slice 1 adds contracts and default OG; measured recompression and WebP/AVIF variants are deferred to slice 2 with before/after lab traces.

## Font loading (interim)

Brand font families are declared in theme tokens but not yet loaded via `next/font`. Browsers use system UI fallbacks until design approves font files and loading strategy.

## Deferred (slice 2+)

- Lighthouse / Web Vitals CI gates (TTW-078)
- Field RUM dashboards (TTW-077)
- Image sitemap extensions
- Full marketing asset recompression pipeline
- `next/font` rollout for Neuffila Grotesk / Mundial

## References

- `apps/web/lib/media/registry.ts`
- `apps/web/lib/metadata.ts`
- [Web Vitals](https://web.dev/articles/vitals)
