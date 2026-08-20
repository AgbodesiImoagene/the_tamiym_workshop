# TTW-063 — Production container runtime

Immutable images, Droplet Compose stack, Caddy edge wiring and `API_ROLE`
separation for the single 4 GiB DigitalOcean Droplet.

**Region:** `lon1` (ADR-001). **No horizontal autoscaling / LB** at launch.

## Artefacts

| Path                                            | Role                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| `docker/Dockerfile.next`                        | Multi-stage Next standalone images (`web` / `app` / `admin`)     |
| `docker/Dockerfile.api`                         | Shared Nest image for `api` / `worker` / `scheduler` / migrate   |
| `infra/runtime/compose/docker-compose.prod.yml` | Host Compose with budget `mem_limit`s                            |
| `infra/runtime/edge/Caddyfile`                  | TLS + reverse proxy to Compose DNS names                         |
| `infra/modules/droplet/`                        | Optional Droplet + reserved-IP assignment (`enable_app_droplet`) |
| `infra/policy/assert-runtime-invariants.*`      | Credential-free Compose/Dockerfile/Caddy gates                   |

## Process roles (`API_ROLE`)

| Role        | HTTP                   | BullMQ consumers | Cron                    |
| ----------- | ---------------------- | ---------------- | ----------------------- |
| `api`       | yes (public via Caddy) | no               | no                      |
| `worker`    | health only            | yes              | no                      |
| `scheduler` | health only            | no               | yes (singleton)         |
| `all`       | yes                    | yes              | yes (local/dev default) |

Health:

- `GET /v1/health/live` — process up
- `GET /v1/health/ready` — PostgreSQL + Redis reachable (HTTP 503 when not)
- `GET /v1/health` — legacy combined payload

Migrations run only via Compose profile `migrate` (one-off), never on replica boot.

## Resource envelope

Hard limits match `docs/infrastructure/ttw-060-resource-budget.json` (3584 MiB
container hard caps + 512 MiB host headroom on a 4096 MiB Droplet). Swap is not
used for correctness.

## Registry / supply chain

- Prefer **GHCR** digests as deployment authority (mutable tags are not).
- CI `Container Build` job builds images with Buildx SBOM + provenance on every
  PR/push; **push to GHCR remains owner-gated** (registry credentials).
- Deploy by digest into Compose (`WEB_IMAGE` / `API_IMAGE` / … env overrides).

## Owner-gated live steps

1. Set `enable_app_droplet=true` + SSH key fingerprints in `terraform.tfvars`.
2. `tofu apply` (protected identity) → Droplet + reserved IP assignment +
   cloud-init from `infra/runtime/cloud-init/droplet.yaml`.
3. Install Docker Engine / Compose on the Droplet; place secrets at
   `/etc/tamiym/secrets.env` (TTW-065).
4. Point Namecheap A records at the reserved IP; Caddy obtains certificates.
5. `docker compose … --profile migrate run --rm migrate` with
   `MIGRATION_DATABASE_URL` from the owner vault.
6. Deploy exact digests; verify readiness; reboot/drain drills on temporary-validation.

## Policy / CI

```bash
export PATH="$HOME/.local/bin:$PATH"
bash infra/scripts/validate-all.sh   # includes assert-runtime-invariants
```

CI jobs: `Infra Validate` + `Container Build` (build only, no push).
