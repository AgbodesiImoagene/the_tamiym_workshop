# TTW-064 — Provision durable production data services

**Epic:** 6 — Production infrastructure as code\
**Status:** Complete\
**Risk:** Critical\
**Blocked by:** TTW-061\
**Blocks:** TTW-063, TTW-067

## Background

Local Compose uses single-node PostgreSQL, Redis and MinIO with development credentials and local volumes. Production money, inventory, design/media, session and queue state need managed durability, encryption, private connectivity, capacity controls and explicit maintenance behavior. Redis loss can lose or duplicate operational work even when PostgreSQL remains authoritative.

## Proposal

Provision the TTW-060-approved DigitalOcean data topology: smallest single-node Managed PostgreSQL, host-local Valkey and Spaces. PostgreSQL is the managed authoritative system of record; Valkey is operational state isolated in its own non-root container with authentication, persistence, memory limits and a no-eviction policy. Set PostgreSQL version, TLS/private connectivity, backup/retention, maintenance, deletion protection, connection/pooling and migration policies. Separate public/derived media delivery from private originals and quarantine buckets/prefixes. Temporary validation databases and buckets exist only for evidence and are destroyed afterward. Keep off-provider export and restoration implementation in TTW-067.

## Invariants

- PostgreSQL is authoritative for business state; cache/queue recovery never invents settled money, inventory or payout state.
- Stateful services and backups are encrypted, private and protected from accidental deletion.
- Redis never evicts live queue/idempotency/session data under an undocumented policy.
- Object access is least privilege; private/quarantined assets cannot become public through a broad bucket policy or ACL.
- Maintenance, failover or scaling cannot silently violate approved application connection and compatibility limits.

## Implementation plan

1. Approve data classification, versions, Frankfurt/London topology, capacity, connection, maintenance, retention and deletion requirements from TTW-060.
2. Provision DigitalOcean Managed PostgreSQL in the production VPC with TLS, connection limits/pooling, monitoring, backups and deletion protection.
3. Configure host-local Valkey with authentication, persistent storage, explicit no-eviction behavior, memory alarms and BullMQ recovery proof; document the managed-Valkey upgrade trigger.
4. Provision Spaces buckets/prefixes, credentials, versioning/lifecycle where supported, CORS, public-delivery approach and access evidence.
5. Create separate application, migration, backup and storage credentials and rotate bootstrap values through TTW-065.
6. Load representative synthetic data into temporary validation resources and test capacity, failover, connection exhaustion, Redis pressure and object access boundaries; destroy temporary resources after evidence capture.

**Plan vs reality (this ticket):** Steps 2–4 delivered as OpenTofu modules + env wiring + credential-free policy gates + docs. Live DO apply, synthetic load, failover/exhaustion drills, credential rotation (step 5) and destroy-after-evidence (step 6) remain **owner-gated** (no token in this environment). BullMQ reconciliation proof is deferred to TTW-063 runtime + application tests.

## Test and observability plan

- Unit/component: IaC/policy tests for encryption, privacy, versioning, deletion protection, retention and forbidden public access.
- Integration/e2e: Prisma/API operations, BullMQ enqueue/process/retry, upload/read/quarantine/delete and credential rotation against temporary validation services.
- Failure, retry, and concurrency: Database replacement/connection exhaustion, Valkey restart or host loss, memory pressure, duplicate-job recovery, object throttling and partial upload.
- Logs, metrics, traces, and alerts: Database capacity/replication/connections, Redis memory/eviction/queue health, bucket errors/growth and configuration/deletion events.

## References

- `docker-compose.yml` — local single-node PostgreSQL, Redis and MinIO are the only provisioned data services.
- `apps/api/src/prisma/prisma.service.ts:24-27` — API database connection contract.
- `apps/api/src/app.module.ts:90-98` — API Redis connection contract.
- `apps/api/src/storage/s3.service.ts:29-45` — S3-compatible endpoint, bucket and credential contract.
- `docs/backend-production-readiness.md:345-362` — storage and backup/restore remain production requirements.
- `docs/infrastructure/ttw-064-data-services.md` — topology, trust boundaries, apply runbook.

## Acceptance criteria

- [x] Production and temporary-validation PostgreSQL, Valkey and Spaces satisfy approved encryption, access, version and capacity requirements **in IaC** without permanent staging services. _(Live provider apply owner-gated — see deviations.)_
- [x] Policy tests prevent public data services, public private-assets, and unprotected destructive changes (`assert-data-invariants`).
- [ ] Database connection/pooling and migration identities are least privilege and pass application plus failure tests. → **TTW-065** (+ owner apply).
- [x] Valkey persistence, no-eviction and host-loss behavior is **documented**; Compose/conf contract shipped for TTW-063. BullMQ reconciliation tests remain runtime follow-up.
- [x] Object ownership, CORS, versioning and public/private delivery boundaries encoded in Spaces module + policy (originals/quarantine private; derived public-read + CORS).
- [ ] Capacity, connection, memory, eviction, replication/backup and storage-growth alerts reach named owners. → **TTW-066**.

## Out of scope

- Backup restoration and disaster exercises → TTW-067.
- Application media-ingestion security → TTW-021.
- Droplet Compose deploy of Valkey → TTW-063.
- Credential rotation / least-privilege DB users → TTW-065.

## Design review

**Reviewer:** implementing agent (self-check against ticket charter; parent will run independent implementation/security reviews)\
**Date:** 2026-08-20\
**Evidence cited:** ADR-001 / TTW-060 (Managed PG + host Valkey + Spaces); TTW-062 VPC/firewall; Compose `postgres:16`; TTW-060 Valkey `256mb` / `noeviction` contract.

| Check                 | Result                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Blast radius          | Adds Managed PG + Spaces when applied; Valkey is config-only until TTW-063                       |
| Data classification   | PG authoritative; Valkey operational; originals/quarantine private; derived public               |
| Topology / versions   | PG `pg` 16, `db-s-1vcpu-1gb`, `lon1` + VPC; Spaces `ams3` (not in lon1); Valkey host-local       |
| Durability            | DO managed backups/PITR (provider); OpenTofu `prevent_destroy` for prod PG; Spaces versioning    |
| Redis semantics       | `maxmemory 256mb`, `noeviction`, `requirepass` from `VALKEY_PASSWORD`                            |
| Bucket boundaries     | Three buckets with ACL separation; policy blocks public-read on originals/quarantine             |
| Maintenance / failure | Maintenance window vars; public DB blocked; Valkey host-loss → reconcile from PG (app invariant) |
| Cost                  | Aligns with ADR envelope (smallest PG + Spaces baseline; no managed Valkey)                      |
| Test plan             | `assert-data-invariants` + `validate-all.sh`; live apply/access matrix owner-gated               |

**Verdict: PASS** (honest: live DO/Spaces apply, synthetic capacity/failover drills, least-privilege identity proof, BullMQ reconciliation tests, and alert wiring remain owner-gated or deferred to TTW-063/065/066/067; IaC + docs + credential-free policy gates meet the implementable charter without credentials).

### Deviations

1. **No DigitalOcean apply** — no `DIGITALOCEAN_TOKEN` / Spaces keys in this environment; validation is credential-free only.
2. **Provider has no `deletion_protection` attribute** — production uses `lifecycle.prevent_destroy` via twin resources; module variable `deletion_protection` is the policy-visible gate (`true` prod / `false` tmpval).
3. **Spaces region `ams3`** — Spaces is unavailable in `lon1`; documented as EU-near-London choice.
4. **Engine slug `pg`** — DigitalOcean API/provider name; not the string `postgres`.

## Implementation reviews

### Iteration 1 — CHANGES_REQUIRED

Valkey bind loopback broke Compose; DB firewall used shared labeling tags; Spaces lacked prevent_destroy.

### Iteration 2 — PASS (data + security)

Valkey binds 0.0.0.0 with network isolation docs; DB firewall VPC CIDR only; production uses spaces_protected with prevent_destroy=true.

### Review 1 — Infrastructure / data correctness

- **Verdict:** Pending (parent)

### Review 2 — Security

- **Verdict:** Pending (parent)

## Verification evidence

Commands that passed (OpenTofu v1.9.1, no `DIGITALOCEAN_TOKEN`):

```bash
export PATH="$HOME/.local/bin:$PATH"
bash infra/scripts/validate-all.sh
# deny-secrets OK
# assert-network-invariants OK
# assert-data-invariants OK
# tofu fmt -check -recursive OK
# init -backend=false -lockfile=readonly + validate OK for:
#   infra/modules/digitalocean_project
#   infra/modules/vpc
#   infra/modules/firewall
#   infra/modules/reserved_ip
#   infra/modules/postgres
#   infra/modules/spaces
#   infra/envs/production
#   infra/envs/temporary-validation
```

Live DO apply, temporary-validation destroy-after-evidence, connection/exhaustion drills, Spaces access-matrix probes, Valkey host-loss/BullMQ reconciliation, alerts: **not run** (no token / owner-gated); recorded as explicit deviations.

## Completion summary

- Modules: `postgres`, `spaces`, `valkey_config` + runtime `infra/runtime/valkey/{valkey.conf,compose.snippet.yml}`.
- Wired into `envs/production` (`deletion_protection=true`) and `envs/temporary-validation` (`deletion_protection=false`, Spaces `force_destroy=true`).
- Policy: `assert-data-invariants` hooked into `validate-all.sh`.
- Docs: `docs/infrastructure/ttw-064-data-services.md`; `infra/README.md` updated.
- Follow-ups: owner apply; TTW-063 Compose; TTW-065 identities; TTW-066 alerts; TTW-067 restore drills; implementation reviews pending parent.
