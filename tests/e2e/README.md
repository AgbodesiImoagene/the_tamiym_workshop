# Playwright browser acceptance (`tests/e2e`)

Foundation for `docs/16-playwright-regression-strategy.md` (TTW-004).

## Roles and isolation

| Fixture / storage state | Seed user                   | App surface            |
| ----------------------- | --------------------------- | ---------------------- |
| `customer.json`         | `customer.e2e@tamiym.test`  | Customer app (`:3002`) |
| `organiser.json`        | `organizer.e2e@tamiym.test` | Customer app (`:3002`) |
| `admin.json`            | `admin.e2e@tamiym.test`     | Admin (`:3003`)        |

Password for all seed users: `TestPassword1!` (see `apps/api/scripts/seed-e2e-dummy-data.ts`).

Auth states are written under `tests/e2e/.auth/` (gitignored) by the `setup` project via API login. **Do not commit them.**

Until **TTW-020**, admin and customer share API cookie _names_ (`access_token` / `refresh_token`). Fixtures still use **separate browser contexts and users**. Smoke proves customer storage cannot use the admin UI and cannot call `/v1/admin/*`; it does not claim host-level cookie isolation.

## Commands

```bash
# One-time / CI prep
pnpm db:generate
pnpm --filter api exec prisma migrate deploy   # needs DATABASE_URL test DB
pnpm --filter api seed:e2e
pnpm build
pnpm exec playwright install chromium

# Smoke (Chromium; starts built servers unless already running)
pnpm test:e2e:smoke

# Comprehensive UAT (viewport matrix × web/app/admin + representative a11y).
# CI runs it on every push to main, nightly, and on manual dispatch (playwright-comprehensive.yml).
pnpm test:e2e:comprehensive

# Full-matrix script (also selects Firefox/WebKit/mobile/a11y/visual; install browsers first)
pnpm exec playwright install
pnpm test:e2e:matrix

# Accessibility or visual only (not on PR smoke)
pnpm test:e2e:a11y
pnpm test:e2e:visual

# Validate PRD-to-test manifest
pnpm playwright:validate
```

PRD-to-test traceability: `docs/playwright/prd-test-manifest.json` (validated in CI via `pnpm playwright:validate`). Interim browser UAT policy: `docs/playwright/ttw-053-interim-policy.md`.

Local tip: export the same env as API Integration (or use `apps/api/.env.test`) before migrate/seed/start.

## Specs that write shared settings

Site settings are one global row that checkout and payout specs read. Specs that really change it live in `tests/e2e/admin-settings-writes/` and run in the `chromium-admin-settings-writes` project (TTW-211), which starts only after the web, app, admin and journey projects have finished, takes its tests one at a time, and restores the row after each test. Do not put such a spec in the other projects. Keep a single spec file in it (`fullyParallel: false` only serialises the tests of one file). The matrix-only projects (Firefox, WebKit, mobile, a11y, visual) depend on `setup` alone and can overlap with it: none of them prices an order today, so add a dependency if one ever does.

## Running beside other checkouts or worktrees

The suites share three things that collide when two runs overlap on one machine:

- **Ports.** `playwright.config.ts` starts web, app and admin on 3000, 3002 and 3003 (the API port comes from `PORT` / `PLAYWRIGHT_API_URL`). With `reuseExistingServer` a second run silently attaches to the first run's servers and fails when they stop. Run one suite at a time on a machine.
- **Redis.** The API's login rate limits (`429 Too many requests`) live in Redis and survive between runs. Many reruns in a few minutes make the admin login in the `setup` project fail with a 429 and every test fail after it. Give each worktree its own Redis database (`REDIS_DB=<n>` in `apps/api/.env`, `.env.local` and `.env.test`) or wait for the window to pass.
- **Database.** `seed:e2e` cannot run twice on one database (TTW-210): drop and re-create the test database before each full run.

## Tags

`@smoke` `@web` `@app` `@admin` `@journey` `@comprehensive` (plus `@critical` `@a11y` `@visual` for later tickets).
