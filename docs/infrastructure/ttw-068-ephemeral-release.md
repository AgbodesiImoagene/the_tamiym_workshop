# TTW-068 — Ephemeral release infrastructure and CI/CD handoff

Credential-free release plumbing for The Tamiym Workshop: build once, promote by
digest, assemble an immutable release manifest, and document the
temporary-validation lifecycle. **Live DigitalOcean temporary-validation
apply/deploy remains owner-gated** (protected GitHub Environment +
`DIGITALOCEAN_TOKEN`). Production apply is **never** automated here — that is
TTW-054 with explicit human authorization.

## Build once, promote by digest

1. Build application images once from a pinned git revision (web, app, admin, api).
2. When a registry is available (owner-gated), push and record **content digests**
   (`sha256:…`) on the release manifest — not mutable tags alone.
3. Temporary-validation and production consume the **same digests**. Rebuild for
   production is forbidden; only reviewed environment inputs (capacity, hostnames,
   protected endpoints) differ.
4. Default CI/release-candidate path uses `push: false` so digests may be empty
   until a registry publish step runs under owner secrets.

## Release manifest schema

Machine-readable contract:

| Artefact                                            | Role                                      |
| --------------------------------------------------- | ----------------------------------------- |
| `infra/release/release-manifest.schema.json`        | JSON Schema (commit, images, SBOM, locks) |
| `infra/release/manifest.example.json`               | PLACEHOLDER-only example                  |
| `infra/release/scripts/build-release-manifest.mjs`  | Assemble + validate (no secrets)          |
| `infra/release/scripts/assert-release-manifest.mjs` | Validate a manifest file                  |

Required fields: `schemaVersion`, `commitSha`, `createdAt`, `images` (web/app/admin/api digests),
`sbomRefs`, `opentofu.lockfileHashes`, `opentofu.planChecksum` (PLACEHOLDER until a plan is retained),
`gateResults` (`infraValidate`, `contracts`, `observability`, `browserUat`, `backupRecovery`).

Gate status vocabulary: `pass` | `fail` | `pending` | `not_run` | `owner_gated` | `scoped_elsewhere`.

## Temporary-validation lifecycle

```text
create (OpenTofu apply → ttw-tmpval)
  → migrate (Prisma deploy against isolated Managed PG)
  → deploy digests (Compose/Caddy on Droplet; exact image digests)
  → gates (infra smoke/policy; handoff slots for TTW-050/051/053)
  → evidence (manifest + artefacts retained)
  → teardown (destroy within max lifetime; orphan scan)
```

| Step     | In-repo today                              | Live DO                                 |
| -------- | ------------------------------------------ | --------------------------------------- |
| create   | `envs/temporary-validation` plan/validate  | Owner-gated apply                       |
| migrate  | Runtime migrate service contract (TTW-063) | Owner-gated against tmpval DB           |
| deploy   | Compose + image digests on manifest        | Owner-gated deploy of exact digests     |
| gates    | `validate-all.sh` + release invariants     | Contract/browser gates Scoped elsewhere |
| teardown | `teardown-policy.json`                     | Owner-gated destroy + orphan detection  |

## Mapping to TTW-054 go/no-go

| TTW-054 stop/go theme          | TTW-068 contribution                                              |
| ------------------------------ | ----------------------------------------------------------------- |
| Immutable candidate identity   | Manifest: commit SHA + image digests + lock hashes                |
| Infra / policy smoke           | Credential-free `validate-all.sh` + release invariants            |
| Contracts (OpenAPI)            | Slot `gateResults.contracts` — **residual: TTW-050**              |
| Telemetry / alerts             | Slot `gateResults.observability` — residual TTW-051               |
| Browser / UAT                  | Slot `gateResults.browserUat` — **residual: TTW-053**             |
| Backup / restore proof         | Slot `backupRecovery` — TTW-067 design; live owner-gated          |
| Production plan reviewable     | Plan checksum placeholder; **production plan never auto-applied** |
| Explicit human production auth | Handoff only — TTW-054 owns apply/deploy                          |

**Residual honesty:** TTW-068 is blocked by TTW-050 / TTW-051 / TTW-053 in ticket text.
This ticket delivers **infra release plumbing and the TTW-054 handoff contract**. It does
**not** claim that OpenAPI contract gates or Playwright/UAT already pass against temporary
real DNS. Those remain Scoped elsewhere; manifest gate results default to
`scoped_elsewhere` / `owner_gated` until those tickets wire evidence into the same
candidate digests.

## Production plan never auto-applied

- `.github/workflows/release-candidate.yml` is `workflow_dispatch` only (no `pull_request`).
- Credential-free jobs: validate-infra, build-images (`push: false`), assemble-manifest.
- `inputs.enable_live_tmpval` defaults to **false** and fails closed for live apply:
  when true without wired owner secrets/playbook, the live gate exits non-zero with a
  clear message — it does not apply.
- Production OpenTofu apply / deploy is **out of scope**; TTW-054 requires exact project,
  region, Droplet, and plan confirmation by a human.

## Max lifetime, cost, and orphan detection

See `infra/release/teardown-policy.json`:

| Control               | Value                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `max_lifetime_hours`  | **24** (temporary-validation hard ceiling)                                                                |
| `max_monthly_usd`     | **30** (tmpval budget alert ceiling)                                                                      |
| Orphan detection      | Label selectors + owner-gated DO project scan for resources older than max lifetime or missing from state |
| Production auto-apply | **false**                                                                                                 |

Operators must destroy temporary-validation after evidence capture. Overnight retention
requires an explicit owner waiver in the release evidence pack.

## Owner-gated live apply

1. Create protected GitHub Environments `temporary-validation` / `production` with
   `DIGITALOCEAN_TOKEN` (same trust model as `infra-plan.yml`).
2. Dispatch **Release Candidate** with `enable_live_tmpval=true` only after registry
   digests are recorded and a reviewed tmpval plan exists.
3. Apply temporary-validation → migrate → deploy digests → run gates → upload evidence →
   teardown within `max_lifetime_hours`.
4. Generate a production plan artefact for TTW-054 review; **do not apply**.

## CI entry points

```bash
# Credential-free (local / CI infra job)
pnpm infra:validate
# includes assert-release-invariants

node infra/release/scripts/build-release-manifest.mjs --out /tmp/manifest.json
node infra/release/scripts/assert-release-manifest.mjs --example
node --test infra/release/scripts/__tests__/release-manifest.test.mjs
```

Workflow: `.github/workflows/release-candidate.yml` (dispatch only).

## Related

- [TTW-054 controlled release](../tickets/ttw-054-rehearse-controlled-release.md)
- [TTW-061 IaC foundation](./ttw-061-iac-foundation.md)
- [TTW-067 backup / DR](./ttw-067-backup-disaster-recovery.md)
- [Epic 6](../epics/06-production-infrastructure-as-code.md)
