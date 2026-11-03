# TTW-006 — Fix the invalid YAML in the release-candidate workflow

**Epic:** 0 — Trustworthy delivery system\
**Status:** Complete (2026-11-03): merged to `main` as `46de3a9`; manual release-candidate run #205 green\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** Release-candidate rehearsal (TTW-054, TTW-068)

## Background

On every push to `main`, GitHub rejects `.github/workflows/release-candidate.yml` before running it: "Invalid workflow file … You have an error in your yaml syntax on line 71" (run #202 for commit `c9f4bb6`, 2026-11-03). Line 71 is a step name containing an unquoted `: `:

```yaml
- name: Build ${{ matrix.name }} image (push: false)
```

YAML reads `(push: false)` as a nested mapping. The line came with commit `8ec8609` (TTW-054 slice 2), so the release-candidate workflow has not run since, and the container build rehearsal it provides is silently skipped.

Found during implementation (2026-11-03): GitHub only reports the first error, but the file has **three** such step names, lines 71, 86 and 141 (`BLOCK_AS_IMPLICIT_KEY` from the `yaml` parser). The workflow is `workflow_dispatch` only, so it never starts on push; the push-time failure is GitHub refusing to load the file. The first acceptance criterion is reworded accordingly.

## Proposal

Quote the step name (`name: "Build ${{ matrix.name }} image (push: false)"`) and check the whole file for the same pattern. Validate the file locally (for example with `actionlint` or a YAML parser) before pushing. Optionally add a workflow-syntax check to the quality gates so an invalid workflow fails CI on the pull request or push that introduces it.

## Invariants

- The workflow's jobs, triggers and images are unchanged; only the syntax is fixed.

## Implementation plan

1. Quote the offending names; scan the other workflows for unquoted `: ` in scalars.
2. Validate locally, push, confirm the workflow runs on GitHub.
3. Workflow syntax check in CI (user chose to include it, 2026-11-03): `scripts/quality/validate-workflows.mjs` parses every `.github/workflows/*.y{a,}ml` with `yaml` (now a root devDependency) and requires a mapping with `on` and `jobs`; `pnpm workflows:validate` / `pnpm workflows:validate:test`, run in the CI `Documentation` job.

## Test and observability plan

- Unit/component: `scripts/quality/__tests__/validate-workflows.test.mjs` (`node:test`): repository root passes; unquoted `(push: false)` step name reported with file and line; same name quoted accepted; missing `jobs`; non-mapping document; non-YAML files ignored.
- Integration/e2e: the release-candidate workflow runs on GitHub after the fix (record the run link).
- Failure, retry, and concurrency: not applicable.
- Logs, metrics, traces, and alerts: none.

## References

- `.github/workflows/release-candidate.yml:71`, `:86`, `:141` — unquoted `(push: false)`.
- Commit `8ec8609` — introduced the line.
- GitHub Actions run #202 of `release-candidate.yml` (commit `c9f4bb6`) — "Invalid workflow file".

## Acceptance criteria

- [x] GitHub no longer reports `release-candidate.yml` as an invalid workflow file on push, and a manual "Run workflow" dispatch starts (record the run link).
- [x] No other workflow file has the same syntax problem (`pnpm workflows:validate` parses all six workflows; see evidence).
- [x] An invalid workflow file fails the CI `Documentation` job (`.github/workflows/ci.yml`, step "Validate GitHub workflow syntax").

## Out of scope

- Changes to what the release-candidate workflow builds or deploys.

## Design review

Not required (low risk).

## Implementation reviews

- 2026-11-03, `/code-review low` on the full diff (workflow, CI step, validator, package.json): **no findings**.

## Verification evidence

### Local, 2026-11-03 (Node 24.22.1, pnpm 9.0.0)

- Red, before the fix: `pnpm workflows:validate` → exit 1, `release-candidate.yml:71`, `:86`, `:141: invalid YAML (BLOCK_AS_IMPLICIT_KEY)`; `pnpm workflows:validate:test` → **5 passed, 1 failed** (`validateWorkflows passes on repository root`, the same three errors).
- Fix: the three step names quoted (Prettier normalised them to single quotes); no other line of the workflow changed.
- Green: `pnpm workflows:validate` → "Workflow validation passed."; `pnpm workflows:validate:test` → **6/6**; `pnpm docs:validate` passed and `pnpm docs:validate:test` **11/11**; `pnpm lint` → 6/6 tasks successful; `pnpm install --frozen-lockfile` succeeds.
- `pnpm format:check` reports 97 local files that are gitignored or untracked (Prisma output, `next-env.d.ts`, `.claude/`), the same count with and without this change; none of them is tracked.
- Side effect of `pnpm add -Dw yaml@^2.9.0`: pnpm deduplicated lint-staged's transitive `yaml` from 2.8.2 to 2.9.0 (within its range).

### GitHub

2026-11-03, after `46de3a9` reached GitHub:

- Before the fix, every push, including ticket branches, produced an "Invalid workflow file" failure for this workflow (runs #200–#204, for example #201 on `codex/ttw-038-fix-invalid-pricing-quote-query`).
- Push of `46de3a9` to `codex/ttw-006-fix-release-candidate-workflow-syntax`, then to `main` (`12b4624..46de3a9`): no new "Invalid workflow file" run (`GET /repos/AgbodesiImoagene/the_tamiym_workshop/actions/workflows/release-candidate.yml/runs` still at `total_count` 204 after both pushes).
- `GET /repos/…/actions/workflows` now lists the workflow by its name, "Release Candidate", instead of its path, and the Actions page shows the "Run workflow" button.
- Manual dispatch on `main`: [run #205](https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/41672213561) (`workflow_dispatch`, `46de3a9`) concluded **success** (2026-11-03T16:21Z), all seven jobs green: "Validate infra (credential-free)", the four "Build images (no push)" matrix jobs, "Assemble release manifest" and "Live temporary-validation (owner-gated)" (fail-closed default path).
- CI on `main` for `46de3a9` ([run](https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/41667735477)): the `Documentation` job's new step "Validate GitHub workflow syntax" passed. The run is red only on "Production Audit", the pre-existing failure tracked in TTW-007; every other job is green.
- Process note: a parallel session switched branches in the same checkout during this ticket, so the first push of the ticket branch carried `12b4624` (no fix). The branch was re-pointed to `46de3a9` and pushed again; the evidence above comes from that second push.

## Completion summary

GitHub loads `release-candidate.yml` again and the owner-dispatched rehearsal runs end to end (run #205, green). Three unquoted step names were fixed, not one. A new `pnpm workflows:validate` gate, run in the CI `Documentation` job, parses every workflow so a syntax error now fails CI on the push that introduces it. Nothing left in scope; `main` CI stays red on the production audit until TTW-007.
