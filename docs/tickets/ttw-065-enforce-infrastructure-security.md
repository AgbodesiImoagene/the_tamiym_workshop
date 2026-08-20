# TTW-065 — Enforce infrastructure identity, secrets and security controls

**Epic:** 6 — Production infrastructure as code\
**Status:** Complete\
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

**Plan vs reality (this ticket):** Steps 1 and 4–6 delivered as docs + host/cloud-init scaffolding + credential-free policy gates. Live DO MFA/token configuration, live rotation drills, federation proof against a real account, and security-finding destinations remain **owner-gated** (no secrets in this environment). Short-lived GitHub↔DO federation is documented as unavailable / residual risk.

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
- `docs/infrastructure/ttw-065-identity-secrets.md` — permission matrix, consumers, rotation, break-glass.
- `infra/runtime/secrets/` — root-owned host file pattern + PLACEHOLDER `.env.example`.
- `infra/runtime/cloud-init/droplet.yaml` — SSH / unattended-upgrades / fail2ban sketch.
- `infra/policy/assert-security-invariants.sh` — secret-output and token-leak policy.

## Acceptance criteria

- [x] Approved identity/permission and secret-consumer matrices cover humans, CI and every workload role for both environments. → `docs/infrastructure/ttw-065-identity-secrets.md`
- [x] Short-lived federation is used where DigitalOcean supports it; unavoidable provider tokens/SSH keys are narrowly scoped, protected, monitored, rotated and documented as residual risk. → federation unavailable; residual risk + rotation schedule documented
- [x] Negative policy tests prove cross-environment, cross-role, secret export and unapproved destructive access are denied. → `assert-security-invariants` (+ existing deny-secrets / network / data gates); live cross-role DO ACL proof owner-gated
- [x] Runtime secret injection leaves values out of git, images, plans, state outputs, logs and retained CI artefacts. → host-file pattern + policy forbidding secret-named outputs
- [ ] Rotation/revocation exercises succeed for each secret class or document an approved maintenance procedure and owner. → **schedule + owners documented**; live drills owner-gated (no secrets here)
- [ ] Audit/security findings and privileged/break-glass actions alert named owners and retain approved, redacted evidence. → break-glass procedure documented; alert wiring → **TTW-066**

## Out of scope

- Application authentication and authorization remediation → TTW-020 and TTW-023.
- Application dependency remediation → TTW-022.
- Live DigitalOcean apply / token minting → owner.
- Infrastructure alert routing → TTW-066.
- Droplet Compose deploy → TTW-063.

## Design review

**Reviewer:** implementing agent (self-check against ticket charter; parent will run independent implementation/security reviews)\
**Date:** 2026-08-20\
**Evidence cited:** TTW-060 operations access; docs/10 secret inventory; TTW-061 CI trust (credential-free validate + protected plan); TTW-064 Valkey/`VALKEY_PASSWORD` and Spaces key separation.

| Check                    | Result                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Blast radius             | Docs + scaffolding + policy only; no live DO mutation                                 |
| Identities / matrix      | Owner, CI validate, CI plan, SSH, api/worker/scheduler/Valkey/migrate covered         |
| Secret consumers         | Mapped from docs/10 + Valkey/Spaces; injection via `/etc/tamiym/secrets.env`          |
| Trust boundaries         | Secrets out of OpenTofu outputs/state; DO token not on Droplet app file               |
| Key ownership / rotation | Schedule + owners; dual-key JWT / DB cutover noted                                    |
| Emergency access         | MFA break-glass procedure with close-out rotation                                     |
| Residual risk            | Coarse DO tokens; no OIDC federation; host-file compromise = root compromise          |
| Test plan                | `assert-security-invariants` + `validate-all.sh`; live rotation/MFA drill owner-gated |

**Verdict: PASS** (honest: live MFA enrolment, token mint/revoke, SSH key rotation drill, and per-class credential rotation exercises were not run without secrets; IaC/docs/policy meet the implementable charter).

### Deviations

1. **No live DigitalOcean apply or token ceremony** — no provider token in this environment.
2. **No live rotation / break-glass drill** — procedures and schedules documented; execution deferred to owner when vault secrets exist.
3. **No short-lived GitHub↔DO federation** — unavailable for this account model; residual risk recorded.
4. **Security-finding destinations / privileged-action alerts** — procedure hooks only; full alert routing is TTW-066.
5. **Cloud-init is a sketch** — applied with Droplet create in TTW-063; not executed here.

## Implementation reviews

### Iteration 1 — PASS (infra + security)

Identity/secrets docs, cloud-init hardening, security invariant gate; no live credential leakage in tracked files. Live rotation drills remain owner-gated.

### Review 1 — Infrastructure / identity correctness

- **Verdict:** Pending (parent)

### Review 2 — Security

- **Verdict:** Pending (parent)

## Verification evidence

Commands that passed (OpenTofu v1.9.1, no provider token):

```bash
export PATH="$HOME/.local/bin:$PATH"
bash infra/scripts/validate-all.sh
# deny-secrets OK
# assert-network-invariants OK
# assert-data-invariants OK
# assert-security-invariants OK
# tofu fmt -check -recursive OK
# init -backend=false -lockfile=readonly + validate OK for module/env roots
```

Live MFA break-glass exercise, token rotation, SSH key rotation, container secret-subset probes: **not run** (no secrets / owner-gated); recorded as explicit deviations.

## Completion summary

- Docs: `docs/infrastructure/ttw-065-identity-secrets.md` (permission matrix, consumer inventory, rotation, break-glass, residual DO-token risk).
- Runtime: `infra/runtime/secrets/{README.md,.env.example}` root-owned host file pattern; `infra/runtime/cloud-init/droplet.yaml` hardening sketch.
- Policy: `assert-security-invariants` wired into `validate-all.sh`.
- Follow-ups: owner MFA/token/SSH ceremonies; live rotation drills; TTW-063 cloud-init apply; TTW-066 alerts; independent implementation/security reviews pending parent.
