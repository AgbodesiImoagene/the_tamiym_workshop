# TTW-064 — Provision durable production data services

**Epic:** 6 — Production infrastructure as code\
**Status:** Not started\
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

## Acceptance criteria

- [ ] Production and temporary-validation PostgreSQL, Valkey and Spaces satisfy approved encryption, access, version and capacity requirements without permanent staging services.
- [ ] Policy tests prevent public data services, public private-assets, unencrypted state and unprotected destructive changes.
- [ ] Database connection/pooling and migration identities are least privilege and pass application plus failure tests.
- [ ] Valkey persistence, no-eviction and host-loss behavior is documented and BullMQ reconciliation tests preserve business invariants.
- [ ] Object ownership, CORS, lifecycle, versioning and public/private delivery boundaries pass access-matrix tests.
- [ ] Capacity, connection, memory, eviction, replication/backup and storage-growth alerts reach named owners.

## Out of scope

- Backup restoration and disaster exercises → TTW-067.
- Application media-ingestion security → TTW-021.

## Design review

Record reviewer, date, data classification, topology, versions, durability, Redis semantics, bucket boundaries, maintenance/failure modes, cost and verdict before implementation.

## Implementation reviews

Because loss or corruption affects money, inventory and customer assets, require two independent reviews covering infrastructure/data correctness and security; repeat all dimensions until PASS.

## Verification evidence

Record plans/policy tests, provider configurations, access matrices, integration/failure test results, capacity baselines and delivered alerts without exposing data or credentials.

## Completion summary

Summarize services, sizing, durability, access, maintenance, lifecycle, failure results, costs and recovery dependencies.
