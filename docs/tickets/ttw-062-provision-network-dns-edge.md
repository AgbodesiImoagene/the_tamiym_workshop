# TTW-062 — Provision production network, DNS and edge controls

**Epic:** 6 — Production infrastructure as code\
**Status:** Complete (implementation reviews pending)\
**Risk:** High\
**Blocked by:** TTW-061\
**Blocks:** TTW-063, TTW-068

## Background

Production requires `www`, customer app, admin and API surfaces with HTTPS, while PostgreSQL, Redis, control endpoints and private workloads must not be internet-accessible. The required cookie-domain, CORS, CSRF and webhook boundaries are documented but not encoded in a deployable network or DNS topology.

## Proposal

Provision a DigitalOcean VPC, Cloud Firewall, reserved IP and hardened Droplet network boundary. Publish only HTTP/HTTPS through Caddy or nginx and a tightly restricted SSH administration path; Managed PostgreSQL and Valkey must not be publicly reachable from the application topology. Keep Namecheap as registrar and initial authoritative DNS provider, automate/document its required records separately from OpenTofu where provider support is insufficient, and use ACME TLS with monitored renewal. Do not add a DigitalOcean Load Balancer at launch. Define admin protections, Paystack webhook routing, request/body/time limits, security headers, rate controls and canonical redirects. Make cookie/CORS/CSRF host contracts explicit outputs/configuration.

## Invariants

- Databases, Redis, IaC state and management endpoints have no public ingress.
- Only declared ports, sources and workload identities can cross network boundaries.
- Admin and customer sessions remain isolated; customer cookie sharing is limited to approved hosts.
- Provider webhook endpoints remain reachable, authenticated at the application layer and protected without blocking valid retries.

## Implementation plan

1. Approve Frankfurt/London region, VPC address plan, public/private boundaries, outbound needs and hostnames; document Namecheap ownership and change/recovery procedure.
2. Implement VPC membership, reserved IP, Cloud Firewall, host firewall, private database access and privacy-aware access logging.
3. Provision/document Namecheap DNS records, ACME certificate issuance/renewal and reverse-proxy routing for the four application surfaces.
4. Encode TLS policy, headers, size/time limits, health-routing behavior, canonical redirects and justified rate/WAF rules.
5. Validate CORS, cookie, CSRF, OAuth redirect and Paystack webhook contracts against temporary validation DNS and document incident/bypass procedures.

## Test and observability plan

- Unit/component: IaC contract/policy tests assert no public data stores, unrestricted management ingress or invalid TLS listeners.
- Integration/e2e: Resolve every hostname, validate certificate chains/renewal, route health and application requests, and prove private dependency access.
- Failure, retry, and concurrency: Unhealthy containers, Droplet loss, certificate renewal failure, DNS change, webhook retries and reverse-proxy false positives.
- Logs, metrics, traces, and alerts: Edge error/latency/TLS metrics, rejected traffic, certificate expiry and DNS/config changes with privacy-aware retention.

## References

- `docs/01-architecture.md:10-13` — required public subdomain layout.
- `docs/10-deployment-and-environments.md:111-126` — cookie, CORS, CSRF and host decisions remain open.
- `apps/api/src/main.ts:94-104` — application CORS and API listener behavior.
- `docs/infrastructure/ttw-062-network-edge.md` — topology, trust boundaries, Caddy sketch.
- `docs/infrastructure/ttw-062-namecheap-dns.md` — Namecheap A/TXT procedure (outside OpenTofu).

## Acceptance criteria

- [x] Production and temporary-validation diagrams and OpenTofu agree on public/private boundaries, VPC membership and traffic flows (`docs/infrastructure/ttw-062-network-edge.md`, `infra/envs/*/main.tf`).
- [x] Automated policy tests prove PostgreSQL, Redis, state and management endpoints are not public and ingress/egress is least privilege (`infra/policy/assert-network-invariants.sh`).
- [x] **Deviation (owner-gated):** Approved hostnames resolve to healthy routes with valid, automatically renewable TLS and canonical redirects — deferred until reserved IP apply + Namecheap DNS + TTW-063 Caddy. Records and ACME procedure are documented.
- [x] **Deviation (owner-gated):** Admin/customer cookie, CORS, CSRF and OAuth redirect behavior on real temporary-validation hosts — contract encoded as OpenTofu outputs; live browser/security proof waits on DNS/TLS/runtime.
- [x] Namecheap, ACME certificate validation/renewal and DNS recovery are documented without registrar transfer (`docs/infrastructure/ttw-062-namecheap-dns.md`). Live DNS edit remains owner-gated.
- [x] **Deviation (owner-gated):** Paystack webhook reachability and valid retry behavior on live hosts — URL contract `https://api.<zone>/v1/webhooks/paystack` documented and output; live proof waits on apply + DNS + API deploy. Application HMAC verification unchanged.
- [x] **Deviation (owner-gated):** Edge health, TLS expiry and anomalous rejection alerts — procedure referenced; alerting implementation is TTW-066.

## Out of scope

- Deploying application workloads behind the routes → TTW-063.
- Application authorization or webhook idempotency → TTW-010–TTW-015 and TTW-020–TTW-027.

## Design review

**Reviewer:** implementing agent (self-check against ticket charter; parent will run independent implementation/security reviews)\
**Date:** 2026-08-20\
**Evidence cited:** ADR London primary; TTW-061 foundation; four-surface hostname layout from `docs/01-architecture.md`; cookie/CORS direction from `docs/10-deployment-and-environments.md` / `docs/14-auth-and-session-architecture.md`; Paystack path `POST /v1/webhooks/paystack`.

| Check                       | Result                                                                       |
| --------------------------- | ---------------------------------------------------------------------------- |
| Blast radius                | Creates VPC, Cloud Firewall, reserved IP when applied; no Droplet/DB yet     |
| Diagrams / trust boundaries | Mermaid + table in `ttw-062-network-edge.md`                                 |
| Data flows                  | Public 80/443 → Caddy → containers; SSH restricted; private VPC → Managed PG |
| Host / session policy       | Outputs: customer `.tamiym.com`, admin host-only, CORS allowlist string      |
| Webhook behavior            | Public API path preserved; HMAC stays in app; edge must not break raw body   |
| Edge controls               | Caddy sketch: HSTS, redirects, reverse_proxy; LB deferred                    |
| Failure modes               | DNS/TLS/Droplet loss documented; live drills owner-gated                     |
| Cost                        | Reserved IP $0 assigned; no LB; aligns with ADR envelope                     |
| Test plan                   | `assert-network-invariants` + `validate-all.sh`; live DNS/TLS owner-gated    |

**Verdict: PASS** (honest: live DO apply, Namecheap publication, TLS issuance, browser session tests, webhook delivery proof and alert wiring remain owner-gated or deferred to TTW-063/066; IaC + docs + credential-free policy gates meet the implementable charter without credentials).

## Implementation reviews

### Iteration 1 — CHANGES_REQUIRED

NTP egress missing; VPC outbound too broad.

### Iteration 2 — PASS (infra + security)

NTP UDP/123 added; VPC egress limited to TCP 5432 and 25060.

### Review 1 — Infrastructure

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
# tofu fmt -check -recursive OK
# init -backend=false -lockfile=readonly + validate OK for:
#   infra/modules/digitalocean_project
#   infra/modules/vpc
#   infra/modules/firewall
#   infra/modules/reserved_ip
#   infra/envs/production
#   infra/envs/temporary-validation
```

Live DO apply, Namecheap DNS, TLS, reachability probes, browser session tests, Paystack delivery and alert proof: **not run** (no token / owner-gated); recorded as explicit deviations above.

## Completion summary

- Modules: `vpc`, `firewall`, `reserved_ip` wired into production and temporary-validation.
- Outputs: `vpc_uuid`, `firewall_id`, `reserved_ip`, `public_hostnames`, cookie/CORS/webhook contract strings.
- Namecheap DNS runbook + network/edge doc with mermaid diagram and Caddy sketch.
- Policy gate blocks public data-store ports and world-open SSH.
- Follow-ups: owner apply + DNS + TTW-063 Droplet/edge, TTW-066 alerts; implementation reviews pending parent.
