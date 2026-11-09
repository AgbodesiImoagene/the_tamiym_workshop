# TTW-187 — Make Infra Validate survive transient network errors

**Epic:** 0 — Trustworthy delivery system  
**Status:** Not started  
**Risk:** Standard  
**Blocked by:** None  
**Blocks:** None

## Background

The `Infra Validate` job of `.github/workflows/ci.yml` (lines 388-398) turned `main` red four times in two days. Each time it was the only failing job, and each time the cause was a network error, not the code:

| Run         | Commit    | Date (UTC)       | Failing step                                    | Error                                                                                                                                                               |
| ----------- | --------- | ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 42470024159 | `a21ca54` | 2026-11-08 10:06 | `Format, init-without-backend, validate`        | `Failed to install provider` `digitalocean/digitalocean v2.100.0`: `504 Gateway Timeout returned from github.com`                                                   |
| 42472249437 | `1ee04e9` | 2026-11-08 10:38 | same                                            | same provider install, network error; passed on re-run                                                                                                              |
| 42568829823 | `d4cce67` | 2026-11-09 05:42 | same                                            | `failed to retrieve authentication checksums for provider` … `504 Gateway Timeout`; passed on re-run                                                                |
| 42569973260 | `2d79299` | 2026-11-09 05:54 | `Install OpenTofu 1.9.1`, then `Format, init-…` | attempt 1: `Unexpected HTTP response: 504` from `opentofu/setup-opentofu@v1`; attempts 2 and 3: provider install `504 Gateway Timeout`. Still red after 3 attempts. |

The last commit only changed three ticket files under `docs/tickets/`.

Why the job is so exposed:

- `infra/scripts/validate-all.sh` runs `tofu init -backend=false -input=false -lockfile=readonly` in **10 roots**: 8 modules and 2 envs, each with its own `.terraform.lock.hcl`. No plugin cache is set, so the same DigitalOcean provider is downloaded and its checksums and signature fetched 10 times per run. One 504 on any of them fails the job.
- `opentofu/setup-opentofu@v1` downloads the OpenTofu binary from GitHub on every run, with no cache.
- OpenTofu's own retry (`failed after 2 attempts`) is too short for these outages.

The same install and script also run in `.github/workflows/release-candidate.yml:35-40`, and the install plus one `tofu init` in `.github/workflows/infra-plan.yml:34-39`.

Cost: each occurrence makes `main` look broken, hides a real failure if one ever happens at the same time, and needs a person to re-run the job by hand.

## Proposal

To confirm at design review:

1. **Provider plugin cache.** Set `TF_PLUGIN_CACHE_DIR` for the job and restore it with `actions/cache`, keyed on the hash of every `infra/**/.terraform.lock.hcl`. A cache hit downloads nothing. A miss downloads the provider once, not 10 times, because later `init`s reuse the cache. The lock files keep `-lockfile=readonly` and their checksums, so a cached provider is still verified.
2. **Bounded retry on network failures only.** In `validate-all.sh`, retry `tofu init` a few times with a growing delay (for example 3 attempts, 10 s then 30 s) **only** when its output shows a network error (`504`, `502`, `503`, `timeout`, `could not query provider registry`). `tofu validate`, `tofu fmt -check` and the policy scripts are never retried.
3. **OpenTofu binary.** Check whether `opentofu/setup-opentofu` can be made to retry or cache. Otherwise cache the binary with `actions/cache` (key: version + OS), or wrap the install step in a retry.
4. Apply the same to `release-candidate.yml`, which runs the same script and install. `infra-plan.yml` is to check at design review.

Rejected:

- `continue-on-error` or skipping the job on network errors: it would hide real infra failures.
- Committing provider binaries to the repository: large, platform-specific, and against the lock-file model.

## Invariants

- A real error still fails the job: a format, validation, policy or lock-file checksum mismatch.
- Providers stay pinned and verified by `.terraform.lock.hcl` (`-lockfile=readonly` kept).
- No secret or credential is added. The job stays credential-free.
- `pnpm infra:validate` keeps working locally, with or without a cache directory.

## Implementation plan

1. Design review: confirm the cache key, which errors count as network errors, and the retry bounds.
2. Add the plugin cache to the job, in `ci.yml` and `release-candidate.yml`.
3. Add the bounded network-only retry around `tofu init` in `validate-all.sh`.
4. Make the OpenTofu install step resilient.
5. Prove it: one run that fills the cache, one that hits it (no provider download in the log), and one that still fails on a deliberate real error, such as a `tofu fmt` violation on a throwaway branch or locally.

## Test and observability plan

- Unit/component: if the retry logic lives in a function, test it with a fake `tofu` that fails with a 504 and then succeeds, and with a fake that fails with a validation error (must not retry).
- Integration/e2e: `pnpm infra:validate` locally; CI runs on `main` after the push.
- Failure, retry, and concurrency: retry bounded in attempts and total time; each retry logged with the reason, so a slow job is explained.
- Logs, metrics, traces, and alerts: the job log shows cache hit or miss and every retry.

## References

- `.github/workflows/ci.yml:388-398` — `Infra Validate` job.
- `.github/workflows/release-candidate.yml:35-40` — same install and script.
- `.github/workflows/infra-plan.yml:34-39` — same install, one `tofu init`.
- `infra/scripts/validate-all.sh` — `validate_root`, 10 `tofu init` calls.
- `infra/**/.terraform.lock.hcl` — 10 lock files.
- `package.json:69` — `infra:validate`.

## Acceptance criteria

- [ ] On a cache hit, the job downloads no provider (shown in the CI log).
- [ ] A transient network error on `tofu init` is retried and logged; a validation or format error is not retried and fails at once.
- [ ] Lock files and `-lockfile=readonly` are unchanged.
- [ ] `pnpm infra:validate` passes locally, and CI on `main` is green after the push.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Network errors in other CI jobs (container builds, Playwright browsers): separate tickets if they show up.
- Changing the OpenTofu or provider versions.

## Design review

Standard risk: record a design review before implementation.

## Implementation reviews

## Verification evidence

## Completion summary
