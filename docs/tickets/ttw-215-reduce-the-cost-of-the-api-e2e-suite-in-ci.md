# TTW-215 — Reduce the cost of the API e2e suite in CI

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

The `API Integration` job of `ci.yml` runs the whole API e2e suite three times: pass 1 and pass 2 (each limited to 3 minutes by `timeout-minutes: 3`), then the open-handle proof (`scripts/quality/prove-e2e-open-handles.mjs`, budget 240 s since TTW-213). The suite grows with every ticket, and the time depends on the runner GitHub provides that day.

Measured on `main` on 2026-11-14:

| Run                     | Pass 1 | Pass 2 | Proof                                          | Job total  |
| ----------------------- | ------ | ------ | ---------------------------------------------- | ---------- |
| `c047436` (fast runner) | 83 s   | 79 s   | 93 s                                           | 5 min 5 s  |
| `5d57dfa` re-run (slow) | 138 s  | 133 s  | cut at 120 s (budget then 120 s; failed twice) | —          |
| `f59b223`               | 139 s  | 133 s  | 157 s                                          | 7 min 59 s |
| `3d05c6c`               | 108 s  | 105 s  | 126 s                                          | 6 min 30 s |

On the slow runner passes 1 and 2 used about 77 % of their 3 minutes. TTW-213 raised only the proof's budget. The seed specs added by TTW-210 and TTW-212 take about 43 s of each pass (28 s and 14 s).

## Decision: not urgent

This is **not needed for the launch**. Nothing here affects the application or its quality: the worst case today is a CI failure with no real cause, which a re-run clears. Ticket work that brings the launch closer, with its quality gates kept, goes first.

## Promotion

Promoted on 2026-11-20 by the owner on trigger 4 below: waiting for CI slows development. Baseline from `main`, run 44762096522 (commit 8d0b7c8): `API Integration` took about 10 minutes and decided the length of the whole run (about 9 min 57 s), while every other job finished in under 4 minutes. Its steps: pass 1 173 s, pass 2 167 s, open-handle proof 199 s.

First change (the "split the suite across two parallel jobs" option, cut the cheapest way): the open-handle proof moves out of `API Integration` into its own job, `API Open Handles`, with its own Postgres and Redis. It starts on a freshly migrated database and does not read what passes 1 and 2 leave behind. Passes 1 and 2 stay in `API Integration`, one after the other on the same database. The invariants of this ticket hold: no spec is removed, skipped or weakened, and a hung suite or a leaked handle still fails CI.

## Triggers to promote it

Take this ticket up only if one of these happens (thresholds are a proposal to confirm with the product owner):

1. **A CI failure caused by a step timeout** (not by a failing test), on two commits within a week.
2. **The duration becomes abusive:** pass 1 or pass 2 above 150 s (83 % of their limit) on two consecutive runs, or the whole `API Integration` job above 10 minutes (its limit is 15).
3. **An abnormal spike:** a pass more than 50 % longer than the median of the previous ten runs, without a ticket that explains it.
4. **It slows development:** waiting on CI for useless latency is holding up merges, in the owner's judgement.

Without a trigger, keep delivering the tickets that get the app launched early at the quality bar of `AGENTS.md`.

## Proposal (when promoted)

Options to weigh in the design review, cheapest first:

- Run the open-handle proof on a subset of specs (a handful that boot the full app), not on all of them.
- Run pass 2 only on the specs changed since the previous run, or drop it if the proof already covers flakes.
- Make the heavy seed specs lighter (`seed-e2e-fixture-owned-rows` 28 s, `seed-e2e-reused-database` 14 s) without losing what they prove.
- Split the suite across two parallel jobs (more runner minutes, less wall time).
- Raise the step limits again only as a last resort: it moves the cliff and does not remove it.

## Invariants

- No spec is deleted, skipped or weakened to save time. Coverage stays at least what it is now.
- A hung suite or a leaked handle still fails CI.

## Implementation plan

1. When promoted, start `codex/ttw-215-reduce-the-cost-of-the-api-e2e-suite-in-ci` from current `main`.
2. Measure the last 20 `CI` runs (`gh run list`) and record the baseline here.
3. Record the design review (Low risk: implementation review).
4. Change the cheapest option that meets the trigger, prove with a CI run that every spec still runs, and record the durations before and after.

## Test and observability plan

- CI durations before and after, from `gh run view --json jobs`, recorded in the evidence section.
- `pnpm e2e-open-handles:test` still passes.
- Logs, metrics, traces, and alerts: none.

## References

- `.github/workflows/ci.yml` — `API Integration` job and its three runs of the suite.
- `scripts/quality/prove-e2e-open-handles.mjs` — the proof and its budget.
- `docs/tickets/ttw-213-give-the-open-handle-proof-room-in-ci.md` — origin; independent review finding 4.

## Acceptance criteria

- [x] The trigger that promoted the ticket no longer fires on five consecutive `main` runs (triggers 1 to 3 measured on five runs, see the table; trigger 4 is the owner's judgement).
- [x] No spec was removed, skipped or weakened.
- [x] Required quality gates pass, with before/after durations recorded below.

## Out of scope

- Speeding up the Playwright suites.
- Changing what the tests assert.

## Design review

Not required for a low-risk ticket.

## Implementation reviews

Pending.

## Verification evidence

Before (`main`, run 44762096522, commit 8d0b7c8): run 9 min 57 s; `API Integration` about 10 minutes (pass 1 173 s, pass 2 167 s, proof 199 s in series).

After (branch `claude/ttw-215-parallel-open-handle-proof`, run 44765976764, commit f120cae): **success, run 393 s (6 min 33 s)**, about 3 min 24 s (34 %) shorter than the baseline above (which turned out to be a slow-runner day: see the control below). `API Integration` 389 s (passes 1 and 2 only), `API Open Handles` 233 s in parallel, `Playwright Smoke` 154 s. The longest job is now `API Integration`; all 19 jobs succeeded. Measured on one run only: the duration varies with the runner GitHub gives that day (see Background).

Local gates: `pnpm workflows:validate`, `pnpm format:check`, `pnpm docs:validate` and `pnpm e2e-open-handles:test` (10 of 10) pass.

On `main` after the fast-forward (commit 3a0719c): run 44767730502 (`CI`) success, **379 s (6 min 19 s)**, 19 of 19 jobs successful; `API Integration` 375 s, `API Open Handles` 182 s. Run 44767730307 (`Playwright Comprehensive`) success, 249 s.

Second run on `main` (commit f87ed5c, documentation only): run 44772343448 (`CI`) success, **339 s (5 min 39 s)**, 19 of 19 jobs successful; `API Integration` 336 s, `API Open Handles` 199 s. Run 44772343628 (`Playwright Comprehensive`) success, 273 s.

Third run on `main` (commit 3e3273e, documentation only): run 44776454790 (`CI`) success, **329 s (5 min 29 s)**, 19 of 19 jobs successful; `API Integration` 325 s, `API Open Handles` 217 s. Run 44776454839 (`Playwright Comprehensive`) success, 225 s.

Fourth run on `main` (commit 618c683, merge of TTW-230, a code push): run 44778143508 (`CI`) success, **402 s (6 min 42 s)**, 19 of 19 jobs successful; `API Integration` 394 s, `API Open Handles` 251 s. Run 44778143527 (`Playwright Comprehensive`) success, 247 s.

Fifth run on `main` (commit 26a493e, documentation only): run 44781178070 (`CI`) success, **319 s (5 min 19 s)**.

**Check of the five consecutive `main` runs** (runs 44767730502, 44772343448, 44776454790, 44778143508, 44781178070, all success), against the triggers of this ticket:

| Run         | CI    | Pass 1 | Pass 2 | Proof (own job) |
| ----------- | ----- | ------ | ------ | --------------- |
| 44767730502 | 379 s | 165 s  | 159 s  | 135 s           |
| 44772343448 | 339 s | 139 s  | 131 s  | 133 s           |
| 44776454790 | 329 s | 138 s  | 132 s  | 161 s           |
| 44778143508 | 402 s | 170 s  | 164 s  | 191 s           |
| 44781178070 | 319 s | 134 s  | 133 s  | 140 s           |

1. No failure caused by a step timeout: all five runs are green.
2. Passes above 150 s on two consecutive runs: never. Runs 1 and 4 are above 150 s, runs 2, 3 and 5 are not. The whole `API Integration` job never exceeds 394 s, against the 10-minute threshold.
3. Abnormal spike: none (the longest pass, 170 s, is about 23 % above the median of the five, 138 s). There are not yet ten runs after the change to compare with, as the trigger asks.
4. "It slows development": this is the owner's judgement, not measurable here. The wait fell by about 1 to 2 minutes (see the control below), which the owner should judge sufficient or not.

The passes themselves did not get shorter: this ticket moved the proof, it did not touch passes 1 and 2.

**Control with the old structure, same afternoon (correction of the baseline):** branch `codex/ttw-093-use-real-categories-and-paginate-catalog`, run 44779149860 (`CI`, started 17:01 UTC), cut from `main` before this ticket, so it has 18 jobs and no `API Open Handles`: success, **459 s (7 min 39 s)**, `API Integration` 455 s with the three suites in series. The baseline above (597 s) was therefore a slow runner day, not the typical cost. Against this control, the four runs on `main` after the change (329 s to 402 s, median about 360 s) save roughly 60 to 130 s, about 13 to 28 %, not the 37 % first written. The saving is real but smaller, and each run varies by about 40 s on its own.

One more measure, on a ticket branch (not `main`, so it does not count for the five-run criterion below): `codex/ttw-230-upgrade-next-for-the-security-advisory`, run 44775221215 (`CI`), commit "record the independent review of TTW-230": success, **364 s (6 min 4 s)**, 19 of 19 jobs successful; `API Integration` 361 s, `API Open Handles` 252 s. The three runs after the change (379 s, 339 s, 364 s) vary by about 40 s, against 597 s before.

## Follow-up: Playwright browser install (2026-11-20)

The five-run check above left `Playwright Smoke` out, and it turned out to matter. On two runs the step `Install Playwright Chromium` (`playwright install --with-deps chromium`) took 513 s (run 44754489108) and 441 s (run 44784730403, which then lasted 574 s in all, because that job alone set the length of the run). The log of the first one shows `apt` downloading font packages (`fonts-unifont`, `fonts-ipafont`, `fonts-tlwg`) from the Ubuntu mirror of the runner. Over the last 24 `CI` runs, the step took 17 to 48 s in 22 of them and 441 s or 513 s in 2: about one run in twelve, and these were the two longest runs of the day. The libraries Chromium needs were already on the runner image ("already the newest version" in the log); only the fonts were being installed.

Change (branch `claude/ttw-215-playwright-without-system-fonts`): `ci.yml` (`Playwright Smoke`) and `playwright-comprehensive.yml` now run `playwright install chromium` without `--with-deps`. `playwright-matrix.yml` is unchanged: it keeps `--with-deps` for its visual and accessibility projects. Without the fonts, only the look of the text can change. `Playwright Smoke` takes no screenshot to compare. `Playwright Comprehensive` includes the `chromium-a11y` project (axe checks), which is the one thing to watch.

To verify before this counts as done: `Playwright Smoke` and `Playwright Comprehensive` must pass without `--with-deps` (Chromium must start, and the a11y project must give the same results as on `main`). The speed gain can only be seen when the slow mirror strikes again, so it cannot be proven by a single run. The result is recorded below once measured.

Result, on the branch (commit b37ec5e): run 44787237386 (`CI`) success, **345 s (5 min 45 s)**, 19 of 19 jobs successful; in `Playwright Smoke`, `Install Playwright Chromium` took **11 s** (17 to 48 s before when the mirror was fast), `Production build` 52 s, `Run Playwright smoke` 24 s. `Playwright Comprehensive`, started by hand on the branch (workflow_dispatch), run 44787237870: success, **211 s**, **223 passed**, `Install Playwright Chromium` 10 s; the three `chromium-a11y` tests passed without the system fonts. So Chromium starts without `--with-deps` and the accessibility results do not change.

On `main` after the merge (commit f18f091): run 44788571285 (`CI`) success, 19 of 19 jobs successful, **693 s from creation, of which 300 s were waiting for a runner**: every job started 300 s after the run was created, then the longest ran 393 s (`API Integration`). `Install Playwright Chromium` took 11 s. Run 44788571455 (`Playwright Comprehensive`) success, 213 s. The wait for a runner comes from several runs started at the same time by different sessions; it does not depend on this workflow, and compare job durations rather than the run length when it happens.

Not shown by these runs: the gain when the mirror is slow (it did not strike), which needs several runs on `main` to be seen.

## Completion summary

The open-handle proof runs in its own parallel job, `API Open Handles`. The `CI` run on `main` is shorter by roughly 1 to 2 minutes: four runs after the change took 329 s to 402 s, against 459 s for a same-afternoon control with the old structure (the 597 s first measured was a slow runner). No spec was removed, skipped or weakened, and a hung suite or a leaked handle still fails CI.

Left for later, not done here: splitting passes 1 and 2 of `API Integration` across two jobs (about 2 more minutes, more work, and the passes share a database), and running pass 2 only on `main` (not decided: its purpose has not been confirmed). The acceptance criterion about five consecutive `main` runs is measured above (triggers 1 to 3); trigger 4 stays the owner's judgement.
