# TTW-228 — Make the state-mismatch e2e test independent of the database content

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

`apps/api/test/address-state-mismatch.e2e-spec.ts` (TTW-216) needs a second state next to Lagos. It does not create one: it takes "the first active state other than Lagos" from the shared test database (`findFirstOrThrow({ where: { isActive: true, NOT: { code: 'LA' } }, orderBy: { code: 'asc' } })`). The result depends on what the database holds, so the test passes or fails for reasons unrelated to the code under test. Seen twice (2026-11-19, TTW-226 and TTW-227 sessions):

- On a database with only Lagos (migrations applied, no seed), it finds no state: `findFirstOrThrow` throws.
- On a database with the full Nigerian seed (37 states), it picks Abia, which has LGAs. Since TTW-221 an address in a state that has LGAs must name one, and the test sends the LGA text `Ikeja`, so its own `POST` is refused with 400 and the test fails at the "state code alone" step.
- In CI it passes only because other test files happen to leave a suitable state without LGAs behind. That is luck, and it depends on file order.

The behaviour under test (TTW-216) is correct. Only the test's setup is fragile. Confirm with the failing runs above before changing it.

## Proposal

- Create and own a second state in the test, as the file already does for its deactivated-state case (`ZM`): a dedicated state code that no other e2e file uses, active, with no LGAs, removed in `afterAll`. Replace the `other` lookup by this state. Every assertion stays exactly as it is: only where `other` comes from changes.
- Do not add the seed to the e2e setup and do not change production code.
- Rejected: seeding the test database before the run (hides the order dependency, slows CI); making the test pick "a state without LGAs" from the database (still depends on the content).

## Invariants

- No assertion is removed, weakened or skipped. The same checks run against a state the test controls.
- The test passes on a database with only Lagos, on a database with the full Nigerian seed, and in CI.
- The test removes the rows it created, so it disturbs no other file (the reference rows such as Lagos are left as they are).

## Implementation plan

1. Own worktree and own test database (once with the full seed to reproduce, once without).
2. Reproduce the failure on the seeded database and on the empty one (red).
3. Replace the lookup by an owned state; run on both databases and in CI.
4. Record the evidence; one independent review is not required for a test-only Low ticket, a self-check of the diff is recorded instead.

## Test and observability plan

- Integration/e2e: `address-state-mismatch.e2e-spec.ts` on a seeded database and on a database with only Lagos; the other `test/address-*` suites to prove no other file is disturbed.
- Logs, metrics, traces, and alerts: nothing new.

## References

- `apps/api/test/address-state-mismatch.e2e-spec.ts` — the lookup of `other`.
- `docs/tickets/ttw-216-keep-one-state-per-address-the-code-decides-the-text.md` — the behaviour under test.
- `docs/tickets/ttw-221-close-the-lga-gaps-in-the-delivery-refusal.md` — the LGA-required rule that exposed the problem.

## Acceptance criteria

- [ ] The test no longer reads a state it did not create (besides Lagos, which it already upserts).
- [ ] It passes on a database with only Lagos and on a database with the full seed, and in CI.
- [ ] No assertion was removed or weakened (diff reviewed).
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Other e2e files that might read the database content the same way (to be listed if found, not fixed here).

## Design review

Low risk, test-only: no design review is required by `AGENTS.md`. The choice is recorded in "Proposal" (own the second state; do not seed; do not pick "a state without LGAs" from the database). One extra point found while reproducing: `ensureLga` needs Lagos to exist, and the test only created Lagos later, inside the test body, so on a database with only the migrations the `beforeAll` failed on a foreign key. The test now creates Lagos in `beforeAll` before calling `ensureLga`.

## Implementation reviews

No independent review (test-only, Low). Self-check of the full diff (`git diff apps/api/test`, 15 insertions, 5 deletions): no assertion was changed, removed or skipped. The only changes are the constants `OTHER_CODE = 'ZN'` / `OTHER_NAME`, the upsert of that state in place of the database lookup, the upsert of Lagos in `beforeAll`, and the clean-up of both owned states in `afterAll`. `ZN` is used by no other file (`grep` over `apps/api/test` and `apps/api/src`).

## Verification evidence

Local worktree with two own databases, both migrated: `tamiym_workshop_test_ttw228_full` (full Nigerian seed, 37 states) and `tamiym_workshop_test_ttw228_empty` (migrations only), Redis DB 8.

- Red first, before the change: `address-state-mismatch.e2e-spec.ts` fails on both databases (full: `expected 201 "Created", got 400 "Bad Request"` at the state-code-only step, because the picked state has LGAs; empty: no state to pick, `findFirstOrThrow` throws).
- After the change: the file passes on the empty database, on the full database, and again on the empty one (3 runs, 3 passes).
- All 13 `test/address-*` e2e suites pass on both databases: 13 suites, 66 tests, each. This is the first time the whole group passes on a database with only the migrations.
- Clean-up: after the runs, no `ZM` or `ZN` state is left in either database.
- `tsc --noEmit` (apps/api): exit 0. `eslint --max-warnings=0` on the file: exit 0. `pnpm format:check`: all files formatted. `pnpm docs:validate`: passed.
- Not verified: CI on the pushed branch.

## Completion summary

`address-state-mismatch.e2e-spec.ts` no longer reads a state it did not create: it creates its own second state (`ZN`, active, no LGAs) and Lagos, and removes both. It now passes on a database with only the migrations and on one with the full seed, instead of depending on what other files leave behind. No production code and no assertion changed.
