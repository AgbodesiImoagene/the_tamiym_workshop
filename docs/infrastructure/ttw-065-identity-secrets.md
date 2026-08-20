# TTW-065 — Identity, secrets, and host security

Least-privilege identity, runtime secret injection, and Droplet hardening for
The Tamiym Workshop on DigitalOcean. Complements TTW-061 (IaC trust), TTW-062
(network/edge), and TTW-064 (data services). **No live DigitalOcean apply or
credential rotation drill in this ticket** — those remain owner-gated when
secrets exist in the protected store.

## Trust model (summary)

| Layer          | Who acts                           | Credential surface                                        | Must not                                                           |
| -------------- | ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Owner human    | Product/engineering owner          | DO console (MFA), break-glass SSH key, owner secret vault | Share DO token/SSH private keys; disable MFA                       |
| CI (validate)  | GitHub Actions `infra` job         | None                                                      | Hold DO token; apply                                               |
| CI (plan)      | `infra-plan.yml` workflow_dispatch | Protected GitHub Environment token                        | Run on `pull_request` heads; apply; print secrets                  |
| Droplet SSH    | Named operator keys + break-glass  | SSH public keys; Cloud Firewall allowlist                 | Password auth; world-open `:22`                                    |
| App containers | api / worker / scheduler           | Subset of `/etc/tamiym/secrets.env` via Compose env_file  | Administer DO; read unrelated secrets; hold migration/backup roles |

Residual risk: DigitalOcean personal/API tokens are **coarse** (often
account-wide or weakly scoped). Treat every token as near-admin, store only in
owner-protected GitHub Environments / offline vault, rotate on a schedule, and
revoke immediately on suspicion. Short-lived GitHub↔DO federation is **not**
available for this account model today — documented below as residual risk.

## Permission matrix

### Humans and automation

| Actor                     | DO project / resources             | OpenTofu state          | GitHub production env    | Droplet SSH            | Runtime secrets file         | Notes                                   |
| ------------------------- | ---------------------------------- | ----------------------- | ------------------------ | ---------------------- | ---------------------------- | --------------------------------------- |
| Owner                     | Full (billing, tokens, MFA, audit) | Bootstrap + emergency   | Approver + secret setter | Break-glass + day keys | Write (ceremony)             | Individually attributable; MFA required |
| CI validate (`infra` job) | None                               | None                    | None                     | None                   | None                         | Credential-free `validate-all.sh` only  |
| CI plan (`infra-plan`)    | Read enough for plan (token)       | Read via backend config | Token + backend secrets  | None                   | None                         | Dispatch-only; never apply              |
| Production apply (human)  | Create/update approved resources   | Read/write via backend  | Required approval        | Optional ops           | None during apply            | Exact-plan, concurrency-controlled      |
| Droplet day-to-day SSH    | None via SSH                       | None                    | None                     | Named keys             | Read root-owned file as root | No password; key-only                   |
| Break-glass SSH           | Same as day-to-day + recovery      | None                    | None                     | Offline key            | Read/rewrite in emergency    | Audited; MFA on vault access            |

### Workload containers (Compose roles — TTW-063)

| Consumer              | Allowed secret classes                                                                                       | Forbidden                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `api`                 | `DATABASE_URL` (app role), JWT pair, Redis/Valkey, Paystack, S3/Spaces, mail/OAuth, CORS/URLs, OTEL endpoint | DO API token; Spaces **admin**/state keys; DB **migration/backup** roles; SSH keys |
| `worker`              | Same data-plane secrets as api needed for jobs (DB app role, Redis/Valkey, S3, Paystack where jobs require)  | Owner DO token; mail OAuth client secrets unused by jobs; SSH                      |
| `scheduler`           | Minimal: DB app role (if needed), Redis/Valkey, job-trigger config                                           | Paystack secret unless a scheduled reconciliation requires it; DO token            |
| Host Valkey container | `VALKEY_PASSWORD` / `REDIS_PASSWORD` only                                                                    | Everything else                                                                    |
| Migration one-shot    | Dedicated migration DB URL (owner ceremony)                                                                  | Runtime app JWT/Paystack; DO token                                                 |

Application roles **cannot** administer infrastructure, read unrelated environment
secrets, or assume migration/backup identities (ticket invariant).

## Secret consumer inventory

Source: `docs/10-deployment-and-environments.md` (runtime contract) plus TTW-064
Valkey (`VALKEY_PASSWORD`) and Spaces keys used by S3-compatible clients.

| Secret / config                                        | Consumers                       | Store / injection                                                                          | Rotation class   |
| ------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------ | ---------------- |
| `DATABASE_URL` (app role)                              | api, worker, scheduler          | Host `/etc/tamiym/secrets.env` → Compose                                                   | DB credential    |
| Migration / backup DB URLs                             | One-shot migrate / TTW-067 jobs | Owner vault only; never in app env_file                                                    | DB credential    |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`             | api (auth)                      | Host secrets file                                                                          | JWT dual-key     |
| `REDIS_HOST` / `PORT` / `PASSWORD` / `VALKEY_PASSWORD` | api, worker, scheduler, Valkey  | Host secrets + Valkey env                                                                  | Cache/queue auth |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY`          | api, worker (webhooks/jobs)     | Host secrets file                                                                          | Payment provider |
| `S3_*` / Spaces access keys                            | api, worker                     | Host secrets file (app keys ≠ state-backend keys)                                          | Object storage   |
| `MAIL_*` / `TERMII_*` / `GOOGLE_CLIENT_*`              | api                             | Host secrets file                                                                          | Delivery / OAuth |
| `OPENAI_API_KEY` (optional moderation)                 | api                             | Host secrets file                                                                          | AI vendor        |
| Non-secret URLs (`CORS_ORIGIN`, app URLs, `OTEL_*`)    | api, frontends                  | Host secrets or Compose non-secret env                                                     | Config           |
| DigitalOcean API token                                 | Owner apply; CI plan env only   | Protected GitHub Environment / offline vault — **never** host app file or OpenTofu outputs | Provider token   |
| Droplet SSH private keys                               | Operators                       | Offline / hardware; public keys on host                                                    | SSH              |
| OpenTofu state backend Spaces keys                     | Apply/plan backends             | Protected CI/owner only — distinct from app `S3_*`                                         | Object storage   |

**Injection rule:** secret **values** never appear in git, container images,
OpenTofu plans/state **outputs**, CI logs, or ordinary deployment evidence.
Metadata (key names, owners, last-rotated dates) may live in docs and the owner
vault inventory.

## Rotation schedule

| Class                       | Cadence (production)           | Procedure outline                                                                 | Owner       |
| --------------------------- | ------------------------------ | --------------------------------------------------------------------------------- | ----------- |
| DO API token (CI plan)      | ≤90 days or on suspicion       | Mint new token → update GitHub Environment secret → revoke old → confirm plan job | Owner       |
| DO API token (apply)        | ≤90 days or on suspicion       | Same; never store in CI validate contexts                                         | Owner       |
| Droplet SSH keys            | ≤180 days; immediate on loss   | Replace authorized_keys; revoke lost key; Cloud Firewall review                   | Owner       |
| JWT access/refresh          | ≤90 days                       | Dual-key or maintenance window: deploy new secrets → drain sessions → retire old  | Owner + eng |
| Managed PostgreSQL app user | ≤90 days                       | Create new role/password → update `DATABASE_URL` → cutover → drop old             | Owner       |
| Valkey / Redis password     | ≤90 days                       | Update host file + Valkey restart (reconstructable); confirm BullMQ reconnect     | Owner       |
| Spaces / S3 app keys        | ≤90 days                       | Mint new key → update host file → verify uploads → revoke old                     | Owner       |
| Paystack secret             | On Paystack policy / suspicion | Dashboard rotate → update host file → webhook signature check                     | Owner       |
| OAuth / mail / Termii       | ≤180 days or vendor event      | Rotate at provider → update host file → smoke auth/mail                           | Owner       |

Live rotation **drills** require real secrets and are **owner-gated** (see ticket
deviations). This ticket ships the schedule and ceremony shapes only.

## Break-glass MFA procedure

1. **Trigger:** Owner locked out of DigitalOcean console, GitHub Environment, or
   Droplet (lost primary MFA device / SSH key) while production needs recovery.
2. **Pre-staged controls:**
   - Second MFA factor or recovery codes in offline owner vault (not git).
   - Break-glass SSH public key already in `authorized_keys`; private key offline.
   - Second owner contact recorded in protected ops config (TTW-060).
3. **Activation:**
   - Use recovery codes / backup MFA to regain DO + GitHub.
   - SSH with break-glass key from an allowlisted source IP if firewall permits;
     otherwise temporary firewall exception with ticket + timestamp.
   - Announce in ops channel; log start time, actor, reason (redacted).
4. **During glass:** Prefer read-only diagnosis; write only what recovery needs.
   Do not mint long-lived tokens from the Droplet. Do not dump `secrets.env` into
   chat or CI artefacts.
5. **Close-out (within 24h):**
   - Rotate any credential that may have been exposed during the incident.
   - Remove temporary firewall exceptions.
   - Re-enrol primary MFA; generate new recovery codes; store offline.
   - Rotate break-glass SSH key if the private key left offline storage.
   - File redacted evidence under the incident ticket (TTW-066/067 for alerts/DR).

## Host hardening (scaffolding)

- Cloud-init sketch: `infra/runtime/cloud-init/droplet.yaml` (password SSH off,
  unattended-upgrades, fail2ban sketch, Docker non-root notes).
- Runtime secrets pattern: `infra/runtime/secrets/README.md` + `.env.example`
  (PLACEHOLDER keys only).
- Policy: `infra/policy/assert-security-invariants.sh` (wired into
  `validate-all.sh`).

## Residual risks (accepted for launch envelope)

1. **Coarse DO tokens** — no fine-grained workload identity comparable to cloud
   IAM roles; mitigate with protected storage, rotation, and separation of
   app Spaces keys from state-backend keys.
2. **No short-lived GitHub↔DO OIDC federation** for this provider account model —
   long-lived tokens remain necessary for plan/apply; CI validate stays
   credential-free.
3. **Host file secret store** — root-owned `secrets.env` is the low-cost
   mechanism; compromise of root on the Droplet exposes runtime secrets
   (mitigate with SSH hardening, firewall, patching, minimal packages).
4. **Live MFA break-glass and rotation drills** — documented, not executed in
   this ticket without secrets.

## Related

- [TTW-060 operations access](./ttw-060-operations-access.md)
- [TTW-061 IaC foundation](./ttw-061-iac-foundation.md)
- [TTW-064 data services](./ttw-064-data-services.md)
- [Deployment env inventory](../10-deployment-and-environments.md)
- [Ticket TTW-065](../tickets/ttw-065-enforce-infrastructure-security.md)
