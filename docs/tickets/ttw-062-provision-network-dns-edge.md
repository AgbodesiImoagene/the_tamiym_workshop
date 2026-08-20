# TTW-062 — Provision production network, DNS and edge controls

**Epic:** 6 — Production infrastructure as code\
**Status:** Not started\
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

## Acceptance criteria

- [ ] Production and temporary-validation diagrams and OpenTofu agree on public/private boundaries, VPC membership and traffic flows.
- [ ] Automated policy tests prove PostgreSQL, Redis, state and management endpoints are not public and ingress/egress is least privilege.
- [ ] Approved hostnames resolve to healthy routes with valid, automatically renewable TLS and canonical redirects.
- [ ] Admin/customer cookie, CORS, CSRF and OAuth redirect behavior passes browser/security tests on real temporary-validation hosts.
- [ ] Namecheap, ACME certificate validation/renewal and DNS recovery are documented and tested without registrar transfer.
- [ ] Paystack webhook reachability and valid retry behavior are proven without weakening webhook authentication.
- [ ] Edge health, TLS expiry and anomalous rejection alerts reach the documented owner.

## Out of scope

- Deploying application workloads behind the routes → TTW-063.
- Application authorization or webhook idempotency → TTW-010–TTW-015 and TTW-020–TTW-027.

## Design review

Record reviewer, date, diagrams, trust boundaries, data flows, host/session policy, webhook behavior, edge controls, failure modes, cost and verdict.

## Implementation reviews

Require independent infrastructure and security review of network reachability and policy tests; repeat until PASS.

## Verification evidence

Record plans, policy tests, port/reachability probes, DNS/TLS checks, browser/session tests, webhook test identifiers and alert delivery.

## Completion summary

Summarize networks, exposed hosts, private paths, TLS/edge policy, session contracts, verified failures and operating notes.
