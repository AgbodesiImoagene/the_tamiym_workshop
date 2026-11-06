# TTW-164 — Stop the format check failing on generated files

**Epic:** 0 — Trustworthy delivery system\
**Status:** In review\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

`pnpm verify` (`package.json:58`) stops at its second step, `pnpm format:check` (`package.json:57`), on any machine that has generated the project's files. Every later step never runs. That is why each step of TTW-005 had to be run by hand: its new `migrations:check` step sits behind this one.

Prettier reads `.prettierignore` and the root `.gitignore`. It does not read nested `.gitignore` files, so these git-ignored outputs are checked:

- `apps/api/src/generated/**`: 84 files after `pnpm db:generate`, ignored only by `apps/api/.gitignore:30`.
- `apps/{web,app,admin}/next-env.d.ts`: 3 files after `pnpm build`, ignored only by each app's own `.gitignore` (for example `apps/web/.gitignore:41`).

Reproduced on 2026-11-06 in a clean worktree of `main` (165fd4f), after `pnpm install`, `pnpm db:generate` and `pnpm build`: `pnpm format:check` exits 1 with `Code style issues found in 87 files`, split as 84 and 3.

CI does not see this because its Format job only installs dependencies before checking (`.github/workflows/ci.yml:49-61`), so neither output exists there.

The main checkout has a third source, found while reproducing: `.claude/` is local and untracked (agent worktrees, session journals), and is not ignored either. There, the same command takes about 5 minutes and reports 267 files, 180 of them under `.claude/`, because it walks every copy of the repository in `.claude/worktrees/`.

## Proposal

Add three entries to `.prettierignore`: `apps/api/src/generated/`, `apps/*/next-env.d.ts` and `.claude/`.

Rejected:

- Reformatting the generated files: the next generation undoes it, and they are never hand-edited.
- Passing every nested `.gitignore` to Prettier with `--ignore-path`: more general, but it changes how the check is invoked in `package.json` for a problem that three explicit entries solve.

## Invariants

- Every tracked file is still checked. The new entries match no file tracked by git.
- No generated file is reformatted or edited.
- The CI Format job's behaviour does not change: none of these paths exists there.

## Implementation plan

1. Reproduce the failure in a clean worktree. Done above.
2. Add the three entries to `.prettierignore`.
3. Run `pnpm format:check` and `pnpm verify` in full, after `pnpm db:generate` and `pnpm build`.

Deviation from the request: `.claude/` was not in the request, which named the generated paths only. It is added because `pnpm verify` would otherwise still fail in the main checkout.

## Test and observability plan

- Unit/component: none. The check itself is the test: it fails before the change and passes after.
- Integration/e2e: not applicable, no runtime code changes.
- Failure, retry, and concurrency: confirm that a badly formatted tracked file still fails the check.
- Logs, metrics, traces, and alerts: not applicable.

## References

- `.prettierignore` — the ignore list.
- `package.json:57-58` — `format:check` and `verify`.
- `apps/api/.gitignore:30` — ignores `src/generated/`.
- `apps/web/.gitignore:41` — ignores `next-env.d.ts`.
- `.github/workflows/ci.yml:49-61` — the Format job generates nothing.

## Acceptance criteria

- [x] `pnpm format:check` passes after `pnpm db:generate` and `pnpm build`.
- [x] `pnpm verify` passes in full, including every step after `format:check`.
- [x] The check still fails on a badly formatted file.
- [x] No generated file is reformatted.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- Reading nested `.gitignore` files automatically.
- `migrations:check` in `pnpm verify` and its Postgres dependency → TTW-005.

## Design review

Not required: Low risk.

## Implementation reviews

- 2026-11-06, `/code-review low` on the uncommitted `.prettierignore` diff, run in the implementing session: no findings. This was not an independent review; one is still required before merge.
- 2026-11-06, independent review, read-only, in a separate session: FAIL. `pnpm docs:validate` rejected the state "In review" at `docs/tickets/README.md:38`, because only Complete, Scoped, Deferred and In progress are allowed. The `.prettierignore` change itself passed: no tracked file excluded, no CI coverage lost, and a badly formatted file still detected whether tracked or not. Fix: the README row now says "In progress". A re-review of the fix is pending.

## Verification evidence

All on 2026-11-06. Unless stated otherwise, run in the worktree of this branch, based on 165fd4f (`origin/main` at the same commit), with Node 24.22.1.

Before the change, after `pnpm db:generate` and `pnpm build`:

- `pnpm format:check`: exit 1, `Code style issues found in 87 files` (84 under `apps/api/src/generated/`, 3 `next-env.d.ts`).
- `pnpm format:check` in the main checkout: exit 2 reported by the shell wrapper, 267 files, about 5 minutes.

After the change:

- `pnpm format:check`: exit 0, `All matched files use Prettier code style!`, with the 7 entries of `apps/api/src/generated/prisma` and the 3 `next-env.d.ts` present.
- `pnpm verify`: exit 0, every step run:
  - lint: 6/6 tasks.
  - format:check: passed.
  - typecheck: 6/6 tasks.
  - test: web 40, app 42, api 1207 tests passed.
  - `api test:coverage`: 143 suites, 1207 tests passed.
  - `coverage:ratchet`: passed (statements 81.89 %, branches 65.37 %, functions 71.21 %, lines 82.12 %).
  - `coverage:diff`: skipped by the script, no changed executable files under `apps/api/src`.
  - `audit:prod`: passed at `--audit-level=high` (24 found: 3 low, 21 moderate).
  - build: 5/5 tasks, served from the Turbo cache because `pnpm build` had just run.
- `pnpm format:check` again after `pnpm verify`, with `apps/api/coverage`, `apps/api/dist` and `apps/web/.next` present: exit 0.
- Negative test: a temporary badly formatted `apps/api/src/ttw164-bad-format.ts` made `pnpm format:check` exit 1 and was named in the output. File removed. This file was untracked; the independent review confirmed the same result on a tracked file.
- `git ls-files -ci --exclude-from=.prettierignore`: 0 tracked files matched outside the two existing entries.
- No file under `apps/api/src/generated/`, and no `next-env.d.ts`, is newer than this ticket file.
- `pnpm docs:validate`, added after the review because `pnpm verify` does not run it: exit 0, `Documentation validation passed.` `pnpm docs:validate:test`: 11 passed, 0 failed.
- Main checkout, Prettier run with a temporary root copy of the new ignore file: exit 0, `.claude/` included. `pnpm verify` itself was not run there, since the fix is not on `main` yet.

## Completion summary

`pnpm format:check` no longer checks generated output or local agent state, so `pnpm verify` runs to the end. Deviation: `.claude/` was added beyond the request (see the implementation plan). Local commit only: not pushed, no PR.
