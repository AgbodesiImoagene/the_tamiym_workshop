# TTW-213 — Give the CI open-handle proof room to finish

**Epic:** 8 — Client review delivery\
**Status:** In progress\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

The `API Integration` job of `ci.yml` runs the API e2e suite three times: pass 1 and pass 2 (3 minutes each, `timeout-minutes: 3`), then "Prove no open handles" (`scripts/quality/prove-e2e-open-handles.mjs`), which runs the whole suite once more with `--detectOpenHandles` and kills it after `E2E_OPEN_HANDLE_TIMEOUT_MS` (default 120000 ms).

On 2026-11-14 that last step failed on `5d57dfa`, a commit that only changed documentation: `Open-handle proof timed out after 120000ms (likely leaked handles)`. Every spec printed before the kill had passed. On the previous commit `c047436` the same step passed in 93 s (`16:23:39Z` to `16:25:12Z`), about 78 % of the budget. The suite grew when TTW-210 and TTW-212 added two seed specs (`seed-e2e-fixture-owned-rows` 28.7 s, `seed-e2e-reused-database` 14.5 s in the failing log). A slower runner is enough to cross 120 s, and the failure message blames leaked handles even though none were reported.

## Proposal

- Set `E2E_OPEN_HANDLE_TIMEOUT_MS: 240000` on the "Prove no open handles" step in `.github/workflows/ci.yml`. The default of the script stays 120000 (the script's own tests depend on explicit values).
- Keep the job `timeout-minutes: 15` and check the three runs plus setup still fit with the new budget.
- The proof still fails on a hung suite: only the allowed time changes. Open handles reported by Jest still fail the step.

Rejected: lightening the two seed specs. They prove real behaviour and TTW-212 was just reviewed; a later ticket can shrink them if the suite keeps growing.

## Invariants

- A suite that hangs or leaks handles still fails the step.
- `pnpm e2e-open-handles:test` still passes.

## Implementation plan

1. Branch `codex/ttw-213-give-the-open-handle-proof-room-in-ci` from `main` (done).
2. Edit `ci.yml`; run `pnpm e2e-open-handles:test` and `pnpm docs:validate`.
3. After the merge to `main` and the push, read the duration of the step in the CI run and record it below.

## Test and observability plan

- `pnpm e2e-open-handles:test` (node --test) passes.
- The CI run after the push shows the step green with its duration, recorded in the evidence section.
- No logs, metrics or alerts change.

## References

- `.github/workflows/ci.yml` — "Prove no open handles" step.
- `scripts/quality/prove-e2e-open-handles.mjs` — the budget (`E2E_OPEN_HANDLE_TIMEOUT_MS`).
- `docs/tickets/ttw-210-clear-inventory-movements-in-the-e2e-seed.md`, `docs/tickets/ttw-212-clear-rows-tied-to-e2e-users-in-the-seed.md` — the specs that grew the suite.

## Acceptance criteria

- [ ] The step has a 240000 ms budget and the job still fits its 15-minute limit.
- [ ] `pnpm e2e-open-handles:test` passes.
- [ ] The next CI run on `main` shows the step green, with its duration recorded.

## Out of scope

- Making the e2e suite faster.
- Changing the default of the proof script.

## Design review

Low risk, CI configuration only. Blast radius: the one CI step. Edge: a genuinely hanging suite now needs up to 240 s to be reported instead of 120 s; accepted because the same budget logic is used for the two normal passes (180 s each).

## Implementation reviews

Pending.

## Verification evidence

- Timings of the last green `CI` run (`c047436`, job `API Integration`): job 16:20:10Z to 16:25:15Z (5 min 5 s of 15 min); pass 1 83 s and pass 2 79 s (each of 180 s); proof 93 s (of 120 s). The failing run was cut at exactly 120 s with every printed spec green.
- With a 240 s budget the worst case for the job is about 5 min 5 s + 147 s, close to 7.5 min, inside the 15-minute limit.
- `pnpm e2e-open-handles:test` → `tests 10, pass 10, fail 0` (includes "open handles reported by Jest fail the proof" and the timeout kill tests, which set their own timeouts and do not depend on the default).
- The first re-run of the failed job failed the same way, at exactly 120 s (`16:47:02Z` to `16:49:02Z`), so it was not a one-off. In that run pass 1 took 2 min 18 s and pass 2 2 min 13 s (83 s and 79 s on the green run), Jest reported `Time: 134.965 s` for 43 suites, and only 24 of the 43 specs had finished when the proof was cut. The runner was about 1.6 times slower; the proof (about 1.1 times a normal pass because of `--detectOpenHandles`) would need about 150 s, which fits in 240 s and not in 120 s.
- Remaining risk, not changed here: passes 1 and 2 have a 3-minute budget each and took 138 s and 133 s on the slow runner (about 75 %). A runner twice as slow would fail them.
- `pnpm docs:validate` and `prettier --check` on the changed files: pass.
- To record after the push: the duration of the step in the first green `CI` run on `main`.

## Completion summary

Pending implementation.
