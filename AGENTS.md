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

### Local macOS machine (no Docker)

- On the developer's Mac there is no Docker. PostgreSQL 17 (EDB installer, `/Library/PostgreSQL/17`) already listens on `localhost:5432` and a local Redis on `6379`, so the API integration/e2e tests and Playwright can run locally. `psql`, `createdb` and `pg_isready` are in `/Library/PostgreSQL/17/bin`, which is not on `PATH`.
- `apps/api/.env.test` points at `tamiym_workshop_test` on that server. It is already migrated and seeded, and it is shared by every session on the machine. `seed:e2e` is not idempotent, so do not re-run it there. For a Playwright run that needs a new seed, create a throwaway database whose name matches `/test|e2e/i` (for example `tamiym_workshop_test_ttw093`), then run `migrate deploy` and `seed:e2e` against it with `DATABASE_URL` overridden (and a different `REDIS_DB`). Drop it afterwards.
- Playwright uses ports 3000-3003 (and the API on 3001): do not run two Playwright runs on the same machine at the same time.

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
- Figma screenshots: `revue-client/screenshots/` (in the main checkout only: the folder is never committed, so it is absent from worktrees; read it by its absolute path under the main checkout). It holds about 54 captures of the Figma pages, desktop and some mobile, named by capture time. A page's name is written above it (for example "Dashboard/Homepage"); a capture with no name continues the previous page. Look there when a ticket says "match Figma" and the Figma canvas cannot be read.
- `AGENTS.md` is the canonical workflow. `.cursor/rules/` adds scoped technical rules; do not duplicate this workflow elsewhere.
- Work from a clean tree. Preserve user changes and stop if unrelated changes overlap the ticket.
- `docs/tickets/ROADMAP.md` is **local only**: it is listed in `.git/info/exclude`, so it is never tracked, committed or pushed, and it does not exist on GitHub or in a fresh clone. It lives in the main checkout only, not in worktrees: read and edit it there by its absolute path. Tick a ticket (`[x]`) and add rows for new tickets in that local file when the work is done; there is nothing to commit for it. `docs/tickets/README.md` and the ticket files are tracked and go through git as usual.

### Ticket workflow

1. Create or update `docs/tickets/ttw-XXX.md` from `docs/tickets/TEMPLATE.md`.
2. Classify the ticket risk: low, standard, high, or critical.
3. Start `codex/ttw-XXX-short-name` from current `main`; never stack work on an unfinished ticket branch.
4. For standard, high, and critical tickets, record a design review before implementation.
5. Implement only the ticket scope; update its plan when reality differs.
6. Run the required quality gates and record exact evidence in the ticket.
7. Obtain an independent implementation review. Fix and repeat the full review until PASS.
8. Do not open pull requests. Once acceptance criteria and required gates pass, and only when the user asks, push the ticket branch: `ci.yml` runs on every push to `codex/ttw-**` and `claude/ttw-**` branches. Read the result with `gh run list --branch <branch>` or `gh run watch`, and fix any failure on the branch. Only when the user asks and that run is green, merge the ticket branch locally into `main` and push `main`. The run on `main` is the final proof: if it fails, report it and fix it straight away. Delete the ticket branch only when the user asks.

Independent tickets may use separate worktrees. Dependent or overlapping tickets remain sequential.

### Client decisions

- Stop before coding and tell the user if the ticket's `Blocked by` names a client answer, if its question is still listed under "Décisions à obtenir du client" in `docs/tickets/ROADMAP.md`, or if the work needs a business decision the ticket does not settle.
- State the question, what it blocks and your recommendation. Never invent the answer, and never apply a default from a ticket or the roadmap without the user's approval.

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
