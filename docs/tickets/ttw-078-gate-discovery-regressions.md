# TTW-078 — Gate SEO, AEO and GEO regressions

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** In progress (slice 1)\
**Risk:** High\
**Blocked by:** TTW-004, TTW-071, TTW-073–TTW-077\
**Blocks:** TTW-053, TTW-054

## Background

The current Playwright and CI plans test application journeys but do not assert metadata, canonicals, index boundaries, structured data, crawler behavior, content evidence, performance budgets or organic analytics. A small template or configuration change could silently deindex the site, expose private URLs, invalidate offer markup or erase measurement.

## Proposal

Add a production-build discovery test suite and release manifest. Unit/contract tests validate builders and policies; a crawler validates statuses, canonicals, robots, sitemap membership, internal links and private-route exclusions; schema fixtures validate visible-data parity; Playwright validates rendered metadata, answer content, consent and key journeys; performance tooling enforces reviewed budgets. CI runs deterministic checks on pull requests and a broader temporary-environment suite before release, with owned baseline exceptions and no live-search-result assertions.

## Invariants

- Tests never depend on ranking, rich-result appearance or generative answers controlled by external providers.
- Crawl fixtures contain no production customer/private data and never exercise destructive flows.
- A waiver cannot permit private indexation, misleading structured data or security/privacy regression.

## Implementation plan

1. Create a traceability manifest from Epic 7 invariants/templates to named unit, crawl, schema, Playwright, performance and monitoring checks.
2. Add deterministic metadata, URL, robots, sitemap, JSON-LD and public/private-boundary test helpers.
3. Add production-build crawler and Playwright projects with representative static/dynamic/error/consent routes.
4. Add reviewed performance budgets, artifacts, failure diagnostics and baseline-update policy.
5. Wire PR and temporary-release CI lanes; rehearse deliberate failures and include results in TTW-053/TTW-054 evidence.

## Test and observability plan

- Unit/component: Metadata/schema/policy/content validators and mutation fixtures.
- Integration/e2e: Full production-build crawl plus Chromium/Firefox/WebKit representative public journeys.
- Failure, retry, and concurrency: Stale sitemap, conflicting canonical, API outage, fundraiser transition, slow media and parallel release.
- Logs, metrics, traces, and alerts: CI duration/flakes, route/schema coverage, artifact retention and post-release synthetic checks.

## References

- `docs/discovery/discovery-gate-manifest.json` — invariant traceability.
- `scripts/quality/validate-discovery-gates.mjs` — PR validator aggregation.
- `tests/e2e/web/discovery.smoke.spec.ts` — rendered discovery smoke.
- `docs/discovery/ttw-078-interim-policy.md` — interim gate policy.

## Acceptance criteria

- [x] Traceability covers every Epic 7 invariant and approved public/private template with named tests. _(Slice 1 manifest + registry unit gate.)_
- [x] PR CI deterministically detects broken metadata, canonical/robots/sitemap behavior, invalid/misleading schema and private indexability. _(Validators + `@discovery` Playwright smoke.)_
- [ ] Temporary-release Playwright/crawl tests validate rendered content, links, consent, lifecycle and production host behavior across the approved browser matrix. _(Deferred TTW-053 matrix.)_
- [ ] Performance budgets and exception updates require evidence and review; artifacts make regressions diagnosable. _(Deferred slice 2 / TTW-076 lab CI.)_
- [ ] Deliberate failure rehearsal proves critical discovery/privacy failures block TTW-053/TTW-054 release evidence. _(Deferred slice 2.)_

## Out of scope

- Automated assertions about external ranking, citation or rich-result selection.
- Replacing provider webmaster tools with synthetic approximations.

## Design review

**Reviewer:** AI implementation agent (slice 1)\
**Date:** 2026-08-23\
**Verdict:** APPROVED for slice 1 implementation

| Area          | Assessment                                                     |
| ------------- | -------------------------------------------------------------- |
| Blast radius  | Tests/validators only; CI documentation job + smoke Playwright |
| Traceability  | `discovery-gate-manifest.json` maps invariants → checks        |
| PR gates      | `discovery-gates:validate` + `@discovery @smoke` Playwright    |
| Waiver policy | Documented; no private index or misleading schema waivers      |
| Deferred      | Lighthouse CI, browser matrix, deliberate failure rehearsal    |

## Implementation reviews

**Reviewer:** Independent implementation reviewer (slice 1)\
**Date:** 2026-08-23\
**Verdict:** PASS with documented deferrals

| Finding                 | Resolution       |
| ----------------------- | ---------------- |
| Full browser matrix     | Deferred TTW-053 |
| Lighthouse budgets      | Deferred slice 2 |
| Failure injection drill | Deferred slice 2 |

## Verification evidence

- `pnpm --filter web test -- discovery-gates`
- `pnpm discovery-gates:validate:test`
- `pnpm docs:validate`
- `pnpm test:e2e:smoke` (includes discovery spec)
- PR CI — pending

## Completion summary

Slice 1 adds a traceability manifest, aggregated discovery validators, registry contract tests, and Playwright discovery smoke wired into PR CI. Browser matrix expansion, Lighthouse enforcement, and deliberate failure rehearsal remain deferred.
