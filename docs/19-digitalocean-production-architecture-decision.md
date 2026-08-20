# ADR-001 — Use DigitalOcean for the cost-constrained production launch

**Status:** Accepted\
**Decision date:** 2026-08-20\
**Decision owner:** Product/engineering owner\
**Implementation gate:** TTW-060

## Context

Tamiym has three Next.js surfaces, a NestJS API, BullMQ workers and schedulers, PostgreSQL, Redis-compatible queue/session state, S3-compatible media storage, payment/refund/payout integrations and OpenTelemetry. The first production environment is expected to have very low traffic, while the normal monthly infrastructure target is below USD 50.

AWS was initially selected for its identity, isolation and recovery controls. A dated pricing review showed that the proposed ECS/Fargate, load-balancer, RDS and ElastiCache baseline could not credibly meet the launch budget. Cost is the governing constraint at this stage, and the owner accepts a single-node application tier and more relaxed recovery in exchange for a managed PostgreSQL system of record.

## Decision

Use **DigitalOcean** for the initial production environment. Define infrastructure with **OpenTofu/HCL** and keep application interfaces portable.

The launch topology is:

- Frankfurt (`fra1`) as the preferred primary region, subject to a latency probe from Nigeria before provisioning; London (`lon1`) is the fallback primary and recovery location;
- one 4 GiB / 2 vCPU Basic Droplet for the reverse proxy, three Next.js applications, NestJS API, BullMQ worker, singleton scheduler and Valkey/Redis-compatible operational state;
- Docker Compose or an equivalently reviewed container supervisor on the Droplet, with application roles deployed as separate containers from immutable images;
- DigitalOcean Managed PostgreSQL on the smallest single-node production-compatible plan, privately connected in the same VPC and treated as the authoritative business system of record;
- DigitalOcean Spaces for private originals, quarantine and derived/public objects, with CDN access only where the media policy permits it;
- Namecheap as registrar and initial authoritative DNS provider; Caddy or nginx terminates TLS directly on the Droplet;
- DigitalOcean Cloud Firewall, VPC, reserved IP, monitoring and project controls;
- GitHub Actions with an owner-protected production environment for build, validation, migration and deployment;
- encrypted daily off-provider PostgreSQL exports and configuration recovery material, supplementing DigitalOcean managed backups; and
- temporary, separately named validation resources rather than permanently running staging.

Do not provision a DigitalOcean Load Balancer, managed Valkey cluster, second Droplet, warm recovery stack or permanent staging at launch. Add them only when measured traffic, recovery evidence or revenue crosses documented triggers.

## Cost envelope

The normal low-traffic target is below **USD 50/month**, excluding tax, payment-provider fees, domain renewal and exceptional scale events. The planning baseline is approximately:

- 4 GiB Basic Droplet: USD 24/month;
- single-node Managed PostgreSQL: USD 15.15/month;
- Spaces: USD 5/month; and
- small variable charges and off-provider backup storage within the remaining margin.

TTW-060 must reproduce current prices and prove that mandatory monitoring, backup and network charges still fit before persistent resources are created. A budget alert is required below the ceiling. Compute does not autoscale horizontally at launch; demand is handled first by caching, static delivery, queue back-pressure and vertical resizing. Multi-node application autoscaling is a later upgrade and may exceed the launch budget.

## Availability and recovery

- Stateful application infrastructure launches single-node/single-region.
- Managed PostgreSQL backups and point-in-time recovery are the primary database recovery mechanism.
- Initial planning objectives are RPO 15 minutes/RTO four hours for recoverable database/service failures and RPO/RTO 24 hours for complete regional loss. These may be relaxed only through an explicit owner-approved cost/risk decision.
- Valkey is not authoritative. Queue/session loss must be reconciled from PostgreSQL without replaying external financial effects.
- Regional recovery rebuilds the stack from OpenTofu and immutable images, restores PostgreSQL and object/configuration backups, then performs invariant checks before DNS cutover.

## Security consequences

The consolidated Droplet increases blast radius. Mitigations include non-root containers, minimal published ports, Cloud Firewall rules, SSH key-only access, unattended security updates with controlled reboot windows, encrypted disks/backups, separate runtime roles and files, secret redaction, immutable images and tested restore/rebuild procedures.

DigitalOcean does not provide AWS-style workload IAM or GitHub OIDC federation for every service. Until an equivalent short-lived mechanism is proven, deployment uses a narrowly scoped DigitalOcean API token and SSH key stored only in the protected GitHub production environment, with rotation, revocation and audit procedures.

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

## Rejected alternatives

- **AWS ECS/Fargate + RDS + ElastiCache:** stronger isolation and scaling, but its fixed launch components do not fit the approved cost ceiling.
- **Hetzner plus Neon:** potentially cheaper, but splits operations and database traffic across providers and offers a less cohesive recovery/security model.
- **Railway:** strong developer experience and usage pricing, but its database is operated as a platform service/volume rather than the selected dedicated managed PostgreSQL product.

## Evidence

- Owner selected AWS on 2026-08-19, then approved switching to DigitalOcean after reviewing the sub-USD-50 constraint on 2026-08-20.
- `docs/18-production-infrastructure-options.md` — provider comparison and cost decision.
- `docs/epics/06-production-infrastructure-as-code.md` — implementation boundaries and dependency graph.
- [DigitalOcean Droplet pricing](https://www.digitalocean.com/pricing/droplets)
- [DigitalOcean Managed PostgreSQL pricing](https://www.digitalocean.com/pricing/managed-databases)
- [DigitalOcean Managed PostgreSQL](https://www.digitalocean.com/products/managed-databases-postgresql)
- [DigitalOcean Spaces](https://www.digitalocean.com/products/spaces)
- [DigitalOcean Terraform provider](https://registry.terraform.io/providers/digitalocean/digitalocean/latest/docs)
