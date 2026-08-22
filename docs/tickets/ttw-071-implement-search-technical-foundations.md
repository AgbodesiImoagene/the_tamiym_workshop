# TTW-071 — Implement crawl, index and canonical foundations

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** In progress (slice 1)\
**Risk:** High\
**Blocked by:** TTW-070\
**Blocks:** TTW-073, TTW-075–TTW-078

## Background

`apps/web` has one global title/description and no canonical origin, route metadata, robots endpoint, sitemap or explicit index lifecycle. Dynamic fundraiser routes return content or a generic not-found page without metadata rules. Cross-application auth, query parameters, share tokens and inactive campaigns create duplicate, private or low-quality URLs that must never be indexed accidentally.

## Proposal

Create a typed public-site origin and route-level metadata contract using Next.js metadata APIs. Implement unique titles/descriptions, canonical and social URLs, robots directives, XML sitemap generation and redirect rules. Define an explicit indexability state machine for static pages and approved public fundraisers; exclude auth, customer/admin applications, checkout/query state, previews, share tokens, unapproved/expired content and error pages. Make sitemap, canonical, internal-link and HTTP status behavior derive from the same authoritative public state.

## Invariants

- No secret/token, private design, auth/account, checkout-state, admin or unapproved resource URL is indexable or emitted in discovery files.
- Canonical hosts and protocols come from validated production configuration, never request-controlled forwarding headers.
- Missing, removed and non-public resources return truthful status/index behavior and do not masquerade as successful pages.
- Robots controls are not treated as authorization.

## Implementation plan

1. Define canonical-origin configuration, route taxonomy and indexability matrix with TTW-062 host decisions.
2. Add reusable metadata builders with absolute canonical, Open Graph and social-image contracts.
3. Implement `robots.ts`, sitemap generation, redirects and error/noindex behavior from approved public state.
4. Add dynamic fundraiser metadata, stable canonical slugs and removal/expiry lifecycle handling.
5. Validate rendered HTML, status, headers, links, robots and sitemaps in production builds and temporary release infrastructure.

## Test and observability plan

- Unit/component: Metadata builders, URL normalization, indexability transitions and sitemap filtering.
- Integration/e2e: Crawl production output across static, active/inactive fundraiser, auth, error and tokenized URLs.
- Failure, retry, and concurrency: Invalid origin, duplicate slugs, stale sitemap data, campaign transition during crawl and API outage.
- Logs, metrics, traces, and alerts: Sitemap generation failures, unexpected indexable route classes, crawler status distribution and canonical-host mismatches.

## References

- `apps/web/app/layout.tsx:5-13` — only global metadata exists.
- `apps/web/app/fundraiser/[slug]/page.tsx:12-24` — dynamic page lacks `generateMetadata`.
- `apps/web/lib/site.ts:1-18` — no public canonical-origin contract.
- `apps/web/app/not-found.tsx:5-38` — generic error surface needs explicit index behavior.

## Acceptance criteria

- [ ] Every approved public template emits a unique server-rendered title, description, canonical and share representation from typed data.
- [ ] Robots and sitemap outputs contain only preferred, indexable absolute URLs and agree with HTTP/meta directives.
- [ ] Auth, admin/customer, checkout state, previews, tokens, inactive/unapproved fundraisers and errors are excluded and covered by negative tests.
- [ ] Dynamic public lifecycle changes produce correct status, canonical, sitemap and cache behavior without stale disclosure.
- [ ] A production-build crawl reports no broken canonical, redirect-loop, orphan, accidental noindex or private-indexability findings.

## Out of scope

- Public content creation → TTW-072 and TTW-074.
- Authorization for public/private resources → TTW-020–TTW-027.

## Design review

**Reviewer:** AI implementation agent (slice 1)\
**Date:** 2026-08-22\
**Verdict:** APPROVED for slice 1 implementation

| Area             | Assessment                                                     |
| ---------------- | -------------------------------------------------------------- |
| Blast radius     | Public web metadata + one read-only API list endpoint          |
| Canonical origin | `NEXT_PUBLIC_WEB_URL` / `WEB_PUBLIC_ORIGIN`; no header trust   |
| Indexability     | Matrix from TTW-070 brief encoded in metadata, robots, sitemap |
| Private surfaces | Auth, checkout, orders, verify-email, 404 use `noindex`        |
| Sitemap scale    | Slug list only; full campaign payload not exposed              |
| Cache            | Fundraiser fetch remains `no-store` per TTW-031                |
| Deferred         | www redirect, OG images, production crawl gate (TTW-078)       |

## Implementation reviews

**Reviewer:** Independent implementation reviewer (slice 1)\
**Date:** 2026-08-22\
**Verdict:** PASS with documented deferrals

| Finding                        | Resolution                              |
| ------------------------------ | --------------------------------------- |
| Production-build crawl not run | Deferred to TTW-078                     |
| www/non-www redirect           | Deferred to slice 2 / TTW-062 alignment |
| Default OG image               | Deferred slice 2                        |

## Verification evidence

- `pnpm --filter web test` — metadata unit tests
- `pnpm docs:validate` — includes web SEO file checks
- `pnpm openapi:check` — after OpenAPI regeneration
- `pnpm --filter web build` — production metadata routes compile

## Completion summary

Summarize canonical policy, indexable templates, excluded surfaces, dynamic lifecycle, crawl results and follow-ups.
