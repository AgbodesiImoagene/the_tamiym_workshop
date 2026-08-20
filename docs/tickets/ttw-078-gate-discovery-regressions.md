# TTW-078 — Gate SEO, AEO and GEO regressions

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** Not started\
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

- `docs/tickets/ttw-004-establish-playwright-foundation.md` — existing browser foundation and CI lane.
- `docs/tickets/ttw-053-complete-release-browser-uat.md` — release browser/UAT evidence.
- `.github/workflows/ci.yml` — current checks do not include discovery contracts.
- `package.json:18-19` — existing smoke and browser-matrix commands.

## Acceptance criteria

- [ ] Traceability covers every Epic 7 invariant and approved public/private template with named tests.
- [ ] PR CI deterministically detects broken metadata, canonical/robots/sitemap behavior, invalid/misleading schema and private indexability.
- [ ] Temporary-release Playwright/crawl tests validate rendered content, links, consent, lifecycle and production host behavior across the approved browser matrix.
- [ ] Performance budgets and exception updates require evidence and review; artifacts make regressions diagnosable.
- [ ] Deliberate failure rehearsal proves critical discovery/privacy failures block TTW-053/TTW-054 release evidence.

## Out of scope

- Automated assertions about external ranking, citation or rich-result selection.
- Replacing provider webmaster tools with synthetic approximations.

## Design review

Record reviewer, date, traceability, fixtures/data safety, crawl/schema/browser/performance coverage, CI cost/flakes, waiver policy and verdict.

## Implementation reviews

Require independent implementation and security/privacy review; inject representative regressions and repeat the full suite until PASS.

## Verification evidence

Record exact commands, test names, route/schema coverage, deliberate failure results, CI runs, artifacts and approved baselines.

## Completion summary

Summarize test layers, coverage, CI/release wiring, failure rehearsal, performance budgets and residual external uncertainty.
