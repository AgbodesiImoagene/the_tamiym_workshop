# TTW-054 — Controlled release interim policy (slice 1)

**Version:** `controlled-release/v2-slice2-2026-08-22`  
**Ticket:** TTW-054  
**Status:** Engineering interim — explicit human production authorization required for any apply

This policy defines the immutable release evidence contract, stop/go gates, rehearsal scope and production authorization model. It extends TTW-068 ephemeral release plumbing with operator runbooks and credential-free preflight checks. **No production deployment, migration or rollback is automated by this repository.**

## Authority model

| Rule                  | Value                                                                             |
| --------------------- | --------------------------------------------------------------------------------- |
| Production apply      | Explicit human authorization only; never from CI or agents                        |
| Candidate identity    | Git commit SHA + image digests + lock/artefact checksums on release manifest      |
| Migration policy      | Forward-only Prisma migrations; unsafe reversal uses roll-forward recovery        |
| Backup before migrate | Verified restorable backup required before schema migration (slice 2 live proof)  |
| Financial safety      | Rollback never replays payment, refund, payout, notification or inventory effects |

## Stop/go gates (release manifest `gateResults`)

| Gate                | Slice 1 status                                                               | Evidence source                        |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| `infraValidate`     | `pass` on credential-free validate                                           | `bash infra/scripts/validate-all.sh`   |
| `contracts`         | `pass` when OpenAPI drift check green                                        | `pnpm openapi:check`                   |
| `observability`     | `pass` when artefacts validate                                               | `pnpm observability:validate`          |
| `browserUat`        | `scoped_elsewhere` until TTW-053 staging sign-off                            | Playwright comprehensive + staging UAT |
| `backupRecovery`    | `pass` after CI invariant queries + checklist; live PITR drill `owner_gated` | `release-rehearsal` workflow + TTW-067 |
| `migrationBaseline` | `pass` when CI `migration-baseline` job green on candidate SHA               | `pnpm release:verify-migrations`       |

Gate vocabulary: `pass` | `fail` | `pending` | `not_run` | `owner_gated` | `scoped_elsewhere`.

## Rehearsal sequence (temporary validation)

1. **Assemble manifest** — `release-candidate` workflow or local `build-release-manifest.mjs`
2. **Preflight** — `pnpm release:preflight` (credential-free)
3. **Migration baseline** — CI `migration-baseline` job or `pnpm release:verify-migrations` (live Postgres)
4. **Stop/go rehearsal** — `pnpm release:rehearse-stop-go` (credential-free)
5. **Backup invariants** — `pnpm release:rehearse-backup` against migrated snapshot DB
6. **Build images** — immutable digests recorded when registry publish is owner-gated
7. **Migrate** — `prisma migrate deploy` against isolated Managed PostgreSQL (owner-gated live)
8. **Deploy digests** — exact candidate images on temporary-validation host
9. **Gates** — contracts, observability, browser UAT slots on manifest
10. **Evidence** — retain manifest, logs, reconciliation samples (redacted)
11. **Teardown** — within `teardown-policy.json` max lifetime (24h)

## Production rollout (human-only)

Production execution requires:

- Signed go/no-go with named operators
- Confirmed target environment identity (project, region, hostnames)
- Manifest gate results all `pass` or explicitly waived with ticket reference
- Post-release observation window with money/inventory reconciliation

See `docs/release/controlled-release-checklist.md` and `docs/runbooks/release-*.md`.

## References

- `infra/release/release-manifest.schema.json`
- `docs/infrastructure/ttw-068-ephemeral-release.md`
- `docs/runbooks/` — operational response runbooks (TTW-051) plus release runbooks (TTW-054)
- `docs/release-criteria.md` — domain release checklist
