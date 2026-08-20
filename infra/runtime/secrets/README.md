# Runtime secrets — host file pattern (TTW-065)

Production runtime secrets are **not** stored in OpenTofu state, outputs,
plans, git, or container images. They are injected from a root-owned host file
into Compose services that declare only the variables they need.

## Canonical path

| Item           | Value                                               |
| -------------- | --------------------------------------------------- |
| Host file      | `/etc/tamiym/secrets.env`                           |
| Ownership      | `root:root`                                         |
| Mode           | `0600` (owner read/write only)                      |
| Directory      | `/etc/tamiym` → `root:root` `0750`                  |
| OpenTofu       | **Never** read, template, or output this file       |
| Example (repo) | `infra/runtime/secrets/.env.example` (PLACEHOLDERs) |

## Ceremony (owner)

1. Generate or retrieve values from the owner vault (offline / password manager).
2. On the Droplet as root:

   ```bash
   install -d -m 0750 -o root -g root /etc/tamiym
   install -m 0600 -o root -g root /dev/null /etc/tamiym/secrets.env
   # Edit with a trusted editor; paste PLACEHOLDER-replaced values only on the host.
   # cp from a root-only staging path is fine; never scp via shared user home leftovers.
   ```

3. Point Compose `env_file:` (or a root-readable drop-in) at
   `/etc/tamiym/secrets.env` for each service, **or** use a filtered file per
   role (`secrets.api.env`, …) derived from the master file without world-readable
   copies.
4. Confirm containers start and health checks pass; confirm CI logs / `tofu
output` do not contain secret values.
5. Record **key names** and **rotation timestamp** in the owner inventory (not
   values).

## Non-negotiables

- Do not put secret values in `*.tf`, `*.tfvars`, `outputs.tf`, plans, or state.
- Do not bake secrets into Docker images or gitignored-then-committed env files.
- Do not echo `secrets.env` into tickets, chat, or CI artefacts.
- Application containers must not receive DigitalOcean API tokens or state-backend
  Spaces admin keys — only app data-plane credentials listed in `.env.example`.
- Distinct Spaces keys for OpenTofu state vs application `S3_*` credentials.

## Local / CI

Developers use `apps/api/.env.example` and local Compose. CI validate jobs use
**no** production secrets. Speculative `infra-plan` may hold a provider token in
a protected GitHub Environment; that token never lands on the Droplet app file.

## Related

- [Identity & secrets doc](../../../docs/infrastructure/ttw-065-identity-secrets.md)
- [Cloud-init sketch](../cloud-init/droplet.yaml)
- [Valkey Compose snippet](../valkey/compose.snippet.yml)
