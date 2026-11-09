# TTW-195 — Generate the MFA test key at run time in CI workflows

**Epic:** 8 — Client review delivery  
**Status:** Complete (merged and pushed to `main`, CI green)  
**Risk:** Standard  
**Blocked by:** None  
**Blocks:** None

## Background

TTW-180 (see `ttw-180-refuse-known-test-mfa-keys-in-production.md`, section "Design review") made production refuse the public MFA test key, and left open an option: stop hard-coding that key in the CI workflows. GitGuardian flagged the test value of `MFA_TOTP_ENCRYPTION_KEY` as a "Generic Encryption Key" in `.github/workflows/playwright-matrix.yml` on 2026-11-08. The repository is public, so every new workflow or push that carries the literal value can raise the alert again.

Before this ticket the literal `zghUm6jv…zdQ=` was set in the job `env:` of four jobs:

- `.github/workflows/ci.yml` (API e2e job, Playwright smoke job);
- `.github/workflows/playwright-comprehensive.yml`;
- `.github/workflows/playwright-matrix.yml`.

Nothing in CI depends on the value itself. The API reads `MFA_TOTP_ENCRYPTION_KEY` from the environment, and `apps/api/scripts/seed-e2e-dummy-data.ts:521` reads the same variable (`process.env`) to encrypt the seeded admin TOTP secrets. CI does not load `apps/api/.env.test` (`playwright.config.ts:33`, only when `CI` is unset). No e2e spec or Playwright test hard-codes the key (searched the repository).

## Proposal

In each of the four jobs, remove the literal from `env:` and add a first step after checkout that generates a random key and exports it to the rest of the job:

```bash
key="$(openssl rand -base64 32)"
echo "::add-mask::${key}"
echo "MFA_TOTP_ENCRYPTION_KEY=${key}" >> "$GITHUB_ENV"
```

The key is random per job (per matrix leg too). Every later step of that job (seed, API server started by Playwright, e2e) sees the same value, so seed and API agree.

Rejected:

- A GitHub repository secret: needs manual setup, is unavailable to fork pull requests, and the value is not sensitive.
- A different committed constant: still a committed key.
- Changing `seed-e2e-dummy-data.ts`: it already reads `process.env.MFA_TOTP_ENCRYPTION_KEY`, the same variable as the API, so it needs no change.

## Invariants

- Within one job, the API, the seed and the e2e run use the same key.
- No encryption key literal remains in `.github/`.
- The key never appears in job logs (`::add-mask::`).
- Values in `apps/api/.env.example`, `apps/api/.env.test.example`, the specs and `env-validation.ts` are unchanged (local development, and the production refusal list from TTW-180).

## Implementation plan

1. Remove the `MFA_TOTP_ENCRYPTION_KEY` line from the four `env:` blocks.
2. Add the "Generate ephemeral MFA encryption key" step right after `actions/checkout` in the four jobs.
3. Run the workflow validator, formatter and documentation validator; prove the snippet locally.
4. Independent review; record the unverified CI proof.

## Test and observability plan

- Unit/component: none (no application code changes).
- Integration/e2e: the jobs themselves. Proof needs a CI run, which needs a push (not done here).
- Failure, retry, and concurrency: each job and matrix leg generates its own key; a re-run generates a new one. Seed and API run in the same job, so they agree. A step failing before `GITHUB_ENV` is written would leave the variable unset, and the API would then refuse to boot with "Missing required environment variable" (loud, not silent).
- Logs: `::add-mask::` hides the value if it is ever echoed.

## References

- `.github/workflows/ci.yml` — API e2e job and Playwright smoke job.
- `.github/workflows/playwright-comprehensive.yml`, `.github/workflows/playwright-matrix.yml`.
- `apps/api/scripts/seed-e2e-dummy-data.ts:521` — seed reads the same env variable.
- `apps/api/src/config/env-validation.ts` — the committed test key stays here on purpose, as the production refusal list (TTW-180).

## Acceptance criteria

- [x] No MFA encryption key literal remains under `.github/` (`grep` returns nothing).
- [x] The four jobs generate the key at run time, mask it, and export it through `$GITHUB_ENV`.
- [x] `pnpm workflows:validate`, `pnpm docs:validate` and the formatter pass.
- [x] A CI run on `main` is green with the generated key (see Post-merge CI evidence).

## Out of scope

- Rewriting Git history to remove the old literal.
- Key rotation (nothing in production was ever encrypted with it).
- `apps/api/.env.example`, `apps/api/.env.test.example`, the specs (including `apps/api/src/config/env-validation.spec.ts:24`): they keep their values for local development.
- The key literal in `env-validation.ts` and its spec: required by TTW-180. The owner can mark any remaining GitGuardian hit on those files as a test credential.

## Design review

Self-review by the implementer (Standard; CI configuration only, no product code).

- Blast radius: four CI jobs, all of which already carry only test values. `GITHUB_ENV` persists to later steps of the same job, which is where the seed and the Playwright web servers run.
- Duplication: the same 5-line step is repeated four times. A composite action would remove it, but adds a new file for a trivial step; kept inline.
- Edge cases: the `integration` job runs the API e2e in `NODE_ENV=test`, where `validateEnv` is skipped but `decodeMfaEncryptionKey` still checks 32 bytes; `openssl rand -base64 32` gives exactly 32 bytes (checked in Verification evidence). Fork pull requests get the same generated key, no secret needed.
- Risk: if a step ran before the generation step it would not see the key. The step is first after checkout.
- Verdict: go.

## Implementation reviews

Independent review (fresh read-only subagent, 2026-11-09): **PASS**, no blocking or major finding. It did not run CI or the validators.

- No key literal under `.github` or `scripts`; the other workflows do not reference MFA or the key.
- In all four jobs the step is the first after checkout, before install, migration, seed, API e2e and Playwright servers (`ci.yml:200`, `ci.yml:306`, `playwright-comprehensive.yml:80`, `playwright-matrix.yml:93`).
- The seed, the API e2e (`.env.test` loaded with `override: false`, absent in CI) and the Playwright API server (`...process.env`, `.env.test` skipped when `CI` is set) all receive the generated key. Nothing reads the variable from the job `env:`.
- Minor findings, fixed here: the acceptance box and the evidence sections were not filled; `env-validation.spec.ts` added to the out-of-scope list. The four-fold repetition of the step is a recorded choice, not a defect.
- Info: `::add-mask::` hides the value in logs, but any step of the job can read it. Acceptable for a test value.

## Verification evidence

Run in the ticket worktree:

- `grep -rn zghUm6jv .github` returns nothing.
- `pnpm workflows:validate`: "Workflow validation passed."
- `pnpm docs:validate`: "Documentation validation passed."
- `pnpm format:check`: "All matched files use Prettier code style!"
- Local replay of the step: one line written to a temporary `GITHUB_ENV`, decodes to 32 bytes, base64 round-trips; the `::add-mask::` line was emitted.

Post-merge CI evidence (2026-11-09, `main` at `6a8d4bf`): CI run 42720263522 success (5m1s); Playwright Comprehensive run 42720264168 success (2m59s); Playwright Matrix run 42721140578 success (7m27s, started by hand with `gh workflow run`, since it only runs nightly or on dispatch). Not verified: the e2e suites were not run locally.

## Completion summary

The four CI jobs no longer carry the MFA test key. Each generates a random key after checkout, masks it and exports it through `$GITHUB_ENV`; the API and the e2e seed read it from the environment. No application code changed.

Deviations: none. The seed needed no change because it already reads the same variable.

Left to do: the repository belongs to the client's GitHub account, and so does the GitGuardian alert. The client (not the project team) must mark the alert for `playwright-matrix.yml` as resolved; hits on `env-validation.ts`, the specs or the example files can be marked as test credentials.
