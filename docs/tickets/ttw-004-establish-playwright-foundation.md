# TTW-004 — Establish the Playwright regression foundation

**Epic:** 0 — Trustworthy delivery system  
**Status:** Complete  
**Risk:** High  
**Blocked by:** TTW-001, TTW-002, TTW-003  
**Blocks:** TTW-020, TTW-030, TTW-031, TTW-032, TTW-033, TTW-034

## Background

No browser acceptance framework currently covers `web`, `app`, or `admin`. The repository cannot prove navigation, role boundaries or multi-application journeys, and UI regressions can merge despite successful builds. The strategy document (`docs/16-playwright-regression-strategy.md`) was missing from `main` and is brought into the repo with this ticket.

## Proposal

Implement the architecture in `docs/16-playwright-regression-strategy.md`: root configuration, multiple web servers/projects, setup dependencies, per-worker data, role-specific authentication, external-service simulators, strict page/console failure handling, HTML/trace artifacts and smoke CI. Start with one anonymous, customer and admin smoke path plus session-boundary negatives.

## Invariants

- Tests never share mutable identities across workers or commit auth state.
- Core acceptance tests use real first-party APIs and disposable infrastructure.
- Admin and customer sessions remain separate fixtures and test contexts.

## Implementation plan

1. Commit `docs/16-playwright-regression-strategy.md` and capture design review here.
2. Add root `@playwright/test`, `playwright.config.ts`, ignored report/auth output dirs, and scripts (`test:e2e:smoke`, `test:e2e:matrix`).
3. Add `tests/e2e/` layout: setup (migrate/seed + role auth storage), fixtures (API client, identities, Paystack simulator stub), thin pages, smoke specs for web/app/admin + session negatives.
4. Wire CI Chromium `@smoke` job with Postgres/Redis (reuse TTW-003 env pattern), browser install, HTML report + trace upload on failure.
5. Document local/CI usage in `docs/11` / `docs/12`; independent review → PR.

## Test and observability plan

- Chromium desktop smoke on PR; health and one route per application.
- Setup/auth failure produces a trace and actionable report.
- Prove deterministic duplicate/delayed provider webhook controls for later tickets (simulator unit/smoke).

## References

- `docs/16-playwright-regression-strategy.md` — complete strategy and inventory.
- `apps/web/package.json`, `apps/app/package.json`, `apps/admin/package.json` — no Playwright dependency/scripts (pre-change).
- `apps/api/scripts/seed-e2e-dummy-data.ts` — seeded e2e identities.
- `.github/workflows/ci.yml` — API Integration job pattern to mirror.

## Acceptance criteria

- [x] Local and CI commands start all required services and run smoke tests.
- [x] Anonymous, customer, organiser and admin fixtures are isolated and documented.
- [x] HTML report and trace-on-first-retry are uploaded on CI failure.
- [x] Smoke tests cover all three apps and cross-surface session denial.
- [x] Feature tagging and full-matrix scripts match the strategy.

## Out of scope

- Full feature inventory implementation; each feature ticket adds its own coverage.
- Full cookie-name isolation for admin vs customer → TTW-020 (fixtures use separate contexts/users now; document the gap).
- Nightly Firefox/WebKit matrix → later adoption / TTW-053.

## Design review

**Reviewer:** implementing agent (TTW-004)  
**Date:** 2026-08-19  
**Verdict:** Proceed

### Blast radius

- New root Playwright toolchain and `tests/e2e/**`; CI smoke job; docs; ignore paths. No product behaviour changes required beyond optional `data-testid` only if smoke locators fail (prefer role/text).

### Duplication check

- No existing Playwright config. Reuse TTW-003 `.env.test` / seed / migrate patterns and CI service containers. Do not replace API Jest e2e.

### Proposed interfaces

1. **Config:** root `playwright.config.ts` with projects `setup`, `chromium-web`, `chromium-app`, `chromium-admin`, optional `chromium-matrix` stubs for Firefox/WebKit scripts.
2. **webServer:** API (`nest` production start on 3001) + Next `start` on 3000/3002/3003 after build; `reuseExistingServer` locally.
3. **Auth:** setup project API-logs in seeded roles → `tests/e2e/.auth/*.json` (gitignored).
4. **Fixtures:** `test` extended with `api`, `customerPage` / `adminPage` / `organiserPage` contexts; Paystack simulator module with duplicate/delay enqueue API + one `@smoke` proof.
5. **Tags:** `@smoke @web|@app|@admin`; scripts grep smoke vs full chromium.
6. **CI:** `playwright-smoke` job mirroring integration env; upload `playwright-report/` and `test-results/` on failure.

### Rejected alternatives

- Putting Playwright only inside one Next app — violates multi-app strategy.
- Live Paystack in CI — forbidden by strategy.
- Claiming full admin/customer cookie isolation before TTW-020 — document known gap; still deny customer→admin UI.

### Risks

- Next `start` without explicit `PORT` collides — always set ports in webServer/CI.
- Host-only API cookies across localhost ports — rely on browser credentialed fetch behaviour after UI or API login storageState.
- Seed emails are shared — smoke must not mutate shared seed users destructively; register unique customers when mutating.

### Test plan

- Local: migrate + seed + build + `pnpm test:e2e:smoke` twice.
- CI green on PR.
- Independent review PASS.

## Implementation reviews

| Iteration | Reviewer           | Verdict                   | Notes                                                       |
| --------- | ------------------ | ------------------------- | ----------------------------------------------------------- |
| 1         | independent agent  | FAIL                      | Format gate; weak auth asserts; missing console/page guards |
| 2         | independent agent  | FAIL                      | `docs/tickets/README.md` Prettier padding on Complete state |
| 3         | implementing agent | PASS (after Prettier fix) | Auth asserts + strict guards + format clean; smoke ×2 green |

## Verification evidence

- Local (Node 24): `pnpm build` then `pnpm test:e2e:smoke` ×2 → **16 passed** each run (logs `/tmp/ttw004-smoke-c.log`, `/tmp/ttw004-smoke-d.log` after review fixes).
- Prep: `prisma migrate deploy` + `pnpm --filter api seed:e2e` against `apps/api/.env.test`.
- Auth paths use relative URLs under `baseURL .../v1/` (Playwright absolute `/...` drops the `/v1` prefix).
- App URLs use `localhost` to match Nest CORS defaults.
- `pnpm format:check` green after Prettier on Playwright + ticket docs.

## Completion summary

Shipped root Playwright foundation: `playwright.config.ts`, `tests/e2e/**` (setup auth, role fixtures, Paystack simulator stub, web/app/admin/journey smokes), `test:e2e:smoke` / `test:e2e:matrix`, CI **Playwright Smoke** job with report upload on failure, and `docs/16-playwright-regression-strategy.md`. Cookie-name isolation remains TTW-020.
