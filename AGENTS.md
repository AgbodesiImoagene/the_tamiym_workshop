# AGENTS.md

Project overview, standard scripts, and architecture live in `README.md` and `docs/` (start with `docs/README.md` and `docs/11-development-setup.md`). This file only records durable, non-obvious guidance for agents.

## Cursor Cloud specific instructions

The VM already has dependencies installed by the startup update script (`pnpm install --frozen-lockfile` + `pnpm --filter api exec prisma generate`, run under Node 24). The notes below cover things that are NOT obvious from the repo docs.

### Node version (important)

- The repo requires Node `^24` and `.npmrc` sets `engine-strict=true`, so pnpm refuses to run on other majors.
- The VM's default non-interactive `node` is a fixed Node 22 binary at `/exec-daemon/node` that sits ahead of nvm on `PATH`. Node 24 is installed via nvm (`nvm alias default 24`).
- Interactive/login/tmux shells get Node 24 automatically via a PATH-prioritization block appended to `~/.bashrc`. If a script/command runs with the wrong node, activate it explicitly:
  `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24`.
- Run `pnpm dev` and other project commands from a login/tmux shell (e.g. `bash -l`) so Node 24 is active.

### Backing services (Docker)

- Postgres (5432), Redis (6379), and MinIO (9000 / console 9001) come from `docker compose up -d` (see `docker-compose.yml`). The API needs Postgres + Redis to boot; MinIO backs asset uploads.
- There is no systemd in the VM, so the Docker daemon must be started manually and kept running, e.g. in a tmux session: `sudo dockerd`. `/etc/docker/daemon.json` is preconfigured for this VM (`storage-driver: fuse-overlayfs`, `containerd-snapshotter: false` — required for Docker 29 + fuse-overlayfs). The `ubuntu` user is in the `docker` group, so `docker`/`docker compose` work without sudo once the daemon is up.
- The optional `observability` compose profile (Jaeger/Prometheus/Grafana/OTel collector) is not needed for normal dev.

### API env files (both are needed, both are gitignored)

- `apps/api/.env.local` — read by NestJS `ConfigModule` at runtime.
- `apps/api/.env` — read by the Prisma CLI, because `apps/api/prisma.config.ts` uses `dotenv/config` which only loads `.env` (not `.env.local`). Without `DATABASE_URL` here, `prisma migrate`/`db seed` fail with "datasource.url property is required". Keep the two files in sync (they can be identical for local dev), or export `DATABASE_URL` before running Prisma CLI.
- `apps/api/.env.test` — read when `NODE_ENV=test` (integration/e2e). These files are recreated by hand if missing; there are `*.example` templates in `apps/api/`.
- The API refuses to boot in non-test mode if `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`DATABASE_URL` are unset or left as the documented placeholders (see `validateEnv` in `apps/api/src/app.module.ts`).

### Database setup

- The `tamiym_workshop_test` database used by integration/e2e is NOT created by compose (which only creates `tamiym_workshop`). Create it once: `docker exec tamiym-postgres psql -U postgres -c "CREATE DATABASE tamiym_workshop_test;"`.
- Apply schema with `pnpm --filter api exec prisma migrate deploy` (dev and test DBs). The seed (`prisma db seed`) only loads Nigerian geo reference data (states/LGAs) — it does NOT create products or an admin user. Use `apps/api/scripts/create-admin-user.ts` (`pnpm --filter api admin:create`) or `pnpm --filter api seed:e2e` for those.

### Running / ports

- `pnpm dev` runs all apps concurrently: web `http://localhost:3000`, API `http://localhost:3001` (global prefix `/v1`, Swagger `/docs`, health `/v1/health`), customer app `http://localhost:3002`, admin `http://localhost:3003`.
- The customer app (`apps/app`) auth/register + dashboard flows are wired to the API (`NEXT_PUBLIC_API_URL`, default `http://localhost:3001/v1`, cookie-based auth). CORS on the API allows origins 3000/3002/3003 by default.

### Tests

- Unit tests: `pnpm test` (no services required).
- API integration/e2e: `pnpm --filter api test:e2e` — requires Postgres (`tamiym_workshop_test`) + Redis running and `apps/api/.env.test`.
- Coverage gates (`pnpm coverage:ratchet`, `pnpm coverage:diff`) compare against `origin/main`; run a `git fetch origin main` first if the base ref is missing.

### Known non-fatal noise

- The optional native `canvas` module (a transitive optional dep of `jsdom`) fails to compile on this VM (no prebuilt binary for Node 24, no Cairo dev headers). This is harmless: `jsdom` runs without it and `pnpm install` still exits 0.
