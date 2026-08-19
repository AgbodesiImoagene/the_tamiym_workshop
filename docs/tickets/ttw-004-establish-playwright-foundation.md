# TTW-004 — Establish the Playwright regression foundation

**Epic:** 0 — Trustworthy delivery system  
**Status:** Not started  
**Risk:** High  
**Blocked by:** TTW-001, TTW-002, TTW-003  
**Blocks:** TTW-020, TTW-030, TTW-031, TTW-032, TTW-033, TTW-034

## Background

No browser acceptance framework currently covers `web`, `app`, or `admin`. The repository cannot prove navigation, role boundaries or multi-application journeys, and UI regressions can merge despite successful builds.

## Proposal

Implement the architecture in `docs/16-playwright-regression-strategy.md`: root configuration, multiple web servers/projects, setup dependencies, per-worker data, role-specific authentication, external-service simulators, strict page/console failure handling, HTML/trace artifacts and smoke CI. Start with one anonymous, customer and admin smoke path plus session-boundary negatives.

## Invariants

- Tests never share mutable identities across workers or commit auth state.
- Core acceptance tests use real first-party APIs and disposable infrastructure.
- Admin and customer sessions remain separate fixtures and test contexts.

## Test and observability plan

- Chromium desktop smoke on PR; health and one route per application.
- Setup/auth failure produces a trace and actionable report.
- Prove deterministic duplicate/delayed provider webhook controls for later tickets.

## References

- `docs/16-playwright-regression-strategy.md` — complete strategy and inventory.
- `apps/web/package.json`, `apps/app/package.json`, `apps/admin/package.json` — no Playwright dependency/scripts.

## Acceptance criteria

- [ ] Local and CI commands start all required services and run smoke tests.
- [ ] Anonymous, customer, organiser and admin fixtures are isolated and documented.
- [ ] HTML report and trace-on-first-retry are uploaded on CI failure.
- [ ] Smoke tests cover all three apps and cross-surface session denial.
- [ ] Feature tagging and full-matrix scripts match the strategy.

## Out of scope

- Full feature inventory implementation; each feature ticket adds its own coverage.
