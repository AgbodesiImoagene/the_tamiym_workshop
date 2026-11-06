# TTW-170 — Align the Playwright CI gates with the written strategy

**Epic:** 0 — Trustworthy delivery system\
**Status:** Not started\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

Found by the independent review of TTW-165, whose journey only runs at night. The cause is wider than that ticket: the documents and CI disagree.

| Gate in `docs/16-playwright-regression-strategy.md:93-95` | When it should run | What CI does                                                                                     |
| --------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| Ticket acceptance                                         | every UI PR        | Not applicable as written: this project opens no PRs. The owner merges locally and pushes `main` |
| Main regression                                           | merge to `main`    | Not run. `.github/workflows/ci.yml:318` only runs `pnpm test:e2e:smoke` on push                  |
| Browser matrix                                            | nightly            | Not run. No file in `.github/` calls `test:e2e:matrix`, and the nightly job runs comprehensive   |

`docs/playwright/ttw-053-interim-policy.md:14` sets comprehensive to "Nightly / manual" and says the execution tiers are "Aligned with" the strategy, which they are not. It also lists the full matrix as a nightly job. `docs/16-playwright-regression-strategy.md:98` does not list the `@comprehensive` tag that every such spec uses.

The real delivery flow is merge locally, then push `main`. `ci.yml` runs on pushes to `main` and `develop` and on PRs, so pushing a ticket branch alone starts no CI run (TTW-080 recorded this). A push to `main` runs smoke only, so a regression test tagged `@comprehensive` first runs in CI the next night. TTW-163 and TTW-165 are both in this position.

## Decision

**Option B chosen by the project owner on 2026-11-06.** The question was what should run on each push to `main`. Nobody waits on a PR here, so the cost is CI minutes rather than waiting time.

- **A. Run the specs the push changes.** A new CI step runs Playwright's `--only-changed` against the commit before the push. It uses the fewest minutes. It does not catch a code change that breaks an unchanged spec, and it needs care with multi-commit pushes.
- **B. Run all of `@comprehensive` on each push to `main` (chosen).** `.github/workflows/playwright-comprehensive.yml` gains a `push` trigger on `main`. This is close to the strategy's "Main regression" gate and also catches a code change that breaks an unchanged spec. It is one trigger to add, and costs one full run per push. Its duration still has to be read from a recent nightly run.
- **C. Keep nightly only, and change the strategy document to say so.** No CI cost, and a failure stays invisible until the next night.

## Proposal

Add the `push` trigger on `main` to the comprehensive workflow, then make the strategy and the interim policy describe what CI really does, including the nightly matrix gate, either by running it or by marking it as not in place yet. Reword the PR gates of the strategy to match the push flow.

## Invariants

- The smoke gate stays on every push to `main` and stays required.
- The strategy, the interim policy and the workflows describe the same gates.
- No document describes a gate as running when it does not (status taxonomy in `docs/README.md`).

## Implementation plan

1. Read the duration of a recent nightly run and record it here.
2. Record the design review.
3. Change the workflow.
4. Update `docs/16-playwright-regression-strategy.md` and `docs/playwright/ttw-053-interim-policy.md`.
5. Show the gate failing on a deliberately broken spec, then passing, through a manual `workflow_dispatch` run on a throwaway branch, so `main` is never broken for the proof.

## Test and observability plan

- Unit/component: none.
- Integration/e2e: a real CI run of the new gate, failing then passing. Any new step needs a timeout, as in TTW-080.
- Failure, retry, and concurrency: a second push while a run is in progress must not leave two runs competing.
- Logs, metrics, traces, and alerts: reports stay uploaded on failure.

## References

- `docs/16-playwright-regression-strategy.md:93-98`: the gates and tags.
- `docs/playwright/ttw-053-interim-policy.md:14-15`: the interim tiers.
- `.github/workflows/ci.yml:3-7`: the CI triggers.
- `.github/workflows/ci.yml:318`: the only Playwright step on push.
- `.github/workflows/playwright-comprehensive.yml:4-6,88`: the nightly job.
- `package.json:52-53`: the `test:e2e:comprehensive` and `test:e2e:matrix` scripts.

## Acceptance criteria

- [x] The owner's decision is recorded.
- [ ] The chosen gate is seen running in CI, failing on a broken spec and passing on a good one.
- [ ] The merge-to-`main` and nightly matrix gates are running, or the documents say they are not.
- [ ] The two documents and the workflows agree.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Writing or changing specs.
- Running CI on pushes of ticket branches, which would give a result before the merge into `main`. It is a separate decision and needs its own ticket if wanted.
- Tightening the TTW-165 journey → TTW-169.

## Design review

Required before implementation.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not started.
