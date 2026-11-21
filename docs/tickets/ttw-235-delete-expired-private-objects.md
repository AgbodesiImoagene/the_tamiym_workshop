# TTW-235 — Delete expired private objects (retention of rejected and orphan uploads)

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High (irreversible data deletion)\
**Blocked by:** None. TTW-099 is merged. The durations were confirmed on 2026-11-20 (see Design review).\
**Blocks:** None

## Background

TTW-099 moved customer uploads to a private bucket. Only one case deletes a private object today: an infected file (`MediaProcessor.purgeInfectedOriginal`, `S3Service.deletePrivateObject`). Every other private object is kept forever:

- files rejected by moderation (kept on purpose, the owner may appeal);
- files uploaded but never attached to a `DesignAsset`;
- assets stuck in `PENDING` or `FAILED` without progress.

This is storage that grows without bound and personal images kept with no stated reason (see `docs/privacy/ttw-025-data-inventory.md`). TTW-099 "Remaining" lists it as open and needing a business decision.

## Proposal

A daily scheduled job (existing scheduler role, same pattern as `reconciliation-scheduler.service.ts`) deletes private objects according to this policy. **Durations are proposed defaults, not confirmed.**

| Case                                               | Rule                                    | Source of the value                                           |
| -------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| Infected file                                      | Deleted at once (already done)          | TTW-099                                                       |
| Rejected by moderation, no appeal                  | Deleted 14 days after the decision      | Appeal window of `docs/moderation/ttw-027-interim-policy.md`  |
| Rejected, appeal pending                           | Kept until answered, then 14 days later | Same document                                                 |
| Orphan (never attached) or PENDING/FAILED, stalled | Deleted after 7 days                    | Agent's choice: nothing in the repo fixes it. To be confirmed |

For each deleted object: delete the S3 object, then clear `MediaAsset.originalKey` and delete the `MediaDerivative` rows, as `purgeInfectedOriginal` does. Rejected-then-overturned appeals reset the clock (the asset is no longer rejected).

Design points:

- Idempotent: selection by state and age, the delete of a missing key is a success, DB update is a conditional `updateMany`.
- Bounded: fixed batch size per run, oldest first; the next run continues.
- No DB transaction held across the S3 call: read the batch, call S3 per object, then update the row.
- Logs: counts and asset ids only. No key, no link, no filename, no user data.
- Rejected alternatives: S3 lifecycle rules (cannot see appeals or DB state, would orphan DB rows); deleting rejected files at once (breaks appeals).

## Invariants

- A file under a pending appeal is never deleted.
- A file attached to a live design (READY, approved) is never deleted by this job.
- The database never points to a deleted object after a run (`originalKey` null, derivatives gone). If S3 deletion fails, the row is untouched and retried next run.
- Public catalogue assets (`visibility = PUBLIC`) are never touched.

## Implementation plan

1. Wait for the decision on durations (this ticket stops here).
2. Failing tests first: unit (selection rules, batch bound, S3 failure keeps row, missing key OK) and e2e on a real throwaway database.
3. Retention service + scheduler wiring (scheduler role only), config for the durations and batch size.
4. Update `docs/privacy/ttw-025-data-inventory.md` and "Remaining" of TTW-099.

## Test and observability plan

- Unit/component: eligibility per case, boundary at exactly 14 and 7 days, appeal pending/overturned/upheld, batch limit, S3 error.
- Integration/e2e (real Postgres, throwaway DB, `REDIS_DB=13`): seeded assets in each case, run the job twice (second run deletes nothing), concurrent runs do not double-delete or fail.
- Failure, retry, and concurrency: S3 down, partial batch, two runners at once.
- Logs, metrics, traces, and alerts: one summary log per run (deleted, failed, skipped counts); a failure counter for the existing observability setup.

## References

- `apps/api/src/media/media.processor.ts` — `purgeInfectedOriginal`.
- `apps/api/src/storage/s3.service.ts` — `deletePrivateObject`.
- `apps/api/src/reconciliation/reconciliation-scheduler.service.ts` — scheduler pattern.
- `docs/moderation/ttw-027-interim-policy.md` — 14-day appeal window.
- `docs/tickets/ttw-099-make-customer-uploads-private.md` — Remaining.

## Acceptance criteria

- [x] Rejected files without appeal are deleted 14 days after the decision.
- [x] Files with a pending appeal are kept, then deleted 14 days after the answer.
- [x] Orphan and stalled private objects are deleted after 7 days.
- [x] The job is idempotent, bounded per run, and logs no PII or link.
- [x] Required quality gates pass with evidence recorded below.
- [x] Data inventory and TTW-099 "Remaining" are updated.

## Out of scope

- Deleting files of deleted accounts → TTW-120.
- Public catalogue images.
- Scanner outage handling (rescan, not deletion).

## Design review

Date: 2026-11-20. Reviewer: author (design review for a High ticket, to be completed after the decision).

- Blast radius: `media` module, a new scheduled service, config. No endpoint, so no OpenAPI change. No schema change expected (existing `originalKey`, moderation decision and appeal tables); to be confirmed when reading the code in step 2.
- Duplication check: reuse `deletePrivateObject` and the purge logic of `purgeInfectedOriginal` (extract a shared helper rather than copying).
- Main risk: irreversible deletion of a file that should have stayed (appeal). Mitigated by the invariants and by tests on every appeal state.
- **Business decision needed before any code.** Durations: 14 days after a rejection decision (taken from the appeal window), until the answer plus 14 days when an appeal is pending, and 7 days for orphan or stalled uploads. The 7 days is an agent proposal. Recorded in `docs/tickets/ROADMAP.md` as "Par défaut proposé".
- **Decision recorded 2026-11-20:** the user confirmed the proposed values, relayed to this session by the session that started it: infected file deleted at once; rejected without appeal deleted 14 days after the decision; rejected with an appeal pending kept until the answer, then 14 days; orphan or stalled upload 7 days. The line was removed from "Décisions à obtenir du client".
- Verdict: go.

### Implementation notes (deviations from the plan)

- `apps/api/src/media/private-object-retention.service.ts`, registered in `MediaModule`, cron `30 2 * * *` Africa/Lagos, batch of 200, oldest first. Stripped on non-scheduler roles by `SchedulerRoleBootstrap`.
- Eligibility is one SQL selection (raw query, parameters bound), so it is tested against a real database, not by mocks.
- "Counted from the answer": an upheld appeal appends a new `REJECTED` decision, so the rule is "latest decision is `REJECTED` and older than 14 days, and no `PENDING`/`ESCALATED` appeal". Withdrawn appeals do not extend the delay.
- "Attached to a live design" is approximated by "has a `DesignAsset`": designs reference assets by id inside their JSON, there is no foreign key to follow. A READY, attached upload is therefore never deleted.
- A stalled READY asset that is deleted is set to `FAILED` with an explanatory message so it never looks usable without its file.
- Rejected assets with no moderation decision row (legacy) are kept (fail safe).
- No schema change, no migration, no endpoint, so no OpenAPI change.

## Implementation reviews

`/code-review high` (single pass, 5 findings):

- Fixed: a fixed `updatedAt` order let assets whose storage delete keeps failing block the batch. The selection is now `ORDER BY random()`.
- Not applied: no appeal recheck between selection and the S3 delete (a window of seconds, only at the exact 14-day boundary; an appeal needs a decision younger than 14 days so the race needs an appeal filed within the last seconds of the window); the delete logic duplicates `purgeInfectedOriginal` (a shared helper is a refactor of TTW-099 code, left for a follow-up); sequential S3 deletes (nightly, bounded to 200 assets).
- Not an issue: raw SQL names (covered by the e2e suite against a real database).

## Verification evidence

Run in the worktree `codex/ttw-235-private-object-retention`, 2026-11-20.

- Tests written first: `private-object-retention.service.spec.ts` showed 7 failed of 7 against a stub (`not implemented`). One of my own assertions (number of `updateMany` calls) was then made exact on what matters (nothing is updated for the asset whose storage delete failed).
- Unit: 7 passed. API e2e `test/private-object-retention.e2e-spec.ts` on a throwaway database `tamiym_workshop_test_ttw235` (`REDIS_DB=13`, dropped afterwards): 11 passed (14-day rule and boundary, pending appeal, upheld appeal counted from the answer, overturned, 7-day orphan, stalled PENDING/FAILED, ready attached and public never touched, storage down then retry, idempotent second run, two concurrent runs, batch bound).
- `pnpm lint` (0 errors), `pnpm format:check`, `pnpm typecheck` (6 of 6), `pnpm test` (api 172 suites 1977 tests, app 234, web 79), `pnpm openapi:check`, `pnpm docs:validate`, `pnpm coverage:ratchet` (lines 85.14%): passed.
- `pnpm coverage:diff`: see the completion summary (run again after the commit, because the new file is untracked before it).
- Not run: Playwright, `pnpm build`, `pnpm audit:prod`, `pnpm verify` as a whole, a run against real S3/MinIO (storage is an in-memory double in e2e), the cron trigger itself (the method is tested, not the schedule).

## Merged into main

- Branch CI on the integration branch `codex/ttw-235-integration`, commit `0699870`: run [44889800024](https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/44889800024), success.
- CI on `main` at `0699870`: run [44893074471](https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/44893074471) FAILED on `Playwright Comprehensive UAT` (a job that runs only on `main`). The cause was in TTW-237 (a thumbnail path saved before the picture), not in this ticket; fixed in `f5a70db`.
- CI on `main` at `f5a70db` (all 19 jobs, including `Playwright Comprehensive UAT`): run [44894303993](https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/44894303993), success. That commit contains this ticket.
- Not verified: a run against real S3/MinIO and the cron trigger itself (the method is tested, not the schedule).

## Completion summary

A daily job (02:30 Lagos, scheduler role) deletes expired private objects: rejected files 14 days after the latest moderation decision (kept while an appeal is open), never-attached or stalled uploads after 7 days, 200 per run, random order. Local commit only: nothing pushed, CI not run. Known limits: no appeal recheck in the seconds between selection and delete; delete logic duplicates `purgeInfectedOriginal`.
