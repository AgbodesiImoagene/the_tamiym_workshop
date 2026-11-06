# TTW-170 — Align the Playwright CI gates with the written strategy

**Epic:** 0 — Trustworthy delivery system\
**Status:** Not started\
**Risk:** Standard\
**Blocked by:** Decision from the project owner (see "Decision needed")\
**Blocks:** None

## Background

Found by the independent review of TTW-165, whose journey only runs at night. The cause is wider than that ticket: the documents and CI disagree.

| Gate in `docs/16-playwright-regression-strategy.md:93-95` | When it should run | What CI does                                                                                   |
| --------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| Ticket acceptance                                         | every UI PR        | Not run. `.github/workflows/ci.yml:318` only runs `pnpm test:e2e:smoke`                        |
| Main regression                                           | merge to `main`    | Not run. Only the same smoke job runs on `push`                                                |
| Browser matrix                                            | nightly            | Not run. No file in `.github/` calls `test:e2e:matrix`, and the nightly job runs comprehensive |

`docs/playwright/ttw-053-interim-policy.md:14` sets comprehensive to "Nightly / manual" and says the execution tiers are "Aligned with" the strategy, which they are not. It also lists the full matrix as a nightly job. `docs/16-playwright-regression-strategy.md:98` does not list the `@comprehensive` tag that every such spec uses.

So a bug fix can reach `main` with a regression test that has not run in CI, and a failure then only appears the next night. TTW-163 and TTW-165 are both in this position.

## Decision needed

Which PR gate does the project want, given that CI minutes and PR wait time go up with coverage?

- **A. Run the specs a PR changes (recommended).** A new CI step runs Playwright's `--only-changed=origin/main` on PRs. It is the smallest step that makes new regression tests count. It does not catch a code change that breaks an unchanged spec.
- **B. Run all of `@comprehensive` on PRs.** The strongest gate, but it adds the viewport matrix to each PR.
- **C. Keep nightly only, and change the strategy document to say so.** No CI cost, and bug fixes stay ungated until the next night.

This is a recommendation only. No option may be applied until the owner has chosen.

## Proposal

Apply the chosen option, then make the strategy and the interim policy describe what CI really does, including the merge-to-`main` and nightly matrix gates, either by running them or by marking them as not in place yet.

## Invariants

- The smoke gate stays on every PR and stays required.
- The strategy, the interim policy and the workflows describe the same gates.
- No document describes a gate as running when it does not (status taxonomy in `docs/README.md`).

## Implementation plan

1. Record the owner's decision in this ticket.
2. Record the design review.
3. Change the workflows the decision requires.
4. Update `docs/16-playwright-regression-strategy.md` and `docs/playwright/ttw-053-interim-policy.md`.
5. Show the new gate failing on a deliberately broken spec on a throwaway PR, then passing.

## Test and observability plan

- Unit/component: none.
- Integration/e2e: a real CI run of the new gate, failing then passing. Any new step needs a timeout, as in TTW-080.
- Failure, retry, and concurrency: check that a PR with no changed spec passes without running tests, if option A is chosen.
- Logs, metrics, traces, and alerts: reports stay uploaded on failure.

## References

- `docs/16-playwright-regression-strategy.md:93-98`: the gates and tags.
- `docs/playwright/ttw-053-interim-policy.md:14-15`: the interim tiers.
- `.github/workflows/ci.yml:318`: the only Playwright step on PRs.
- `.github/workflows/playwright-comprehensive.yml:4-6,88`: the nightly job.
- `package.json:52-53`: the `test:e2e:comprehensive` and `test:e2e:matrix` scripts.

## Acceptance criteria

- [ ] The owner's decision is recorded.
- [ ] The chosen gate is seen running in CI, failing on a broken spec and passing on a good one.
- [ ] The merge-to-`main` and nightly matrix gates are running, or the documents say they are not.
- [ ] The two documents and the workflows agree.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Writing or changing specs.
- Tightening the TTW-165 journey → TTW-169.

## Design review

Required before implementation, once the decision is recorded.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not started.
