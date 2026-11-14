# TTW-215 — Reduce the cost of the API e2e suite in CI

**Epic:** 8 — Client review delivery\
**Status:** Deferred — not needed for the launch; promote only on a trigger below\
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

- [ ] The trigger that promoted the ticket no longer fires on five consecutive `main` runs.
- [ ] No spec was removed, skipped or weakened.
- [ ] Required quality gates pass, with before/after durations recorded below.

## Out of scope

- Speeding up the Playwright suites.
- Changing what the tests assert.

## Design review

Pending (only when promoted).

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
