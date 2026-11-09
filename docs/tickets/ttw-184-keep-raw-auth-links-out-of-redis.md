# TTW-184 — Keep raw reset and verification links out of retained Redis jobs

**Epic:** 8 — Client review delivery  
**Status:** Complete  
**State: Verified.** Merged into `main` at the owner's request (merge commit `43ca6d2`, change `768bf4a`, on top of `f3eafd1` with TTW-182 and TTW-185) and pushed. On the merged tree, before the push: `pnpm typecheck` (6 tasks), `pnpm lint` (0 errors), `pnpm openapi:check` ("OpenAPI contract drift check passed") passed; `pnpm test`: api 1348, app 45 and web 43 tests passed; API e2e `auth-link-retention`, `auth-token-hashing`, `google-oauth-linking`, `auth-rate-limit`, `auth-surface`: 5 suites, 52 tests passed. GitHub Actions on `43ca6d2`: CI run `42565699276` success (all 18 jobs, including API Integration, Playwright Smoke, OpenAPI Contracts, Coverage), Playwright Comprehensive run `42565699277` success.  
**Risk:** High  
**Blocked by:** TTW-083 (must be merged first: same files and the same invariant)  
**Blocks:** None

## Background

TTW-083 stores only `sha256(token)` in `auth_tokens`, so a database read can no longer produce a working password-reset or email-verification link. The raw link still sits in Redis, in the BullMQ mail job that sends it. Found by the TTW-083 independent review (2026-11-08). Confirm against current `main` before designing.

- `apps/api/src/auth/auth.service.ts`: `forgotPassword` queues `JOB_PASSWORD_RESET_EMAIL` with `{ to, resetUrl }`. `enqueueVerificationEmail` queues `JOB_VERIFICATION_EMAIL` with `{ to, token, verifyUrl }`. Both URLs carry the raw token.
- `apps/api/src/mail/mail.service.ts`: `SendVerificationEmailPayload` declares a `token` field that `sendVerificationEmail` never reads (it uses `verifyUrl` only). The raw token is therefore stored twice in each verification job.
- `apps/api/src/mail/mail.module.ts`: default job options are `attempts: 8`, exponential backoff from 4 s, `removeOnComplete: true`, `removeOnFail: { count: 200 }`. A sent job is removed, but a job that keeps failing (SMTP outage, bad address) stays in Redis with its data. Until the link expires (1 h for a reset, 24 h for a verification, `apps/api/src/constants.ts`), anyone who can read Redis can use that link.

## Proposal

To confirm at design review:

- Drop the unused `token` field from the verification job payload and from `SendVerificationEmailPayload`.
- For the two token-bearing jobs only, stop keeping failed jobs beyond the link's lifetime. For example, set `removeOnFail` per job when it is added (`{ age: <token TTL in seconds> }`, or `true`), and keep a failure log line or metric without the URL so operations still see failures.
- Leave other mail jobs on the current defaults.

## Invariants

- No retained Redis job holds a reset or verification link that still works.
- A failed send is still visible to operations (log or metric), without the token, URL or email address.
- Retries within the link's lifetime still deliver the email.

## Implementation plan

1. Start `codex/ttw-184-keep-raw-auth-links-out-of-redis` from current `main` (after TTW-083 is merged), in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: the job payloads contain no `token` field, and the token-bearing jobs are added with the chosen `removeOnFail` option. Other mail jobs keep the defaults.
- Integration: queue a reset and a verification against real Redis, make the send fail, and check that no retained job data contains the raw token after the retention rule applies.
- Logs, metrics, traces, and alerts: a failed auth email stays visible without the token, URL or address. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/auth/auth.service.ts` — `forgotPassword`, `enqueueVerificationEmail`.
- `apps/api/src/mail/mail.service.ts` — `SendVerificationEmailPayload`.
- `apps/api/src/mail/mail.module.ts` — default job options.
- `apps/api/src/mail/processors/mail.processor.ts` — job handling.
- `docs/tickets/ttw-083-hash-password-reset-and-verification-tokens.md` — Implementation reviews, out-of-scope observations.

## Acceptance criteria

- [x] A Redis read alone cannot produce a working reset or verification link once the send has failed for good.
- [x] Failed auth emails remain visible to operations without secrets or PII.
- [x] Docs (`docs/14-auth-and-session-architecture.md`) are updated.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- `mail.processor.ts` logs the recipient address on success for verification and reset emails ("Sent verification email to …"), which the logging rule forbids. TTW-179 already removed the address from its own log line. Worth fixing, but it is a separate PII-in-logs issue: fold it in only if the design review agrees.
- Two simultaneous reset requests can leave two valid links (`deleteMany` then `create` outside a transaction). Pre-existing, noted in TTW-083.
- No `@MaxLength` on `token` in `reset-password.dto.ts` / `verify-email.dto.ts`. Noted in TTW-083.

## Design review

**2026-11-08 — approved by the user (plan mode), risk High.**

Finding confirmed on `main` (`102fd9e`): `auth.service.ts:249` queues `{ to, resetUrl }`, `auth.service.ts:414` queues `{ to, token, verifyUrl }`, and `mail.module.ts:21-26` keeps the queue defaults described above. `MailService.sendVerificationEmail` never reads `token`.

New fact from BullMQ 5.67.2 that changes the proposal: `removeOnFail: { age }` is not a timer. `moveToFinished-14.lua:166-186` trims the failed set by age only when another job finishes as failed, and `removeJobsByMaxAge.lua` trims the whole failed set of the queue, so one job's option would also prune other mail jobs. On a quiet queue, a failed reset job with `{ age: 3600 }` would stay until the next failure, possibly for days. `removeOnFail: true` takes the other branch (`removeJobKeys(jobIdKey)`): this job only, atomically, at its final failure.

Decisions:

1. The two token-bearing jobs are added with `removeOnFail: true` (shared constant `AUTH_LINK_JOB_OPTIONS`). Queue defaults are unchanged, so Google notices and outbox jobs keep `{ count: 200 }`.
2. The `token` field leaves the verification job and `SendVerificationEmailPayload`.
3. Visibility: on the last failed attempt of a token-bearing job, `MailProcessor` logs a `warn` with the job name, id, attempt count and the error's name/code (`ECONNECTION`, `EAUTH`…). Never the error message (it can carry the address, for example `Invalid email address: …`), the URL, the token or the address. The per-attempt `recordQueueJob(failure)` metric stays.
4. Folded in (user agreed): the two success log lines for verification and reset no longer print the recipient address, as TTW-179 did for the Google notices. Same file, same rule.
5. Retries stay as they are: 8 attempts with exponential backoff from 4 s finish in about 8.5 minutes, well inside the 1 h reset lifetime.

Rejected: minting the token in the worker so the job carries no secret. It moves auth logic into the mail worker and is beyond the ticket's proposal.

Accepted residual risks:

- While a job waits or retries, its data holds a working link. That is the job's purpose and lasts at most the retry window (or until the link expires if workers are down).
- A job that stalls more than `maxStalledCount` is failed by BullMQ outside `process()`: `moveStalledJobsToWait-8.lua:88-89` stores a deferred failure (`defa`) and re-queues the job, then the next worker turns it into an `UnrecoverableError` without calling the processor (`worker.js:561-565`, `job.js:201`). The final `warn` is not logged for it. The job is still removed, because `handleFailed` → `moveToFailed` applies its own `removeOnFail`. The same holds for an `UnrecoverableError` thrown from the send path at attempt N < max (nothing throws one today).
- The BullMQ event stream keeps `failedReason` (the error message, possibly with the address, never the link). Separate PII issue, listed below.

Tests (written first): unit tests on `AuthService` (job options, no `token` key) and `MailProcessor` (final-failure log without secrets, success logs without address); an e2e spec against real Redis that drives both jobs to their final failure through the real `MailProcessor` worker and scans every `bull:mail:*` key for the raw token, with a Google notice as a control that stays in the failed set.

## Implementation reviews

**2026-11-08, independent reviewer (fresh subagent, implementation + security charter in one review), read-only: PASS, no blocking or should-fix finding.** Confirmed by reading BullMQ 5.67.2:

- `removeOnFail: true` overrides the queue default: `Job.moveToFailed` passes `this.opts.removeOnFail` (`job.js:532`) to `getKeepJobs` (`scripts.js:465-474`), which maps `true` to `{ count: 0 }`; `moveToFinished-14.lua` then runs `removeJobKeys` (job hash, `:logs`, `:dependencies`, `:processed`, `:failed`, `:unsuccessful`) atomically with the move to failed.
- The final-attempt check matches BullMQ's own retry rule (`shouldRetryJob`, `job.js:481`: retry only if `attemptsMade + 1 < attempts`).
- The warn line prints only job name, id, attempts, error name and `String(error.code)`; the success logs no longer print the address; no other place in these jobs logs the token or address.
- Unit tests fail without the fix; the e2e spec is non-vacuous (asserts the token is in Redis before the failure) and has a control job.

Nits and what was done:

1. The stalled-job residual risk was "not proven by the source". Checked: `moveStalledJobsToWait-8.lua:88-89` sets `defa`, `job.js:201` reads it as `deferredFailure`, and `worker.js:561-565` fails the job with an `UnrecoverableError` without calling the processor. The note is right; the Design review now cites these lines.
2. `UnrecoverableError` before the last attempt also skips the warn → comment added on `warnIfAuthLinkJobGaveUp` (both cases are still removed from Redis).
3. Positional `mailAdd.mock.results[2]` in the e2e spec → replaced by a `findIndex` on the control job name.
4. `queue.drain(true)` empties the shared mail queue → accepted: e2e runs in band, and this worktree uses its own Redis DB (13). Spies end with the app.
5. The wait for the worker had no timeout → 30 s timeout that names the jobs still pending.

## Verification evidence

Local database `tamiym_workshop_test_ttw184` (created with `pg`), Redis DB 13, Node 24.22.1, base `main` `102fd9e`.

- Red phase (tests written before the code):
  - `npx jest src/mail/processors/mail.processor.spec.ts src/auth/auth.service.spec.ts -t "TTW-184"` → `Tests: 7 failed, 65 skipped, 2 passed`. Reasons: `add` called without `{"removeOnFail": true}`; verification payload keys contain `"token"`; success logs `"Sent verification email to a@b.com"` / `"Sent password reset email to a@b.com"`; final warn `Received number of calls: 0` (×3). The 2 passing are the "no warn while retries remain" and "other mail jobs" guards.
  - `pnpm test:e2e -- auth-link-retention` → `Tests: 1 failed`: `expect(received).toBeUndefined()` received the failed `password-reset-email` job with `"resetUrl": "http://localhost:3000/reset-password?token=…"` and `"removeOnFail": {"count": 200}`.
- After the fix:
  - `npx jest src/mail src/auth/auth.service.spec.ts` → `Test Suites: 10 passed`, `Tests: 124 passed`.
  - `pnpm test:e2e -- auth-link-retention auth-token-hashing google-oauth-linking auth-rate-limit auth-surface` → `Test Suites: 5 passed`, `Tests: 52 passed`.
  - Full API e2e `pnpm --filter api test:e2e` (includes the new spec) → `Test Suites: 27 passed, 27 total`, `Tests: 155 passed, 155 total`, exit 0.
  - `pnpm lint` → `Tasks: 6 successful`, exit 0; api: 0 errors, 14 existing warnings in `auth-session.service.spec.ts`, `openapi/application.factory.ts`, `openapi/normalize-openapi-document.ts`, `pricing/pricing.service.ts` (none touched). Targeted `eslint` on the e2e spec and `mail.processor.ts` after the review fixes → exit 0, no output.
  - `pnpm typecheck` → `Tasks: 6 successful`, exit 0; `npx tsc --noEmit -p apps/api/tsconfig.json` after the review fixes → exit 0.
  - `pnpm test` → `Tasks: 4 successful`, exit 0 (api `148 suites, 1336 tests passed`; web 43; app 45). The api run prints a Jest "worker process has failed to exit gracefully" notice; the exit code is still 0.
  - `prettier --check` on every changed and new file → clean.
- Not run: `openapi:check` (no DTO or HTTP contract changed), Playwright (no UI change).

## Completion summary

- `apps/api/src/constants.ts`: `AUTH_LINK_JOB_NAMES` and `AUTH_LINK_JOB_OPTIONS = { removeOnFail: true }`.
- `apps/api/src/auth/auth.service.ts`: reset job `{ to, resetUrl }` and verification job `{ to, verifyUrl }` (no `token` field), both added with `AUTH_LINK_JOB_OPTIONS`.
- `apps/api/src/mail/mail.service.ts`: `token` removed from `SendVerificationEmailPayload`.
- `apps/api/src/mail/processors/mail.processor.ts`: final-failure `warn` for the two jobs (name, id, attempts, error name and code only); success logs without the address (folded in, agreed at design review).
- Tests: `auth.service.spec.ts`, `mail.processor.spec.ts` (+ `mail.service.spec.ts` drops the removed field), new `apps/api/test/auth-link-retention.e2e-spec.ts`.
- Docs: `docs/14-auth-and-session-architecture.md` (threat table row and a paragraph on the mail job).
- Deviation from the proposal: `removeOnFail: true` instead of `{ age: <TTL> }`, because BullMQ trims by age only when another job fails (Design review).
- Merged and pushed (`43ca6d2`); CI and Playwright Comprehensive green. Nothing left in scope; the out-of-scope observations below remain open.

### Out-of-scope observations (not fixed)

- The BullMQ event stream (`bull:mail:events`, capped near 10,000 entries) keeps each failure's `failedReason`, which is the error message. `MailService.sendTemplatedEmail` throws `Invalid email address: ${to}`, so an address can sit there and in Nest's error output. Never the link. Worth a small PII ticket (drop the address from that message).
- An invalid address is a `BadRequestException` that BullMQ retries 8 times; it could be an `UnrecoverableError`. Not changed, so the retry behaviour stays as it was.
