# TTW-076 — Improve public performance and media discoverability

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** Not started\
**Risk:** Standard\
**Blocked by:** TTW-071\
**Blocks:** TTW-078

## Background

Public pages are image-heavy and no ticket establishes Core Web Vitals budgets, representative route measurements, crawl rendering checks, image-discovery metadata or release thresholds. Performance regressions can reduce user conversion and discoverability, while aggressive optimization can damage visual quality or accessibility.

## Proposal

Define mobile-first performance budgets for representative home, guide, fundraiser listing/detail and error routes. Measure server response, LCP, INP and CLS in lab and field where volume permits. Optimize fonts, critical CSS, image sizing/format/priority, caching, server rendering and third-party scripts. Add descriptive media filenames/alt/captions where appropriate, image sitemap extensions only when justified and social preview assets with bounded generation/fallback behavior.

## Invariants

- Performance work preserves content semantics, accessibility, image meaning and visual acceptance.
- Private/quarantined originals or customer media are never exposed to improve discovery.
- Lab scores are diagnostic; field user experience and qualified conversion remain the outcome.

## Implementation plan

1. Define representative routes/devices/network profiles, budgets and baseline traces.
2. Audit bundle/rendering, fonts, images, cache headers, third parties and server/API waterfalls.
3. Implement prioritized optimizations with before/after evidence and accessible media semantics.
4. Add social/media discovery contracts and safe fallbacks; include public images in discovery only when rights and lifecycle allow.
5. Establish lab CI budgets and field monitoring/alert thresholds with documented variance handling.

## Test and observability plan

- Unit/component: Image/social metadata builders, dimensions/fallbacks and cache-policy tests.
- Integration/e2e: Production-build Lighthouse/Web Vitals runs and media URL/access/alt validation.
- Failure, retry, and concurrency: Missing/slow image, transformation failure, cache miss/stampede and third-party timeout.
- Logs, metrics, traces, and alerts: Field/lab vitals by template/revision, image errors, cache hit rate and bundle/transfer budgets.

## References

- `apps/web/app/page.tsx:1` — image-led home acquisition page.
- `apps/web/app/fundraiser/page.tsx:43-50` — large fundraiser marketing image.
- `apps/web/app/layout.tsx:5-13` — no social-image metadata contract.
- [Web Vitals](https://web.dev/articles/vitals)

## Acceptance criteria

- [ ] Approved mobile/desktop budgets and baselines cover each representative public template.
- [ ] Prioritized render, bundle, font, image, caching and third-party findings are fixed or explicitly ticketed.
- [ ] Public media has correct dimensions, semantics, rights/lifecycle, caching and safe social fallbacks.
- [ ] Production-build lab tests pass reviewed thresholds, and field telemetry is configured where sample size permits.
- [ ] Failure tests preserve usable content and avoid exposing private/quarantined assets.

## Out of scope

- Replacing the approved visual design solely to improve a synthetic score.
- Media-ingestion security → TTW-021.

## Design review

Record reviewer, date, routes/profiles, budgets, accessibility/visual constraints, cache/media lifecycle, monitoring and verdict.

## Implementation reviews

Independently review performance evidence, media/privacy behavior and accessibility; repeat representative measurements until PASS.

## Verification evidence

Record production revision, traces/reports, before/after distributions, asset checks, failure tests and approved variances.

## Completion summary

Summarize budgets, optimizations, media contracts, achieved results, field monitoring and remaining constraints.
