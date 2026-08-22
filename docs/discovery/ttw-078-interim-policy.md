# TTW-078 — Discovery regression gates interim policy (slice 1)

**Version:** `discovery-gates/v1-interim-2026-08-23`  
**Ticket:** TTW-078  
**Status:** Engineering interim — full browser matrix and Lighthouse CI deferred

## Gate layers

| Layer      | Purpose                                      | Slice 1 command                                               |
| ---------- | -------------------------------------------- | ------------------------------------------------------------- |
| Manifest   | Trace Epic 7 invariants to named checks      | `pnpm discovery-gates:validate`                               |
| Validators | Policy-as-code file and registry checks      | Wired in `validate-discovery-gates.mjs`                       |
| Unit       | Registry/schema contract tests               | `pnpm --filter web test -- discovery-gates`                   |
| Playwright | Rendered metadata, robots, sitemap, llms.txt | `tests/e2e/web/discovery.smoke.spec.ts` (`@discovery @smoke`) |

Traceability lives in `docs/discovery/discovery-gate-manifest.json`.

## PR CI coverage (slice 1)

- Documentation job: `discovery-gates:validate` + unit tests via existing `docs:validate` aggregation
- Playwright Smoke job: discovery spec tagged `@smoke` runs with production build

## Waiver policy

Waivers cannot permit:

- Private route indexation
- Misleading structured data
- Security or privacy regressions

Performance budget exceptions require evidence in ticket notes and interim policy updates.

## Deferred (slice 2+)

- Lighthouse / Web Vitals enforcement in CI
- Firefox/WebKit discovery matrix (TTW-053)
- Deliberate failure rehearsal recorded in release evidence
- Full dynamic fundraiser lifecycle crawl fixtures

## References

- `docs/discovery/discovery-gate-manifest.json`
- `scripts/quality/validate-discovery-gates.mjs`
- `tests/e2e/web/discovery.smoke.spec.ts`
