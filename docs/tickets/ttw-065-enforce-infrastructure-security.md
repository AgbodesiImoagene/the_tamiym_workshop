# TTW-065 — Enforce infrastructure identity, secrets and security controls

**Epic:** 6 — Production infrastructure as code\
**Status:** Not started\
**Risk:** High\
**Blocked by:** TTW-061\
**Blocks:** TTW-063, TTW-067

## Background

The application requires database, Redis, S3, Paystack, JWT, mail/OAuth and observability configuration. The repository has startup validation for only part of that contract and no production secret store, workload identity, operator access model, CI federation, rotation procedure or infrastructure security baseline.

## Proposal

Define DigitalOcean owner, CI, Droplet and application access with least privilege despite the provider's coarser identity model. Require MFA for the owner account, isolate resources in a DigitalOcean project, use narrowly scoped and regularly rotated API tokens, and restrict SSH to named keys and approved sources. Store CI secrets only in the owner-protected GitHub production environment. Inject runtime secrets into root-owned host files or an approved low-cost secret mechanism without exposing values in OpenTofu state, images, plans or logs. Harden the Droplet, containers and supply chain; establish auditable break-glass, patching and credential-recovery procedures.

## Invariants

- No provider credential is stored in source control, images, developer documentation or unprotected CI contexts; any unavoidable long-lived token is narrowly scoped, owner-protected, rotated and revocable.
- Application roles cannot administer infrastructure, read unrelated environment secrets or assume migration/backup roles.
- Secret values do not appear in plans, state outputs, logs, traces, crash reports or ordinary deployment evidence.
- Production human access is individually attributable, MFA-protected, time-bounded where possible and auditable.

## Implementation plan

1. Inventory data, actions, identities and secret consumers; create an environment-by-role permission matrix and threat model.
2. Configure DigitalOcean team/project guardrails, MFA, audit evidence, Cloud Firewall defaults and security-finding destinations.
3. Prove whether short-lived GitHub federation is available; otherwise implement separate least-privilege OpenTofu/deployment tokens and SSH keys in the protected production environment with expiry/rotation controls.
4. Provision root-owned runtime secret files or the approved secret mechanism; import/generate values through an out-of-band ceremony and restrict each container to its declared configuration.
5. Implement rotation/revocation for JWT, database, Redis, storage, Paystack, OAuth and delivery credentials, including dual-key/maintenance constraints.
6. Add OpenTofu/image/dependency/host/configuration scanning, automated security updates with controlled reboot policy, finding ownership/SLA and a tested MFA break-glass procedure.

## Test and observability plan

- Unit/component: Policy simulation and negative tests for cross-environment, cross-role, secret-output and destructive access.
- Integration/e2e: Each container reads only its declared secrets/resources; CI plans/deploys with the approved token/SSH model; rotation keeps approved services available.
- Failure, retry, and concurrency: Expired token, revoked role, unavailable secret service, partial rotation, compromised CI context and break-glass activation.
- Logs, metrics, traces, and alerts: Privileged actions, denied access anomalies, secret/key changes, public exposure/config drift and high-severity findings.

## References

- `docs/10-deployment-and-environments.md:12-55` — runtime secret/configuration inventory.
- `docs/10-deployment-and-environments.md:87-99` — production secrets and storage policy remain incomplete.
- `apps/api/src/app.module.ts:45-98` — startup configuration and Redis connection behavior.
- `apps/api/src/storage/s3.service.ts:29-45` — storage credentials are runtime inputs.

## Acceptance criteria

- [ ] Approved identity/permission and secret-consumer matrices cover humans, CI and every workload role for both environments.
- [ ] Short-lived federation is used where DigitalOcean supports it; unavoidable provider tokens/SSH keys are narrowly scoped, protected, monitored, rotated and documented as residual risk.
- [ ] Negative policy tests prove cross-environment, cross-role, secret export and unapproved destructive access are denied.
- [ ] Runtime secret injection leaves values out of git, images, plans, state outputs, logs and retained CI artefacts.
- [ ] Rotation/revocation exercises succeed for each secret class or document an approved maintenance procedure and owner.
- [ ] Audit/security findings and privileged/break-glass actions alert named owners and retain approved, redacted evidence.

## Out of scope

- Application authentication and authorization remediation → TTW-020 and TTW-023.
- Application dependency remediation → TTW-022.

## Design review

Record reviewer, date, threat model, identities, permission/secret matrices, trust boundaries, key ownership, rotation, emergency access, findings workflow and verdict.

## Implementation reviews

Require independent implementation and security reviews; remediate and repeat until both PASS.

## Verification evidence

Record redacted permission tests, token scopes, container access tests, secret scans, rotation timestamps/results, host-hardening evidence, audit events and break-glass exercise.

## Completion summary

Summarize guardrails, identities, secret ownership/injection, rotation, audit/security monitoring, emergency access and residual exceptions.
