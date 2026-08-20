# TTW-061 — OpenTofu IaC foundation

Pinned tooling, repository layout, environment isolation, CI trust model, apply
runbook and drift detection plan for DigitalOcean infrastructure.

**Depends on:** [TTW-060 state backend](ttw-060-opentofu-state-backend.md),
ADR London primary (`lon1`).

## Naming

| Concept          | Convention                               | Examples                             |
| ---------------- | ---------------------------------------- | ------------------------------------ |
| DO project       | `ttw-<env-short>`                        | `ttw-prod`, `ttw-tmpval`             |
| Tag keys         | `project`, `env`, `managed_by`, `ticket` | `env:production`                     |
| State object key | `<env-short>/opentofu/<name>.tfstate`    | see below                            |
| Module path      | `infra/modules/<capability>`             | `labeling`, `digitalocean_project`   |
| Env root         | `infra/envs/<environment>`               | `production`, `temporary-validation` |

Default region for resources: **`lon1`**.

## State keys

| Environment          | Backend key                              | DO project   |
| -------------------- | ---------------------------------------- | ------------ |
| production           | `prod/opentofu/infrastructure.tfstate`   | `ttw-prod`   |
| temporary-validation | `tmpval/opentofu/infrastructure.tfstate` | `ttw-tmpval` |

Backend type: S3-compatible (Spaces) with `use_lockfile = true`. Bucket name,
endpoint and credentials are supplied only via `-backend-config` / `backend.hcl`
(gitignored). See `infra/bootstrap/README.md`.

## CI trust model

| Surface                                | Credentials                                                  | Actions                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml` job `infra` | None                                                         | `infra/scripts/validate-all.sh` (fmt, deny-secrets, `init -backend=false -lockfile=readonly`, validate)                 |
| `.github/workflows/infra-plan.yml`     | `DIGITALOCEAN_TOKEN` from a **protected GitHub Environment** | **workflow_dispatch only** — speculative `tofu plan` for the selected env; never on `pull_request` heads; never applies |
| Production apply                       | Owner-protected environment (TTW-065)                        | Human-approved exact-plan apply; never from untrusted PR code                                                           |

Rules:

- Pull-request heads never receive provider credentials (no credentialed jobs on `pull_request`).
- Speculative plans require an authorized operator to dispatch the workflow into a protected environment.
- CI never runs `tofu apply`.
- State, plans and tokens never upload as CI artefacts.
- Committed `.terraform.lock.hcl` files pin providers; inits use `-lockfile=readonly`.

## Apply runbook (owner)

1. Confirm Spaces state bucket exists and is versioned (`infra/bootstrap/README.md`).
2. Working from a clean checkout of the reviewed commit:
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   cd infra/envs/<environment>
   cp backend.hcl.example backend.hcl   # fill locally
   export DIGITALOCEAN_TOKEN=…          # from owner secret store
   tofu init -reconfigure -backend-config=backend.hcl -lockfile=readonly
   tofu plan -out=tfplan
   ```
3. Attach the plan summary to the change review; verify the plan matches the exact commit.
4. `tofu apply tfplan` with concurrency protection (native lockfile).
5. Record apply identity (who/when/commit) for audit; destroy temporary-validation fixtures after use.
6. Delete local `tfplan` (gitignored).

**Deviation (TTW-061):** live DigitalOcean fixture apply/destroy is **owner-gated**
until `DIGITALOCEAN_TOKEN` is available in a protected environment. CI validates
without credentials.

## Drift detection plan

1. **Scheduled** (post-TTW-065 identity hardening): nightly `tofu plan -detailed-exitcode`
   against production using a read-scoped token in the owner environment.
2. Exit code `2` (drift) opens an actionable alert with the plan summary; exit `0`
   is healthy; exit `1` fails the job.
3. Drift remediations require a reviewed apply of an exact plan — no silent auto-apply.
4. Temporary-validation is excluded from production drift alerts.

## Layout reference

See `infra/README.md` for directory roles and local commands.

## Verification (credential-free)

```bash
export PATH="$HOME/.local/bin:$PATH"
pnpm infra:validate
# equivalent:
./infra/scripts/validate-all.sh
```
