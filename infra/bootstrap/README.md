# Spaces state-bucket bootstrap (owner runbook)

This bootstrap is **manual and owner-gated**. It creates the remote state
backend used by `envs/production` and `envs/temporary-validation`. Do **not**
automate this from untrusted PRs.

The TTW-060 MinIO proof remains at `state-backend-proof/` and must stay
untouched as historical evidence.

## Prerequisites

- DigitalOcean account with Spaces enabled in **lon1** (primary).
- Owner-held Spaces access key with rights limited to the state bucket.
- OpenTofu **1.9.1** on `PATH`.
- No secrets committed to git.

## Create the state bucket (console or `doctl`)

1. Create a Spaces bucket dedicated to OpenTofu state, e.g. `ttw-tofu-state`, in `lon1`.
2. Enable **versioning**.
3. Restrict access to the owner CI environment / operator keys only (no public ACL).
4. Prefer separate credentials (or bucket policies) so production and
   temporary-validation cannot be targeted with the same implicit config.
   At minimum use distinct state key prefixes:
   - `prod/opentofu/…`
   - `tmpval/opentofu/…`

## Wire an environment root

```bash
cd infra/envs/temporary-validation   # or production
cp backend.hcl.example backend.hcl   # fill real endpoint + keys locally
export DIGITALOCEAN_TOKEN=…          # never echo into logs/artefacts
export PATH="$HOME/.local/bin:$PATH"
tofu init -reconfigure -backend-config=backend.hcl
tofu plan
```

## Prove locking (once credentials exist)

1. Start a long-running apply in one shell (or hold a lock intentionally).
2. In a second shell, attempt `tofu apply` against the same state key.
3. Expect lock acquisition failure; record evidence for TTW-061 verification.
4. Destroy any temporary-validation fixture after the exercise.

## Recovery

1. List object versions for the affected state key.
2. Restore the last known-good version to current.
3. `tofu init -reconfigure` and `tofu plan` — expect no unexpected destroys.
4. Rotate compromised Spaces keys immediately.

## Out of scope here

- Application Droplets, VPC, managed databases → TTW-062–TTW-064.
- Workload identity / secret rotation automation → TTW-065.

See also: `docs/infrastructure/ttw-060-opentofu-state-backend.md`,
`docs/infrastructure/ttw-061-iac-foundation.md`.
