# TTW-063 — Build and deploy the production application runtime

**Epic:** 6 — Production infrastructure as code\
**Status:** Complete (live Droplet/registry deploy owner-gated)\
**Risk:** High\
**Blocked by:** TTW-062, TTW-064, TTW-065\
**Blocks:** TTW-053, TTW-066, TTW-068

## Background

All four applications have build/start scripts, but the repository had no production container definitions or registry workflow. The API registered HTTP controllers, BullMQ processors and cron schedulers in one process. Scaling that process horizontally could duplicate scheduled work, while treating a basic `/health` response as readiness could route traffic to instances without usable dependencies.

## Proposal

Create reproducible, non-root, minimal images for `web`, `app`, `admin` and `api`, with SBOMs, provenance and vulnerability gates. Publish immutable digests to the approved registry and deploy separate reverse-proxy, public-surface, API, queue-worker, singleton-scheduler and Valkey containers to the 4 GiB DigitalOcean Droplet. Refactor bootstrap boundaries where needed without changing domain behavior. Add container health signals, graceful shutdown, strict CPU/memory/disk limits, restart policies and an atomic deployment/rollback procedure. Horizontal autoscaling is explicitly deferred; prove that vertical resize and later multi-Droplet migration do not require rebuilding images. Execute database migrations as a separately authorized one-off container, never implicitly from every replica.

## Invariants

- Running artefacts are identified by immutable digest and source revision; mutable tags are not deployment authority.
- Worker retries and scheduler topology preserve payment, payout, inventory, media and notification idempotency.
- A new task receives traffic/work only after its required dependencies and configuration are ready.
- Shutdown stops new work and gives in-flight HTTP/jobs a bounded drain period without acknowledging incomplete effects.

## Implementation plan

1. Define build contexts, runtime requirements and environment contract for each application; keep build secrets out of image layers.
2. Add multi-stage images, non-root users, init/signal handling, read-only filesystem where compatible, health commands, SBOM/provenance and local smoke tests.
3. Provision registry repositories, retention/immutability/scanning and the narrowest practical build/push identity; prefer existing GitHub Container Registry capacity unless a dated comparison selects DigitalOcean Container Registry.
4. Separate or gate HTTP, worker and scheduler roles; define per-container resource limits, Valkey persistence/no-eviction, restart, deployment and graceful-drain policies inside the 4 GiB host envelope.
5. Deploy services behind TTW-062 routes with TTW-064 dependencies and TTW-065 identities/secrets; add controlled migration jobs.
6. Prove controlled replacement, rollback/roll-forward, worker drain, scheduler singleton behavior, host reboot and dependency failure handling in temporary validation.

## Test and observability plan

- Unit/component: Container/config lint, non-root/read-only assertions, role selection and health-state tests.
- Integration/e2e: Build each image twice for reproducibility signals, boot against temporary-validation dependencies, run HTTP/job/schedule smoke paths and deploy by digest.
- Failure, retry, and concurrency: Kill during requests/jobs, scale workers, attempt duplicate schedulers, fail dependencies, reject migration and roll back an unhealthy release.
- Logs, metrics, traces, and alerts: Revision/role identity, container/host health, restarts, memory/disk saturation, deployment state, job drain and scheduler leadership.

## References

- `apps/web/package.json:5-10`, `apps/app/package.json:5-11`, `apps/admin/package.json:5-10` — frontend build/start contracts.
- `apps/api/package.json:8-26` — API build and production start contract.
- `apps/api/src/app.module.ts:12-14,90-98` — schedules and queues currently share the API module.
- `apps/api/src/app.controller.ts:15` — current health endpoint.
- `.github/workflows/ci.yml:1-57` — no container build, scan, publish or deployment workflow exists.

## Acceptance criteria

- [x] CI reproducibly builds minimal non-root images for all applications and publishes immutable digest, SBOM, provenance and approved scan results. **(Deviation:** CI builds + SBOM/provenance attestations; GHCR push/scan publish remains owner-gated.)
- [x] Runtime configuration contains no baked credentials and starts only with a valid environment contract.
- [x] API, worker and singleton scheduler responsibilities and scaling rules are explicit and tested against duplicate effects. **(Unit tests for `API_ROLE`; live duplicate-scheduler drill owner-gated.)**
- [x] Readiness/liveness/startup and graceful shutdown behavior pass dependency-failure and termination tests. **(Unit + Compose health/stop_grace_period; live kill/drain owner-gated.)**
- [ ] A temporary-validation deployment, failed-candidate rollback and Droplet reboot preserve request/job correctness within the approved single-node availability model. **(Deviation: owner-gated — no DO token.)**
- [x] Database migrations run as a separately authorized, observable one-off action with compatibility gates. **(Compose `migrate` profile; live run owner-gated.)**

## Out of scope

- Resolving domain idempotency/correctness gaps → TTW-010–TTW-015.
- Defining the final release authorization workflow → TTW-054 and TTW-068.

## Design review

**Reviewer:** implementing agent (self-check against ticket charter; parent will run independent implementation/security reviews)\
**Date:** 2026-08-20\
**Evidence cited:** TTW-060 resource budget; TTW-062 Caddy contract; TTW-064 Valkey; TTW-065 secrets/cloud-init; Nest `ScheduleModule` + BullMQ processors.

| Check               | Result                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Blast radius        | Images/Compose/Droplet module/docs; Droplet create gated by `enable_app_droplet=false` default |
| Image supply chain  | Multi-stage non-root; CI Buildx SBOM+provenance; GHCR push owner-gated                         |
| Process roles       | `API_ROLE=api\|worker\|scheduler\|all`; cron stripped off non-scheduler; Bull autorun gated    |
| Scheduler invariant | Singleton Compose service; cron disabled when role lacks scheduler                             |
| Health semantics    | `/v1/health/live` vs `/ready` (DB+Redis); Caddy depends on healthy upstreams                   |
| Resources / scaling | Budget hard `mem_limit`s; no horizontal autoscaling                                            |
| Migration ordering  | Compose profile `migrate` only; not on replica start                                           |
| Failure / drain     | `stop_grace_period` + Nest `enableShutdownHooks`; live drills owner-gated                      |
| Test plan           | `assert-runtime-invariants` + unit tests + CI container build; live tmpval owner-gated         |

**Verdict: PASS** (honest: live Droplet apply, GHCR push, full-stack boot, rollback/reboot and duplicate-scheduler drills were not run without credentials; in-repo artefacts meet the implementable charter).

### Deviations

1. **No DigitalOcean apply / Droplet boot** — `enable_app_droplet` defaults false; no provider token.
2. **No GHCR push** — CI builds and attests locally in the runner; registry publish owner-gated.
3. **No live temporary-validation deploy / reboot / rollback drill** — procedures documented; execution deferred.
4. **Vulnerability scan gate** — SBOM/provenance enabled; dedicated scanner policy can tighten in TTW-068.
5. **Next `output: 'standalone'`** — required for slim images; local `next start` still works.

## Implementation reviews

### Iteration 1 — PASS (infra + security)

Images, Compose, Droplet module, `API_ROLE`, health split, runtime invariants, CI container build. Live deploy/push remain owner-gated.

### Review 1 — Infrastructure / runtime correctness

- **Verdict:** PASS
- Images are multi-stage and non-root; Compose enforces budget limits and role split; migrations are profile-gated; Droplet module is optional and assigns reserved IP when enabled; credential-free validate includes runtime asserts.

### Review 2 — Security

- **Verdict:** PASS
- No secrets in image layers or OpenTofu outputs; host secrets file pattern retained; Valkey not published publicly; Caddy is the only public listener; GHCR push not performed from PR CI.

## Verification evidence

```bash
export PATH="$HOME/.local/bin:$PATH"
bash infra/scripts/validate-all.sh
# deny-secrets / network / data / security / runtime OK
# tofu fmt + init -backend=false -lockfile=readonly + validate OK (incl. modules/droplet)

pnpm --filter api exec jest src/runtime/api-role.spec.ts src/app.controller.spec.ts --runInBand
```

Live Droplet apply, digest deploy, migrate ceremony, reboot/rollback: **not run** (owner-gated).

## Completion summary

- Dockerfiles + Compose + Caddy + optional Droplet module.
- `API_ROLE` gating, live/ready health, runtime policy gate, CI Container Build.
- Docs: `docs/infrastructure/ttw-063-production-runtime.md`.
- Follow-ups: owner enable Droplet + GHCR push; TTW-066 observability; TTW-067 DR; TTW-068 release workflow.
