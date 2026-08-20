# TTW-063 — Build and deploy the production application runtime

**Epic:** 6 — Production infrastructure as code\
**Status:** Not started\
**Risk:** High\
**Blocked by:** TTW-062, TTW-064, TTW-065\
**Blocks:** TTW-053, TTW-066, TTW-068

## Background

All four applications have build/start scripts, but the repository has no production container definitions or registry workflow. The API currently registers HTTP controllers, BullMQ processors and cron schedulers in one process. Scaling that process horizontally could duplicate scheduled work, while treating a basic `/health` response as readiness could route traffic to instances without usable dependencies.

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

- [ ] CI reproducibly builds minimal non-root images for all applications and publishes immutable digest, SBOM, provenance and approved scan results.
- [ ] Runtime configuration contains no baked credentials and starts only with a valid environment contract.
- [ ] API, worker and singleton scheduler responsibilities and scaling rules are explicit and tested against duplicate effects.
- [ ] Readiness/liveness/startup and graceful shutdown behavior pass dependency-failure and termination tests.
- [ ] A temporary-validation deployment, failed-candidate rollback and Droplet reboot preserve request/job correctness within the approved single-node availability model.
- [ ] Database migrations run as a separately authorized, observable one-off action with compatibility gates.

## Out of scope

- Resolving domain idempotency/correctness gaps → TTW-010–TTW-015.
- Defining the final release authorization workflow → TTW-054 and TTW-068.

## Design review

Record reviewer, date, image supply chain, process roles, scheduler invariant, health semantics, resources/scaling, migration ordering, failure/drain behavior and verdict.

## Implementation reviews

Require independent implementation and security review of images, identities, runtime boundaries and rollout; repeat until PASS.

## Verification evidence

Record image digests/SBOM/provenance/scans, runtime policy checks, health/failure test names, scheduler/worker concurrency results and temporary-validation rollout/recovery timings.

## Completion summary

Summarize artefacts, registry, workload roles, sizing/scaling, health/drain behavior, migration mechanism, rollout evidence and residual risks.
