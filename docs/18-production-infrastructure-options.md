# Production infrastructure options

**Status:** DigitalOcean selected; retained as decision evidence\
**Reviewed:** 2026-08-20\
**Decision owner:** Product/engineering owner through TTW-060\
**Decision:** DigitalOcean approved on 2026-08-20; see `docs/19-digitalocean-production-architecture-decision.md`

## Executive recommendation

Use DigitalOcean for the cost-constrained first production environment and keep application contracts portable through containers, PostgreSQL, Redis-compatible protocols, S3 APIs and OpenTelemetry.

The approved launch combines a USD 24/month 4 GiB Droplet, USD 15.15/month single-node Managed PostgreSQL and USD 5/month Spaces subscription. Valkey runs on the application Droplet initially. TTW-060 reproduced dated prices on 2026-08-20: mandatory baseline **USD 45.65**/month (including USD 1.50 off-provider backup estimate) under the USD 50 ceiling. **London (`lon1`) is primary** after the Nigeria latency probe; Frankfurt remains the recovery region.

This is deliberately not a highly available or horizontally autoscaled launch. It protects the authoritative PostgreSQL data with a managed service while accepting a single application-node failure domain. The system upgrades to a load balancer, multiple Droplets and managed Valkey when measured demand or business risk justifies the additional cost.

## Current workload contract

The platform must support:

- three Next.js surfaces (`web`, `app`, `admin`);
- a NestJS HTTP API;
- BullMQ consumers and a singleton-safe scheduler;
- managed PostgreSQL with controlled migrations, backups and restore rehearsal;
- Redis-compatible queue/session state with a no-eviction policy;
- S3-compatible private and public object-storage boundaries;
- outbound HTTPS to payment, delivery and observability providers;
- TLS/DNS, secret rotation, audited administration and break-glass recovery;
- metrics, traces, logs, cost alerts and release correlation; and
- immutable images, temporary release validation and controlled rollback/roll-forward.

## Selected DigitalOcean option

The launch uses a Basic Droplet rather than App Platform because six independently billed application/worker components plus managed data services would leave no useful margin below USD 50. Containers remain separate on the host so they can later move to multiple Droplets or App Platform without merging application responsibilities.

Advantages:

- predictable pricing and a substantially lower fixed baseline than the proposed AWS managed stack;
- a dedicated managed PostgreSQL product with automated maintenance, daily backups and point-in-time recovery;
- S3-compatible Spaces requires little storage-adapter change;
- simple VPC, firewall, reserved-IP and Droplet primitives are manageable by a small team;
- OpenTofu provider coverage for the selected resources; and
- a straightforward growth path to a load balancer, multiple Droplets and managed Valkey.

Costs and risks:

- DigitalOcean has no African compute region; Frankfurt and London require real latency measurements from Nigeria;
- the single Droplet is an application, Valkey and reverse-proxy failure domain;
- no horizontal autoscaling or zero-downtime host maintenance at launch;
- provider access relies on carefully protected scoped tokens/SSH keys rather than AWS-style workload IAM;
- the managed PostgreSQL minimum is single-node and not highly available; and
- cross-region/off-provider recovery requires additional exports and rehearsed rebuild automation.

Official references:

- [Droplet pricing](https://www.digitalocean.com/pricing/droplets)
- [Managed database pricing](https://www.digitalocean.com/pricing/managed-databases)
- [Managed PostgreSQL](https://www.digitalocean.com/products/managed-databases-postgresql)
- [Spaces](https://www.digitalocean.com/products/spaces)
- [DigitalOcean OpenTofu/Terraform provider](https://registry.terraform.io/providers/digitalocean/digitalocean/latest/docs)

## Rejected AWS option

AWS remains a technically strong future option. ECS/Fargate, RDS, ElastiCache, an Application Load Balancer, private egress, CloudWatch and cross-region recovery provide stronger identity, isolation and scaling. Their independent hourly minimums make the complete topology incompatible with the approved launch ceiling. Running everything on one AWS instance would remove most of the architectural reasons for choosing AWS while retaining its pricing and operational complexity.

AWS should be reconsidered only if a future compliance, residency, identity or scale requirement cannot be met economically on DigitalOcean.

## Other alternatives

- **Hetzner plus Neon:** the lowest plausible managed-PostgreSQL configuration, but it splits network, support and recovery across vendors.
- **Railway:** usage-based and convenient, but less predictable under sustained multi-service load and not the selected dedicated managed PostgreSQL operating model.
- **DigitalOcean App Platform:** a good later operational simplification, but the required always-on components and autoscaling tiers do not fit the current ceiling as comfortably as a consolidated Droplet.

## TTW-060 decision gate (status 2026-08-20)

TTW-060 **completed** the architecture/cost gate with recorded deviations:

1. ✅ Measured Lagos→Frankfurt/London latency; approved **London primary**, Frankfurt recovery (`docs/infrastructure/ttw-060-latency-evidence.md`).
2. ✅ Reproduced dated minimal (**45.65**), expected (**47.65**) and stress (**89.65**) cost model via `pnpm infra:cost-model`.
3. ✅ Approved Droplet container layout/budgets (`docs/infrastructure/ttw-060-resource-budget.md`); constrained host boot remains TTW-063.
4. ⚠️ Compatibility: MinIO Spaces-compatible + app webhook/OTel contracts proven; **live Managed PostgreSQL disposable spike deferred to TTW-061/064** (owner API token).
5. ⚠️ Remote state: MinIO S3+lockfile proven; **Spaces bootstrap proof is TTW-061**.
6. ✅ Documented token/SSH/secrets ownership (hardening TTW-065).
7. ✅ Approved backup retention and RPO by data class (media/state regional risk explicit).
8. ✅ Recorded upgrade triggers and exit path in ADR-001.
