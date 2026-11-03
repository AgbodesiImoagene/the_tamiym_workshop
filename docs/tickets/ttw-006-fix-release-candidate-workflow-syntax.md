# TTW-006 — Fix the invalid YAML in the release-candidate workflow

**Epic:** 0 — Trustworthy delivery system\
**Status:** Not started (to be scheduled later, user decision 2026-11-03)\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** Release-candidate rehearsal (TTW-054, TTW-068)

## Background

On every push to `main`, GitHub rejects `.github/workflows/release-candidate.yml` before running it: "Invalid workflow file … You have an error in your yaml syntax on line 71" (run #202 for commit `c9f4bb6`, 2026-11-03). Line 71 is a step name containing an unquoted `: `:

```yaml
- name: Build ${{ matrix.name }} image (push: false)
```

YAML reads `(push: false)` as a nested mapping. The line came with commit `8ec8609` (TTW-054 slice 2), so the release-candidate workflow has not run since, and the container build rehearsal it provides is silently skipped.

## Proposal

Quote the step name (`name: "Build ${{ matrix.name }} image (push: false)"`) and check the whole file for the same pattern. Validate the file locally (for example with `actionlint` or a YAML parser) before pushing. Optionally add a workflow-syntax check to the quality gates so an invalid workflow fails CI on the pull request or push that introduces it.

## Invariants

- The workflow's jobs, triggers and images are unchanged; only the syntax is fixed.

## Implementation plan

1. Quote the offending names; scan the other workflows for unquoted `: ` in scalars.
2. Validate locally, push, confirm the workflow runs on GitHub.
3. Optional: workflow lint step in CI.

## Test and observability plan

- Unit/component: none.
- Integration/e2e: the release-candidate workflow runs on GitHub after the fix (record the run link).
- Failure, retry, and concurrency: not applicable.
- Logs, metrics, traces, and alerts: none.

## References

- `.github/workflows/release-candidate.yml:71` — unquoted `(push: false)`.
- Commit `8ec8609` — introduced the line.
- GitHub Actions run #202 of `release-candidate.yml` (commit `c9f4bb6`) — "Invalid workflow file".

## Acceptance criteria

- [ ] GitHub accepts the workflow file and the release-candidate run starts on push.
- [ ] No other workflow file has the same syntax problem.

## Out of scope

- Changes to what the release-candidate workflow builds or deploys.

## Design review

Not required (low risk).

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
