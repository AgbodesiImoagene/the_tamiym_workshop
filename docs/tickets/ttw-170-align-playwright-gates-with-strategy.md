# TTW-170 — Align the Playwright CI gates with the written strategy

**Epic:** 0 — Trustworthy delivery system\
**Status:** Partial (CI proof pending a push)\
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
- **B. Run all of `@comprehensive` on each push to `main` (chosen).** `.github/workflows/playwright-comprehensive.yml` gains a `push` trigger on `main`. This is close to the strategy's "Main regression" gate and also catches a code change that breaks an unchanged spec. It is one trigger to add, and costs one full run per push. The last ten nightly runs each took 2 to 3 minutes. Run 42190917605 on 2026-11-06 took about 3 minutes in all, with 109 tests passed, 3 skipped and 66 s in the test step. The repository is public.
- **C. Keep nightly only, and change the strategy document to say so.** No CI cost, and a failure stays invisible until the next night.

## Proposal

Add the `push` trigger on `main` to the comprehensive workflow, then make the strategy and the interim policy describe what CI really does, including the nightly matrix gate, either by running it or by marking it as not in place yet. Reword the PR gates of the strategy to match the push flow.

## Invariants

- The smoke gate stays on every push to `main` and stays required.
- The strategy, the interim policy and the workflows describe the same gates.
- No document describes a gate as running when it does not (status taxonomy in `docs/README.md`).

## Implementation plan

1. Record the design review.
2. Change the workflow.
3. Update `docs/16-playwright-regression-strategy.md` and `docs/playwright/ttw-053-interim-policy.md`.
4. Show the gate failing on a deliberately broken spec, then passing, through a manual `workflow_dispatch` run on a throwaway branch, so `main` is never broken for the proof.

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
- [x] The merge-to-`main` and nightly matrix gates are running, or the documents say they are not. → main regression runs on push once merged; the matrix is documented as not in CI.
- [x] The two documents and the workflows agree.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- Writing or changing specs.
- Running CI on pushes of ticket branches, which would give a result before the merge into `main`. It is a separate decision and needs its own ticket if wanted.
- Tightening the TTW-165 journey → TTW-169.

## Design review

Design (2026-11-07, implementing session):

- **Trigger.** `playwright-comprehensive.yml` gains `push: branches: [main]` next to `schedule` and `workflow_dispatch`. `ci.yml` is not touched, so the smoke job keeps running on every push to `main` and `develop` and on PRs. The comprehensive run is a separate workflow, so it adds a gate without slowing or replacing smoke.
- **Concurrency.** A `concurrency` block keyed on the workflow name and the ref, with `cancel-in-progress: true`. A second push to `main` cancels the run still in progress for the older commit. The newer commit contains the older one, so its run still covers it. A nightly run on `main` shares the group and can be cancelled by a push the same way; the push run tests the same or newer code. Runs on different refs (a manual dispatch on a throwaway branch) do not cancel each other.
- **Timeouts.** The job keeps a job-level timeout (90 minutes, lowered to 30 after the independent review, finding 3). The Playwright step gets its own `timeout-minutes: 20`: the last runs took 66 s in that step, and the setup, build and browser install steps stay under the job limit. This follows TTW-080 (every new step has a timeout).
- **Reports.** The existing `if: failure()` upload of `playwright-report/` and `test-results/` is unchanged.
- **Browser matrix.** Not wired in this ticket. `test:e2e:matrix` adds Firefox, WebKit, mobile and visual projects; the visual baselines and the extra browsers have never run in CI, so turning them on is its own piece of work with its own failure modes. Both documents mark the matrix as not running in CI. A follow-up ticket is proposed to the owner, not created here.
- **Documents.** `docs/16-playwright-regression-strategy.md` and `docs/playwright/ttw-053-interim-policy.md` describe the gates as they run: smoke on every push, ticket acceptance run locally before the merge with the evidence in the ticket, `@comprehensive` on every push to `main` plus nightly, matrix not in CI. The strategy's tag list gains `@comprehensive`. The interim policy stops claiming it is "aligned with" the strategy where it is not.
- **Proof.** A failing then passing CI run needs a pushed throwaway branch and `gh workflow run --ref <branch>`. The owner asked this session not to push, so that criterion stays open with the procedure written below.
- **Parallel work.** TTW-081 runs at the same time in another worktree. The two tickets share no code. Both would tick a row in `docs/tickets/ROADMAP.md` on adjacent lines, so this branch leaves `ROADMAP.md` alone; the box is ticked when the branch is merged.

Independent design review (2026-11-07, fresh-context subagent, read-only): **CHANGES REQUESTED, minor**. The design is sound. Findings and how the design takes them:

1. "Required" cannot mean "blocks the merge": the comprehensive workflow is not a status check on anything, and nothing here opens a PR. Accepted: the documents say the gate runs after the push and reports, and that a failure lands on `main` and is fixed straight away (`AGENTS.md`, step 8).
2. `cancel-in-progress` is right for `main`, with three effects to write down: a push can cancel the nightly run, a cancelled run shows as grey "cancelled" (neither pass nor fail), and after two quick pushes the first commit has no result of its own. Accepted: written in the interim policy.
3. The 20-minute step timeout is reasonable. Optional: lower the job timeout from 90 minutes, since whole runs take about 3 minutes. Accepted: the job timeout becomes 30 minutes.
4. Leaving the matrix out of CI meets the criterion only if both documents say so plainly. Accepted.
5. Two more files describe the gates wrongly: `tests/e2e/README.md:31` ("not on PR smoke") and `docs/12-testing-strategy.md:65-66` ("on PR CI", matrix "not required every PR"). Accepted: both are corrected. `docs/11-development-setup.md:92` only lists the command, and `docs/release/ttw-054-interim-policy.md:26` stays true, so neither changes.
6. No spec under `tests/e2e/journeys/` is tagged `@comprehensive`, and `test:e2e:comprehensive` does not select `chromium-journeys`. The cross-surface journeys run in smoke only. Accepted: the documents describe the push gate as the `@comprehensive` specs of the web, app, admin and accessibility projects, and say journeys are covered by smoke. The TTW-165 spec lives in `tests/e2e/web/`, so the new gate covers it.

## Implementation reviews

Review 1 (2026-11-07, fresh-context subagent, read-only, on the uncommitted diff): **PASS**, no blocking finding. It checked the workflow syntax, the timeouts against run 42354711579 (3 min 14 s in all, about 69 s in the Playwright step), that pushing a `codex/*` branch starts no workflow, and each claim in the four documents against `package.json`, `playwright.config.ts`, `ci.yml` and the spec tags.

- Fixed: a push can also cancel a manual run on `main`, not only the nightly run. The interim policy now says so.
- No change: the completion summary said "committed locally" before the commit existed. It becomes true with the commit that carries this review.
- Left as is, reported to the owner: `ttw-165-fix-image-variant-select-crash.md:104` and `ttw-163-bound-bulk-tier-quantities.md:135` say the comprehensive suite runs only nightly or on dispatch. They are the records of completed tickets and were true when written; this ticket does not rewrite them.
- Nit, no change: the design review quotes 66 s for the Playwright step (run 42190917605); the latest run took about 69 s.

## Verification evidence

Local, on branch `codex/ttw-170-align-playwright-gates` (worktree from `main` at `7077aef`), 2026-11-07, Node v24.22.1:

- `pnpm workflows:validate` → `Workflow validation passed.`
- `pnpm workflows:validate:test` → `pass 6`, `fail 0`.
- `pnpm format:check` → `All matched files use Prettier code style!`
- `pnpm docs:validate` → `Documentation validation passed.`
- `pnpm playwright:validate` → `Playwright manifest validation passed.`
- `actionlint`: not installed on this machine, so not run. The `concurrency` group uses only the standard `github.workflow` and `github.ref` contexts.

Not run: the CI proof (acceptance criterion 2). The owner asked this session not to push. Procedure, to run when a push is allowed, without breaking `main`:

1. From this branch, create a throwaway branch, for example `codex/ttw-170-gate-proof`, and in it make one `@comprehensive` assertion fail on purpose (for example change an expected heading in `tests/e2e/web/marketing-navigation.comprehensive.spec.ts`). Commit and push only that branch. It starts no `ci.yml` run, because `ci.yml` only runs on `main` and `develop`.
2. `gh workflow run playwright-comprehensive.yml --ref codex/ttw-170-gate-proof`, then `gh run watch`. Expected: the run fails at "Run Playwright comprehensive suite" and the `playwright-comprehensive-report` artefact is uploaded.
3. Revert the broken assertion, push, dispatch again. Expected: green.
4. Delete the throwaway branch (remote and local) once the owner agrees.
5. After the merge into `main`, the push itself must start a "Playwright Comprehensive" run with event `push` (`gh run list --workflow=playwright-comprehensive.yml --event push`).

## Completion summary

**Partial** (taxonomy in `docs/README.md`). Implemented on the ticket branch, committed locally, not pushed:

- `.github/workflows/playwright-comprehensive.yml`: `push` trigger on `main`, a `concurrency` group per ref with `cancel-in-progress: true`, job timeout 90 → 30 minutes, a 20-minute timeout on the Playwright step. The failure report upload is unchanged. `ci.yml` is unchanged, so smoke still runs on every push.
- `docs/16-playwright-regression-strategy.md`: the execution tiers describe the push flow, with a status per gate; the matrix and the staging gates are marked not started in CI; `@comprehensive` added to the tags.
- `docs/playwright/ttw-053-interim-policy.md`: the browser matrix table and the tiers match the workflows; the false "Aligned with" line is gone; the cancellation effects are written down.
- `docs/12-testing-strategy.md` and `tests/e2e/README.md`: their one-line descriptions of the gates now match (found by the design review).

Deviations from the plan: the job timeout was lowered and two more documents were corrected, both after the independent design review. `docs/tickets/ROADMAP.md` is left unchanged on this branch to avoid a conflict with TTW-081 (adjacent rows); tick TTW-170 there when merging.

Remaining:

- Acceptance criterion 2: the CI proof above, which needs a push.
- Wiring the browser matrix into CI is not done. It needs its own ticket (Firefox/WebKit installs, Linux visual baselines, a nightly schedule), proposed to the owner and not created here.
