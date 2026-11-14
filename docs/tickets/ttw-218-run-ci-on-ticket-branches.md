# TTW-218 — Run CI on ticket branches before they merge into main

**Epic:** 8 — Client review delivery\
**Status:** In progress\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

`ci.yml` starts only on a `push` to `main` or `develop`, or on a `pull_request` to those branches (`.github/workflows/ci.yml`, `on:` block). The project does not open pull requests (`AGENTS.md`, ticket workflow step 8), so a ticket branch never gets a CI run before it is merged locally into `main`. The first CI result arrives after `main` has already moved, and `AGENTS.md` said so: "a CI failure lands on `main`".

`pnpm verify` is not a substitute. It does not run the API e2e suite (`API Integration`) or `Playwright Smoke`, which the CI runs.

Checked before the change:

- `ci.yml` uses no `secrets.*`, so its jobs behave the same on a branch.
- `coverage:diff` computes its base with `git merge-base origin/main HEAD` (`scripts/quality/check-diff-coverage.mjs:61`) and the `coverage` job checks out with `fetch-depth: 0`, so the diff gate works on a branch push.
- `COVERAGE_DIFF_BASE` falls back to `origin/main` when `github.base_ref` is empty (`ci.yml`, coverage job).
- The repository is public: standard runner minutes are free, so one more run per push has no billing cost.

## Proposal

1. In `ci.yml`, add `'codex/ttw-**'` and `'claude/ttw-**'` to `on.push.branches`. Both prefixes are in use (`claude/ttw-216-…` exist next to `codex/ttw-216-…`). The `pull_request` trigger is unchanged.
2. Add a `concurrency` group per ref. A new push to a ticket branch cancels that branch's previous run. A run that is executing on `main` or `develop` is never cancelled (GitHub keeps one queued run per group, so a run still waiting in the queue can be replaced by a newer one).
3. In `AGENTS.md` step 8, replace the sentence that said a branch push does not start the CI with the new flow: push the branch (when the user asks), read the CI with `gh`, merge into `main` only when it is green (and the user asks). The run on `main` stays the final proof.

Rejected: opening pull requests (project rule); branch protection (not asked, outside this ticket); reducing the CI cost (TTW-215, deferred).

## Invariants

- No pull request is needed to get a CI run.
- A run that is executing on `main` or `develop` is never cancelled by `concurrency`.
- No git action (push, merge, delete) happens without the user's request.

## Implementation plan

1. Edit `ci.yml` (triggers and `concurrency`).
2. Edit `AGENTS.md` step 8. A search found no other file that repeats the old rule (worktree copies under `.claude/worktrees/` are copies of `AGENTS.md`, not separate docs).
3. Add the ticket to `ROADMAP.md`.
4. Prove it on GitHub: push this branch (user request), read the run, push a second commit while a run is in progress, and check that run is cancelled (see "Verification evidence").

## Test and observability plan

- Unit/component: none (workflow configuration only).
- Integration/e2e: the GitHub run of this very branch is the proof.
- Failure, retry, and concurrency: second quick push cancels the first run; a run on `main` is not cancelled.
- Logs, metrics, traces, and alerts: none.

## References

- `.github/workflows/ci.yml:3-7` — old triggers.
- `AGENTS.md:67` — old rule.
- `scripts/quality/check-diff-coverage.mjs:61` — merge-base logic.

## Acceptance criteria

- [x] A push to a `codex/ttw-**` or `claude/ttw-**` branch starts `ci.yml` without a pull request.
- [x] A second push to the same branch cancels the first run.
- [ ] A run that is executing on `main` is never cancelled (to observe after the merge).
- [x] `AGENTS.md` describes the new flow and no document keeps the old sentence.
- [x] `pnpm format:check` and `pnpm docs:validate` pass, with evidence recorded below.

## Out of scope

- Reducing the CI duration or cost → TTW-215 (deferred).
- Branch protection rules on `main`.

## Design review

Not required for a low-risk ticket.

## Implementation reviews

### Review 1 — 2026-11-14, independent reviewer (fresh session, read-only, no access to the author's reasoning)

Charter: workflow correctness, behaviour of each job on a branch push, doc consistency, honesty of the evidence, scope. The reviewer re-read the diff and checked the runs with `gh`.

Findings, none blocking:

1. (minor) The wording "never cancelled" was too strong: GitHub keeps one queued run per group, so a run still waiting in the queue on `main` can be replaced by a newer one. A run that is executing is not cancelled. **Fixed:** wording in `ci.yml`, in the Proposal, the Invariants and the acceptance criterion now says "a run that is executing".
2. (minor, not caused by this ticket) `playwright-comprehensive.yml` has its own `concurrency` group with `cancel-in-progress: true`, also on `main`. It only runs on `main` and is not touched. **No change:** the invariant of this ticket concerns `ci.yml` only.
3. (minor) The ticket must record this review before it is closed. **Done** in this section.
4. (cosmetic) The ROADMAP row sits between TTW-214 and TTW-189, not in numeric order. **No change:** the table is ordered by lot, and 1B groups the CI tickets.

Verified by the reviewer: glob `'codex/ttw-**'` matches `codex/ttw-218-…`; the `cancel-in-progress` expression is valid and false on `main` and `develop`; `pull_request` events use a separate group; no `workflow_run` or `workflow_call` links the other workflows to `ci.yml`; `ci.yml` has no `secrets.*`, no deploy or publish step, and artifacts stay in the run; the evidence in this ticket matches `gh run view` for runs `43646086688`, `43646949476` and `43647395370`.

**Verdict: PASS.**

## Verification evidence

Done on 2026-11-14, on branch `codex/ttw-218-run-ci-on-ticket-branches`:

- `pnpm exec prettier --write` on the four changed files: all "unchanged".
- `pnpm format:check`: "All matched files use Prettier code style!".
- `pnpm docs:validate`: "Documentation validation passed."
- `ci.yml` parsed as YAML (Python `yaml`): `on.push.branches` is `[main, develop, codex/ttw-**, claude/ttw-**]`, `concurrency` is present, 15 jobs kept. `actionlint` is not installed here, so the workflow expressions were not linted.
- `grep` in `ci.yml` found no `secrets.*`; no other file outside the ticket history repeats the old rule.

GitHub proof, 2026-11-14, after the user asked for the commit and push:

- Commit `8c3acab` pushed to `origin/codex/ttw-218-run-ci-on-ticket-branches`.
- `gh run list --branch codex/ttw-218-run-ci-on-ticket-branches`: run `43646086688`, event `push` (no pull request), workflow `CI`, started 22:03:57 UTC.
- `gh run view 43646086688`: status `completed`, conclusion `success`, finished 22:12:36 UTC (about 8 min 39 s). All 18 jobs succeeded, including `API Integration`, `Playwright Smoke`, `Coverage` (so `coverage:diff` works on a branch) and `Migration Baseline`.

Cancellation proof, same day, after the user asked for it:

- Run `43646949476` (commit `3e8e953`) was `in_progress`. Commit `efb4d47` was then pushed to the same branch.
- `gh run view 43646949476`: status `completed`, conclusion `cancelled`, updated 22:18:50 UTC. The new run `43647395370` (commit `efb4d47`, created 22:18:32 UTC) took its place. The `concurrency` group works on a ticket branch.

Still not verified:

- A run that is executing on `main` is never cancelled. This can only be seen after a real merge into `main`.

## Completion summary

Not complete. The CI now starts on ticket branches and passed on this one. Still to do: observe a run on `main` after the merge, and obtain the independent implementation review. Status stays "In progress".
