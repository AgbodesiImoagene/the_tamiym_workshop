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

# Full-matrix script (also selects Firefox/WebKit web projects; install those browsers first)
pnpm exec playwright install
pnpm test:e2e:matrix
```

Local tip: export the same env as API Integration (or use `apps/api/.env.test`) before migrate/seed/start.

## Tags

`@smoke` `@web` `@app` `@admin` `@journey` (plus `@critical` `@a11y` `@visual` for later tickets).
