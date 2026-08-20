# Infrastructure (OpenTofu)

DigitalOcean infrastructure-as-code for The Tamiym Workshop. Primary region is
**London (`lon1`)** (ADR-001 / TTW-060). Frankfurt (`fra1`) remains recovery only.

Pinned CLI: **OpenTofu 1.9.1** (`.opentofu-version`).

## Layout

| Path                         | Role                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `modules/`                   | Reusable modules (`labeling`, `digitalocean_project`, `vpc`, `firewall`, `reserved_ip`, `postgres`, `spaces`, `valkey_config`) |
| `runtime/valkey/`            | Host-local Valkey conf + Compose snippet for TTW-063                                                                           |
| `envs/production/`           | Production composition + isolated remote state                                                                                 |
| `envs/temporary-validation/` | Disposable validation composition + isolated state                                                                             |
| `bootstrap/`                 | Manual Spaces state-bucket bootstrap runbook + TTW-060 proof                                                                   |
| `policy/`                    | deny-secrets + network/data invariant policy helpers                                                                           |
| `scripts/validate-all.sh`    | Credential-free fmt + policy + init + validate                                                                                 |

## Environments

| Env                    | DO project name | State key prefix    | Purpose                      |
| ---------------------- | --------------- | ------------------- | ---------------------------- |
| `production`           | `ttw-prod`      | `prod/opentofu/…`   | Live production              |
| `temporary-validation` | `ttw-tmpval`    | `tmpval/opentofu/…` | Harmless fixtures / CI plans |

Each env root has its own `backend.tf` key and `terraform.tfvars`. A single
`tofu` invocation cannot target both environments.

## Commands (no credentials required)

```bash
export PATH="$HOME/.local/bin:$PATH"   # local OpenTofu 1.9.1
pnpm infra:fmt
pnpm infra:validate
# or:
./infra/scripts/validate-all.sh
```

Per-root (example):

```bash
cd infra/envs/temporary-validation
tofu fmt -check
tofu init -backend=false
tofu validate
```

## Apply (owner-gated; requires token + backend config)

1. Copy `terraform.tfvars.example` → `terraform.tfvars` (gitignored if local secrets).
2. Copy `backend.hcl.example` → `backend.hcl` (never commit).
3. Export `DIGITALOCEAN_TOKEN` from the owner secret store (never commit).
4. `tofu init -backend-config=backend.hcl`
5. `tofu plan -out=tfplan` → review → `tofu apply tfplan`

See `docs/infrastructure/ttw-061-iac-foundation.md` for the full runbook,
CI trust model, and drift plan.

## Trust boundaries

- **CI `infra` job:** format, deny-secrets, `init -backend=false -lockfile=readonly`, validate — **no** DO token, **no** apply.
- **CI `infra-plan` workflow:** **workflow_dispatch only** into a protected GitHub Environment that holds `DIGITALOCEAN_TOKEN`; speculative `tofu plan` for the selected env; never on `pull_request` heads; never applies.
- **Production apply:** human-approved, exact-plan, concurrency-controlled (TTW-065 hardens identities).
- State files, plans (`tfplan`), `backend.hcl`, `.terraform/`, and API tokens never enter git; `.terraform.lock.hcl` **is** committed.

## Related docs

- [TTW-060 state backend](../docs/infrastructure/ttw-060-opentofu-state-backend.md)
- [TTW-061 IaC foundation](../docs/infrastructure/ttw-061-iac-foundation.md)
- [TTW-062 network / edge](../docs/infrastructure/ttw-062-network-edge.md)
- [TTW-062 Namecheap DNS](../docs/infrastructure/ttw-062-namecheap-dns.md)
- [TTW-064 data services](../docs/infrastructure/ttw-064-data-services.md)
- [TTW-061 ticket](../docs/tickets/ttw-061-establish-iac-foundation.md)
- [TTW-062 ticket](../docs/tickets/ttw-062-provision-network-dns-edge.md)
- [TTW-064 ticket](../docs/tickets/ttw-064-provision-managed-data-services.md)
