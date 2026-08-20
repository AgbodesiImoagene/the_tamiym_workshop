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

## Tamiym Workshop contributor workflow

### Source of truth

- The PRD, approved designs, and current code define product behaviour.
- `AGENTS.md` is the canonical workflow. `.cursor/rules/` adds scoped technical rules; do not duplicate this workflow elsewhere.
- Work from a clean tree. Preserve user changes and stop if unrelated changes overlap the ticket.

### Ticket workflow

1. Create or update `docs/tickets/ttw-XXX.md` from `docs/tickets/TEMPLATE.md`.
2. Classify the ticket risk: low, standard, high, or critical.
3. Start `codex/ttw-XXX-short-name` from current `main`; never stack work on an unfinished ticket branch.
4. For standard, high, and critical tickets, record a design review before implementation.
5. Implement only the ticket scope; update its plan when reality differs.
6. Run the required quality gates and record exact evidence in the ticket.
7. Obtain an independent implementation review. Fix and repeat the full review until PASS.
8. Open a PR only when acceptance criteria and required gates pass. Merge only after user confirmation and green CI, then delete the ticket branch.

Independent tickets may use separate worktrees. Dependent or overlapping tickets remain sequential.

### Review levels

- Low: implementation review.
- Standard: design review plus implementation review.
- High: standard gates plus security review and integration coverage.
- Critical: high gates plus explicit invariants, threat/concurrency analysis, database enforcement, and one comprehensive independent implementation review.
- Add a second independent reviewer only when the ticket records a materially different review charter that the first reviewer cannot adequately cover, such as financial/database/concurrency correctness versus security/provider/operations. Do not duplicate a general review merely because a path is shared or critical.
- No model or price tier is mandated. Use the least costly reviewer capable of the defined charter and escalate capability only for unresolved specialist risk or when the user requests it.

Auth, authorization, uploads, schema changes, queues, admin privileges, and external integrations are high risk. Payments, refunds, payouts, ledgers, webhook settlement, and inventory concurrency are critical.

### Evidence and completion

- A claim is unverified unless supported by command output, a test name, or a file-and-line reference.
- Tests must exercise production modules and include relevant failure, retry, and boundary paths.
- Update Swagger, shared contracts, migrations, observability, and docs in the same ticket as behaviour changes.
- Existing debt may be ratcheted temporarily: introduce no new failure and reduce debt in touched areas. Critical correctness or security failures cannot be waived.
- Never commit, push, open a PR, merge, deploy, or delete a branch unless the user requested that action.
