# TTW-110 — Build the failed-email screens

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 10.2, Failed emails cannot be resent** (High, P1, 8–12 h, status "To do"): A lost confirmation email cannot be resent (5 routes).

## Proposal

- Add admin screens for `admin/notification-dead-letters`: list, attempt detail, resend one or many, acknowledge.

## Invariants

- A resend cannot deliver the same effect twice.
- Screens show no message content that the API redacts.

## Implementation plan

1. Start `codex/ttw-110-build-failed-email-screens` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: a failed email is listed, resent and acknowledged.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `/v1/admin/notification-dead-letters/*` — row 10.2
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] An admin can resend a lost confirmation email.
- [x] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Date: 2026-11-22. Finding 10.2 confirmed on current `main`: the API (`AdminNotificationDeadLettersController`: list, detail, `replay`, `replay/bulk`, `acknowledge`, ADMIN only, payloads and recipients redacted) exists, but `apps/admin` has no screen for it. No client decision blocks this ticket.

**Hole found in the existing API (breaks invariant 1).** `NotificationDeadLetterService.replayDeadLetter` computes `nextGeneration = max(generation) + 1`, then looks for a SENT row at that same `nextGeneration`. Such a row cannot exist, so the check never fires. Replaying the same failed e-mail twice therefore creates generation 2 and then generation 3: the customer gets the confirmation twice. Two simultaneous replays also each read the current maximum and take different generations (2 and 3), so the unique `(effectKey, channel, generation)` index does not stop them. Both findings were reproduced against real Postgres before the fix (see Verification evidence).

Decision (in scope, because the screens make "Resend" a one-click action):

- A replay targets the generation right after the one being replayed (`original.generation + 1`), never the global maximum. The unique `(effectKey, channel, generation)` index then allows exactly one replay of a given failure, with no migration and without mutating the original row (policy `ttw-043-interim-policy.md`: "Replay never mutates the original `FAILED` row").
- The pre-read stays as a friendly message. The losers of a race get a clean 400: either the unique violation (`P2002`) or dispatch returning the other replay's row (`idempotentReuse`).
- Consequence: only the newest generation of a failure can be resent. If a replay fails too, the admin acknowledges and resends that newest row (generation 3, and so on). The detail panel disables "Resend" on a failure that already has a replay and says why. The list API does not say which rows have a replay (changing it was judged not worth a contract change), so a bulk resend of such a row is refused by the API and shown line by line in the results.
- Tests against real Postgres: sequential double replay and two concurrent replays create exactly one new row; resend after a failed replay.

**Screens (`apps/admin`).** New route `/admin/notifications/failed` with a link from the Notifications page and the sidebar entry staying on "Notifications". List with filters (channel, event, acknowledgement) and "load more" by cursor; detail panel with the attempt history, redacted payload and replay chain; actions: acknowledge (optional note), resend one, resend selected (max 25). The API requires acknowledgement before a replay, so "Resend" stays disabled on an open row with the hint "Acknowledge this failure first". The UI shows only what the API returns (already masked); it never rebuilds or unmasks a recipient or payload. Bulk results show one line per item, success or error.

**Out of scope, noted.** The replay reason is validated but never stored (`adminUserId` and `reason` are unused in `replayDeadLetter`), despite the DTO text. Not changed here.

## Implementation reviews

Review 1 (2026-11-22, `/code-review` at high effort, one reviewer, charter: correctness, conventions, cleanup of the whole diff). 8 findings:

| #   | Finding                                                                            | Outcome                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Detail panel kept its reason and messages when another failure was opened          | Fixed: the panel is keyed by failure id.                                                                                                                                                                                     |
| 2   | The replay reason and the admin id are validated but never stored (no audit trail) | Fixed in a second round: acknowledge and replay now write an audit log entry (admin, reason as note, new row).                                                                                                               |
| 3   | `ttw-043-interim-policy.md` not updated for the new replay rule                    | Fixed: replay row and rule paragraph updated.                                                                                                                                                                                |
| 4   | Hard-coded colours (`text-red-700`, `text-emerald-700`)                            | Fixed: `text-destructive` and `text-foreground`.                                                                                                                                                                             |
| 5   | Forms use plain state, not Zod + React Hook Form                                   | Fixed in a second round for the three text forms (bulk reason, note, resend reason), with the API's limits. The filter row stays on plain state: it has no validation.                                                       |
| 6   | Bulk selection keeps rows already resent from the detail panel                     | Fixed in a second round: the list API returns `replayCount`, rows already resent show "Already resent" and cannot be selected, the selection is recomputed from the list, and bulk results name the e-mail instead of an id. |
| 7   | Pre-read of the next generation duplicates dispatch's own check                    | Kept on purpose: removing it means rewriting the existing unit test `denies replay when next generation already succeeded`, which the project rules forbid without your approval. The unique index remains the real guard.   |
| 8   | API e2e leaves queued delivery jobs in Redis for deleted rows                      | Fixed in a second round: the spec removes the delivery job of each outbox row before deleting it.                                                                                                                            |

No second reviewer: the charters do not differ (no money or ledger involved).

## Verification evidence

Run in the worktree, 2026-11-22.

- Failing first (real Postgres, before the fix): `pnpm --filter api test:e2e -- test/notification-dead-letter-replay.e2e-spec.ts` gave 2 failed, 2 passed. A second replay of the same failure created generation 3, and two concurrent replays both succeeded (generations 2 and 3).
- After the fix: the same command gave 4 passed, run three more times with 4 passed each. After the second round it has 7 tests (audit on replay and on acknowledge, `replayCount` in the list) and gave 7 passed, twice. Those three new tests failed first (3 failed, 4 passed).
- `pnpm --filter api test`: 178 suites, 2184 tests passed after the second round (new unit tests: replay count in the list, audit on replay, no audit on a denied replay; the acknowledge test also checks the audit entry). The fixture of the existing list test gained a `_count` field and the existing bulk-max test module gained the `AuditService` provider; no assertion was changed.
- `pnpm --filter api typecheck`, `pnpm --filter admin typecheck`: no error.
- `pnpm --filter api lint`: 0 errors, 14 warnings. `pnpm --filter admin lint`: 0 errors, 22 warnings. None is in a changed file.
- `pnpm format:check`, `pnpm docs:validate`, `pnpm playwright:validate`, `pnpm openapi:check` passed. No endpoint or DTO changed, so no OpenAPI regeneration.
- `pnpm --filter api test:coverage` then `pnpm coverage:ratchet` passed (lines 85.79%, floor 56%). `pnpm coverage:diff` passed: 18/18 changed lines covered against `origin/main`.
- `pnpm build` passed. Playwright, on a throwaway database `tamiym_workshop_test_ttw110` (migrated, seeded with `seed:e2e`, dropped afterwards): `tests/e2e/journeys/admin-failed-emails.journey.spec.ts`, now 7 tests (short reason message, row marked "Already resent", readable bulk results), 7 passed; run again on a fresh database after each round of review fixes. One earlier failure came from the test order in serial mode, fixed in the test.

Not verified: the other Playwright suites (only the new journey was run); no check on the deployed environment; the delivery of the resent e-mail by a real worker and mail server (the screen reports it as queued).

## Completion summary

Admins can open `/admin/notifications/failed` (link on the Notifications page): filter the failed notifications, see attempts and the redacted message data, acknowledge a failure, resend it, or resend up to 25 at once with one result line each.

While building it, a hole in the existing API was found and fixed: replaying the same failure twice, or two admins replaying at once, delivered the e-mail twice. A replay now targets the next generation and the unique database index allows only one. Seed data (four failed e-mails), the Playwright manifest and the notification policy doc were updated.

Merged into `main` on 2026-11-22 (merge commit `0427f4b`); roadmap and README ticked. CI on the ticket branch passed (run 45061260754, all jobs green). Review finding 7 is kept as is (see the review table).
