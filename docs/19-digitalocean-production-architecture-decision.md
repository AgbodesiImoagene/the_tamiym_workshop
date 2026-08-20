# ADR-001 — Use DigitalOcean for the cost-constrained production launch

**Status:** Accepted (TTW-060 architecture/cost evidence 2026-08-20; Spaces state + live PG spikes remain TTW-061/064 gates)\
**Decision date:** 2026-08-20\
**Decision owner:** Product/engineering owner\
**Implementation gate:** TTW-060 ✅ → TTW-061+

## Context

Tamiym has three Next.js surfaces, a NestJS API, BullMQ workers and schedulers, PostgreSQL, Redis-compatible queue/session state, S3-compatible media storage, payment/refund/payout integrations and OpenTelemetry. The first production environment is expected to have very low traffic, while the normal monthly infrastructure target is below USD 50.

AWS was initially selected for its identity, isolation and recovery controls. A dated pricing review showed that the proposed ECS/Fargate, load-balancer, RDS and ElastiCache baseline could not credibly meet the launch budget. Cost is the governing constraint at this stage, and the owner accepts a single-node application tier and more relaxed recovery in exchange for a managed PostgreSQL system of record.

## Decision

Use **DigitalOcean** for the initial production environment. Define infrastructure with **OpenTofu/HCL** and keep application interfaces portable.

The launch topology is:

- **London (`lon1`) as primary region** after the Nigeria latency probe (Lagos→London ~104 ms vs Lagos→Frankfurt ~119 ms on WonderNetwork 2026-08-20); **Frankfurt (`fra1`) is the recovery/rebuild region**;
- one 4 GiB / 2 vCPU Basic Droplet for the reverse proxy, three Next.js applications, NestJS API, BullMQ worker, singleton scheduler and Valkey/Redis-compatible operational state;
- Docker Compose or an equivalently reviewed container supervisor on the Droplet, with application roles deployed as separate containers from immutable images and explicit memory hard limits (see `docs/infrastructure/ttw-060-resource-budget.md`);
- DigitalOcean Managed PostgreSQL on the smallest single-node production-compatible plan, privately connected in the same VPC and treated as the authoritative business system of record;
- DigitalOcean Spaces for private originals, quarantine and derived/public objects, with CDN access only where the media policy permits it;
- Namecheap as registrar and initial authoritative DNS provider; Caddy or nginx terminates TLS directly on the Droplet;
- DigitalOcean Cloud Firewall, VPC, reserved IP (assigned; $0), monitoring and project controls;
- GitHub Actions with an owner-protected production environment for build, validation, migration and deployment;
- encrypted daily off-provider PostgreSQL exports and configuration recovery material, supplementing DigitalOcean managed backups (7-day PITR included); and
- temporary, separately named validation resources rather than permanently running staging.

Do not provision a DigitalOcean Load Balancer, managed Valkey cluster, second Droplet, warm recovery stack or permanent staging at launch. Add them only when measured traffic, recovery evidence or revenue crosses documented triggers.

## Cost envelope (reproduced 2026-08-20)

Normal low-traffic target: below **USD 50/month**, excluding tax, payment-provider fees, domain renewal and exceptional scale events.

| Scenario                                                                                                                          | Total (USD/mo) | Under ceiling?   |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------: | ---------------- |
| Mandatory baseline (Droplet 24 + PG 15.15 + Spaces 5 + monitoring 0 + assigned reserved IP 0 + off-provider backup estimate 1.50) |      **45.65** | Yes              |
| Expected low-traffic month (+1 uptime check, modest overages)                                                                     |      **47.65** | Yes              |
| Stress / scale-event (8 GiB Droplet + managed Valkey + transfer overage)                                                          |      **89.65** | No — exceptional |

Reproduce with `node scripts/infrastructure/cost-model.mjs`. Budget alert threshold: **USD 45**.

## Availability and recovery

- Stateful application infrastructure launches single-node/single-region (`lon1`).
- Managed PostgreSQL backups and point-in-time recovery (7 days included) are the primary database recovery mechanism.
- Initial planning objectives:
  - PostgreSQL recoverable failure: RPO 15 minutes / RTO four hours;
  - Regional loss of PostgreSQL + configuration: RPO/RTO 24 hours via `fra1` rebuild from OpenTofu + off-provider DB/config export + DNS cutover;
  - Spaces media and OpenTofu state: **best-effort at launch** (primary-region only); regional RPO may exceed 24 hours until cross-region or off-provider object replication is funded (owner-approved; see `docs/infrastructure/ttw-060-operations-access.md`).
- Valkey is not authoritative. Queue/session loss must be reconciled from PostgreSQL without replaying external financial effects.
- Regional recovery rebuilds the stack from OpenTofu and immutable images, restores PostgreSQL and configuration backups, then performs invariant checks before DNS cutover. Object/media restore depends on whatever replicas exist at the time of the incident.

## Security consequences

The consolidated Droplet increases blast radius. Mitigations include non-root containers, minimal published ports, Cloud Firewall rules, SSH key-only access, unattended security updates with controlled reboot windows, encrypted disks/backups, separate runtime roles and files, secret redaction, immutable images and **planned, ticketed** restore/rebuild procedures (TTW-067). Restore/rebuild is not yet rehearsed in this ticket.

DigitalOcean does not provide AWS-style workload IAM or GitHub OIDC federation for every service. Until an equivalent short-lived mechanism is proven, deployment uses a DigitalOcean API token and SSH key stored only in the protected GitHub production environment. Practical least-privilege token scoping, rotation, revocation and audit are owned by TTW-065; do not assume DO tokens are finely scoped today.

## Remote state

OpenTofu/Terraform remote state will use an S3-compatible backend (Spaces in production) with object versioning and native lock files (`use_lockfile`). **Local MinIO proof** of apply/destroy, versioning and lock objects completed under TTW-060. **Spaces-specific locking/recovery remains a TTW-061 bootstrap gate** before any persistent application apply.

## Upgrade triggers

Revisit the launch topology when any of these occur:

- sustained CPU or memory above 70%, repeated queue backlog, or latency/error objectives are missed;
- one Droplet cannot absorb a normal deployment or host restart within the accepted downtime;
- monthly revenue or transaction volume justifies multi-node availability;
- the USD 50 ceiling is raised;
- a managed Valkey service is needed to isolate queue memory/failure;
- regulatory, customer or provider requirements demand stronger identity, audit, residency or recovery controls; or
- a recovery exercise misses the approved RPO/RTO.

The next topology is expected to add a DigitalOcean Load Balancer, at least two application Droplets, managed Valkey and stronger environment separation before considering a cloud migration.

## Portability / exit

- Application images, PostgreSQL dumps, Spaces/S3 objects, and OpenTofu modules remain portable to another provider.
- Exit cost is primarily engineering time to retarget DNS, secrets and managed DB; no proprietary DO-only application APIs are required beyond provisioning.

## Rejected alternatives

- **AWS ECS/Fargate + RDS + ElastiCache:** stronger isolation and scaling, but its fixed launch components do not fit the approved cost ceiling.
- **Hetzner plus Neon:** potentially cheaper, but splits operations and database traffic across providers and offers a less cohesive recovery/security model.
- **Railway:** strong developer experience and usage pricing, but its database is operated as a platform service/volume rather than the selected dedicated managed PostgreSQL product.

## Evidence

- Owner selected AWS on 2026-08-19, then approved switching to DigitalOcean after reviewing the sub-USD-50 constraint on 2026-08-20.
- `docs/18-production-infrastructure-options.md` — provider comparison and cost decision.
- `docs/epics/06-production-infrastructure-as-code.md` — implementation boundaries and dependency graph.
- `docs/infrastructure/ttw-060-latency-evidence.md` — Nigeria latency probe and region choice.
- `docs/infrastructure/ttw-060-compatibility-spikes.md` — contract spikes and cleanup.
- `docs/infrastructure/ttw-060-opentofu-state-backend.md` — remote-state proof.
- `docs/infrastructure/ttw-060-operations-access.md` — backup/RPO ownership.
- `scripts/infrastructure/cost-model.mjs` — dated reproducible cost model.
- [DigitalOcean Droplet pricing](https://www.digitalocean.com/pricing/droplets)
- [DigitalOcean Managed PostgreSQL pricing](https://www.digitalocean.com/pricing/managed-databases)
- [DigitalOcean Spaces](https://www.digitalocean.com/pricing/spaces-object-storage)
- [DigitalOcean Terraform provider](https://registry.terraform.io/providers/digitalocean/digitalocean/latest/docs)
