# Controlled release checklist (operator)

Use with the immutable release manifest artefact for a specific candidate SHA. **Do not proceed when any stop/go gate is `fail` or required evidence is missing.**

## Before rehearsal (temporary validation)

- [ ] Release manifest assembled for exact commit SHA (`artefacts/release/release-manifest.json`)
- [ ] `pnpm release:preflight` passes locally or in `release-candidate` workflow
- [ ] `pnpm openapi:check`, `pnpm observability:validate`, `pnpm playwright:validate` pass on candidate
- [ ] `pnpm release:check-migrations` passes (migration artefacts present and ordered)
- [ ] Owner confirmed temporary-validation budget and max lifetime (`infra/release/teardown-policy.json`)
- [ ] Named operators assigned (deploy, migrate, observe, teardown)

## Temporary-validation deploy

- [ ] Target environment identity confirmed (project, region, hostnames — not production)
- [ ] Backup of any pre-existing tmpval data if reusing environment (or fresh create documented)
- [ ] `prisma migrate deploy` executed against tmpval database; exit 0; no pending migrations
- [ ] Candidate images deployed by **digest** (not tag alone)
- [ ] API health `/v1/health` green; Redis and PostgreSQL connectivity confirmed
- [ ] Playwright smoke (`pnpm test:e2e:smoke`) on candidate builds — CI evidence or repeated run
- [ ] TTW-051 dashboards show candidate telemetry during smoke/UAT window
- [ ] Controlled transaction UAT when TTW-053 slice 2 complete (otherwise document waiver)

## Go / no-go (production)

- [ ] **Explicit human authorization** recorded (change ticket, approver name, timestamp)
- [ ] Production target triple-checked (project, cluster/droplet, DNS)
- [ ] Verified restorable backup younger than approved RPO (slice 2 live proof)
- [ ] All manifest `gateResults` `pass` or waived with ticket + approver
- [ ] Queue/webhook drain plan reviewed (`docs/runbooks/release-rollback-rollforward.md`)
- [ ] Roll-forward recovery path agreed if migration cannot reverse safely
- [ ] On-call / operator contact list current

## Post-release (observation window)

- [ ] API error rate, webhook rejection, queue backlog, payout/refund staleness within SLO
- [ ] Financial and inventory reconciliation job clean
- [ ] No duplicate settlement/refund/payout alerts
- [ ] Customer-visible smoke on production URLs
- [ ] Final sign-off or incident/recovery record filed

## Evidence to retain (redact secrets and PII)

- Release manifest JSON
- Preflight and migration command output
- CI run URLs for candidate SHA
- Alert/dashboard screenshots (redacted)
- Go/no-go attendee list and decision
- Reconciliation query results (aggregates only)
