# TTW-076 — Improve public performance and media discoverability

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** In progress (slice 1)\
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

- `apps/web/lib/media/` — governed media registry and social preview builders.
- `docs/discovery/ttw-076-interim-policy.md` — interim budgets and asset baseline.
- `apps/web/app/page.tsx:1` — image-led home acquisition page.
- [Web Vitals](https://web.dev/articles/vitals)

## Acceptance criteria

- [x] Approved mobile/desktop budgets and baselines cover each representative public template. _(Documented in interim policy + `budgets.ts`.)_
- [ ] Prioritized render, bundle, font, image, caching and third-party findings are fixed or explicitly ticketed. _(Large hero recompression deferred slice 2.)_
- [x] Public media has correct dimensions, semantics, rights/lifecycle, caching and safe social fallbacks. _(OG default + fundraiser thumbnail fallback.)_
- [ ] Production-build lab tests pass reviewed thresholds, and field telemetry is configured where sample size permits. _(Deferred TTW-078 / TTW-077.)_
- [x] Failure tests preserve usable content and avoid exposing private/quarantined assets. _(Registry validation + default OG fallback.)_

## Out of scope

- Replacing the approved visual design solely to improve a synthetic score.
- Media-ingestion security → TTW-021.

## Design review

**Reviewer:** AI implementation agent (slice 1)\
**Date:** 2026-08-22\
**Verdict:** APPROVED for slice 1 implementation

| Area            | Assessment                                                          |
| --------------- | ------------------------------------------------------------------- |
| Blast radius    | Public metadata + media registry; no API changes                    |
| Routes          | Representative route list + interim mobile LCP/CLS/INP targets      |
| Social contract | Default 1200×630 OG; fundraiser uses approved public thumbnail      |
| Asset baseline  | Documents 4–10 MB hero sources; recompression deferred              |
| Font strategy   | System fallback interim; `next/font` deferred                       |
| Deferred        | Lighthouse CI (TTW-078), RUM (TTW-077), asset recompression slice 2 |

## Implementation reviews

**Reviewer:** Independent implementation reviewer (slice 1)\
**Date:** 2026-08-22\
**Verdict:** PASS with documented deferrals

| Finding             | Resolution                      |
| ------------------- | ------------------------------- |
| Hero asset size     | Deferred measured recompression |
| Lighthouse CI gates | Deferred TTW-078                |
| Field vitals        | Deferred TTW-077                |

## Verification evidence

- `pnpm --filter web test` — media registry + metadata unit tests
- `pnpm performance-media:validate:test`
- `pnpm docs:validate`
- `pnpm --filter web build`
- PR CI — pending

## Completion summary

Slice 1 adds a governed media registry, default OG/social preview metadata, fundraiser thumbnail previews, documented mobile lab budgets, and storage remote image patterns. Asset recompression, Lighthouse CI, and field telemetry remain deferred.
