# TTW-254 — Confirm a new sign-up with a one-time code sent by email

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

Decision by the user, 2026-11-23: the sign-up in `apps/app` is too permissive. Today `POST /v1/auth/register` creates the account at once and logs the user in (`apps/api/src/auth/auth.controller.ts:117`, `apps/api/src/auth/auth.service.ts:122`). A verification link is emailed, but nothing requires it to be clicked: only placing an order is refused while the email is unverified (`apps/api/src/orders/orders.service.ts:494`). Anyone can therefore create an account, and be signed in, with an address they do not own.

The user wants the owner of the address to prove it with a code emailed to them, and to be signed in only after entering it. Strong protection against bots is required: rate limiting and more.

Scope decision by the user, 2026-11-23: `apps/app` only for now. `apps/web` has its own sign-up page (`apps/web/app/auth/register`) and **will be concerned later**; the user has not reviewed it yet. A note is in the local `docs/tickets/ROADMAP.md`. Confirm each point against current `main` before designing: the code may have moved.

## Proposal

- **The account is created only after the code is entered.** A new sign-up does not create a user. It stores a pending sign-up (email, password hash, names, phone) and emails a 6-digit code. Entering the correct code creates the user with `emailVerifiedAt` set, opens the session and returns the CSRF token.
- **New routes, old route untouched.** `POST /v1/auth/register/start`, `POST /v1/auth/register/verify`, `POST /v1/auth/register/resend`. `POST /v1/auth/register` keeps its behaviour so `apps/web` is not broken before it is handled.
- **Code:** 6 digits from `crypto.randomInt(0, 1_000_000)`, valid 10 minutes. Stored as an HMAC-SHA256 of `v1|<email>|<code>` (the row id is not known before the insert, and the email is the row key) (a plain hash of 10^6 values is reversible in seconds), compared with `timingSafeEqual`. The key is a new dedicated secret `SIGNUP_CODE_HMAC_KEY` (at least 32 bytes, validated at startup in `env-validation.ts`, added to `.env.example`); the JWT secret is not reused raw. A new code overwrites the previous hash in the same conditional update that sends it and resets the attempt counter.
- **The sign-up is bound to the browser that started it (design review B1).** `start` returns a random 32-byte `signupToken`, stored as a SHA-256 digest on the row. `verify` and `resend` require that token and the code. Every `start` overwrites name, password hash, phone and token, so whoever started last owns the row; confirming also needs the mailbox, so a third party can at worst invalidate someone's flow, never obtain an account with their own password. For an email that already has a verified account, `start` stores nothing and returns a random decoy token of the same format.
- **Bot and abuse protection**, layered:
  - Redis rate limits on the existing auth limiter, with two new buckets, fail-closed (503) when Redis is unavailable: `signup_send` (start and resend; identity = the email for start and the sign-up token fingerprint for resend, limit 3, IP limit 10, window 15 min) and `signup_verify` (identity = fingerprint of the `signupToken`, not the email, so a third party cannot burn a victim's window; limit 10, IP limit 30, window 10 min). A third party can re-arm the `signup_send` lockout of one address every 15 minutes with 3 requests: it blocks `start` for that address (429), and each of their `start` calls rewrites the token and so invalidates the victim's open flow. Accepted as a bounded nuisance (it never yields an account), listed in the known gaps of the architecture doc.
  - At most 5 wrong attempts per code, counted by reserve-first: `UPDATE … SET attempts = attempts + 1 WHERE token matches AND attempts < 5 AND expiresAt > now() RETURNING …`, and the code is compared only if a row came back. After the fifth the row stays, locked, until a new send; it is **not** deleted (design review B2).
  - Resend cooldown of 60 seconds and at most 5 sends per hour window per email (fixed window), anchored on the row (`windowStartedAt`) so they survive restart, lock and re-start; one conditional `UPDATE … WHERE lastSentAt <= now() - 60s AND (sendCount < 5 OR windowStartedAt < now() - 1h)`. The database clock is used everywhere. `register/resend` always answers the same generic 202, whether it sent, was held back by the cooldown or the cap, or got an unknown token (implementation review B1).
  - No account enumeration: `start` always does the same password hashing work and answers identically, whether or not the email has an account; wrong, expired, locked and unknown codes give the same error.
  - Nothing sensitive in logs, metrics or audit: no code, no signup token, no address.
  - The mail job is registered with the other auth-link jobs (`removeOnFail: true`, TTW-184). Its data carries `{to, code, expiresAt}`; the processor skips the job when `expiresAt` has passed, so a retry cannot deliver a stale code.
  - Expired rows are swept by the existing auth token cleanup, only past `max(expiresAt, windowStartedAt + 1h)` so the send cap is never lost.
- **An unverified account left by the old route (design review B4).** If the email belongs to an unverified customer created by the old `POST /v1/auth/register`, `start` proceeds. On confirm, instead of creating a user, the existing row is secured as in TTW-179: pending password hash set, `emailVerifiedAt` set, all sessions revoked, reset, verification and refresh tokens deleted. A unique-constraint collision on create rolls the transaction back (the pending row comes back) and the confirmation is tried once more, so the second pass takes the new unconfirmed account over; a second collision is refused with the same generic error. A pending row for an email that Google sign-in then creates or links is deleted in the same transaction.
- **Confirm in one transaction:** consume the row (`DELETE … WHERE id = … ` with count 1), create or secure the user, create the CUSTOMER session through `authSession.createSession` with the same transaction, set `lastLoginAt`, write the audit event `auth.signup.confirmed` (user id only). `login()` is not called.
- **CSRF and docs:** the three routes are `@Public()`, guarded by `AuthRateLimitGuard`, CUSTOMER surface only, and added to the CSRF public-path exemptions (the check is path-suffix based, so `/auth/register/start` is not covered by the existing `/auth/register`); `docs/14-auth-and-session-architecture.md` lists them and the corrected mail-job payloads.
- **Schema:** one new table `PendingSignup` (email unique, `signupTokenHash`, `codeHash`, `passwordHash`, names, phone, `attempts`, `sendCount`, `windowStartedAt`, `lastSentAt`, `expiresAt`, index on `expiresAt`), created with `prisma migrate dev` against a throwaway database. `AuthToken` is not reused (it needs a user, has a unique hash and a user-bound enum).
- **Input rules:** email lower-cased and trimmed once at the boundary and used for the row key, the throttle identity, the user lookup and the mail; email at most 254 characters; the password rules of `RegisterDto` are reused; `code` matches `^\d{6}$`; `signupToken` is 64 hex characters. The token is kept by the front in `sessionStorage`, never in the URL.
- **Front (`apps/app`):** after the sign-up form, a code entry screen with a "Resend code" action, built with Zod and React Hook Form, with loading, error, expired, too-many-attempts and rate-limited states. No redirect to the dashboard before the API confirms.
- Update Swagger, the OpenAPI artefacts, `docs/14-auth-and-session-architecture.md`, and the Playwright sign-up specs and manifest.

Rejected alternatives:

- Creating the user first and blocking login until verified: leaves squatted accounts and reserves addresses that nobody owns.
- A CAPTCHA now: not asked for; kept as a later option if the limits are not enough against bots.
- Changing `POST /v1/auth/register` in place: would break `apps/web`, which is out of scope for now.

## Invariants

- No user row, session or cookie exists for a sign-up that has not entered the right code.
- One address cannot end up with two accounts, including under two simultaneous correct confirmations.
- A code works once, before its expiry, and never after five wrong attempts.
- Existing accounts, Google sign-in, login and the old `POST /v1/auth/register` behave as today.
- Secrets (code, signup token, password) never appear in logs, metrics, audit rows or responses.
- Nobody but the browser holding the latest signup token can confirm a sign-up, and never with credentials other than the last ones submitted by that token's holder.
- The send cap (5 per hour per address) cannot be reset by wrong guesses, restarts or row cleanup.

Accepted residual risk: the old `POST /v1/auth/register` stays open for `apps/web` and has none of these protections (its own limits are 5 a minute per email and 40 a minute per IP, and it still answers 409 for an existing email). It still leaves `emailVerifiedAt` empty, so ordering stays gated. A follow-up for `apps/web`, with a deadline, closes it.

## Implementation plan

1. Write the API integration tests first (real Postgres and Redis) and show them failing: correct code, wrong code, expiry, replay, five wrong attempts, cooldown and send cap, rate limits, no enumeration, two simultaneous confirmations.
2. Add the pending sign-up table (Prisma CLI migration) and the two rate-limit buckets.
3. Implement the three routes, the code email template and job, and the cleanup of expired rows.
4. Regenerate OpenAPI and shared types.
5. Write the `apps/app` component tests first, then the code entry screen; update the Playwright specs and manifest.
6. Update the docs. Update this plan if reality differs.

## Test and observability plan

- Unit/component: code generation and HMAC comparison; `apps/app` register and code screens (all states).
- Integration/e2e: the API cases of step 1 against real Postgres and Redis; Playwright sign-up journey in `apps/app` with the code read from the queued mail job.
- Failure, retry, and concurrency (all against real Postgres and Redis):
  - 20 parallel wrong guesses on one row: attempts end at 5, at most 5 comparisons, the right code is refused afterwards.
  - 2 and 10 parallel correct confirmations: one user, one session. Confirm racing Google sign-in and the old register route for the same email: one user in total. Resend racing confirm.
  - Pre-hijack in both orders (attacker starts first, victim starts first). Loop of start then 5 wrong guesses: the send cap holds across rows. An unverified account left by the old route is secured on confirm (old password dead, sessions revoked).
  - Same status and body for a new and a verified email; Redis down gives 503 on all three routes with no database write; a stale customer cookie does not trigger a CSRF refusal.
  - The queued job holds the code only in `data.code` and is removed on final failure; a retry after a resend or past expiry sends nothing; logs and audit rows contain neither code nor token.
  - Forgot-password and old verification resend do not touch pending rows and send nothing for a pending-only address.
- Logs, metrics, traces, and alerts: reuse the auth throttle metric for the new buckets; add an audit event when a sign-up is confirmed. No codes or addresses in logs.

## References

- `apps/api/src/auth/auth.controller.ts:117` — register and auto-login today.
- `apps/api/src/auth/auth.service.ts:122` — `register`; `:163` link-based `verifyEmail`.
- `apps/api/src/auth/auth-rate-limit.service.ts` — limiter to extend; `apps/api/src/constants.ts` — buckets and auth-link jobs.
- `apps/app/app/auth/register/page.tsx` — current sign-up screen.
- `docs/tickets/ttw-090-show-email-verification-state-and-resend.md` — current verification banner.

## Acceptance criteria

- [ ] In `apps/app`, a new sign-up is signed in only after entering the emailed code; before that, no user, session or cookie exists.
- [ ] A wrong, expired, reused or over-attempted code is refused, with the same message for each.
- [ ] Sending, resending and entering codes are rate limited per IP and per email, with a resend cooldown and send cap.
- [ ] Two simultaneous correct confirmations create one account.
- [ ] `apps/web` sign-up still works unchanged.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Contracts, migration, observability and documentation are updated.

## Out of scope

- `apps/web` sign-up → to be handled in its own change once the user has reviewed that page.
- Existing unverified accounts logging in (refusing login and asking for a code) → decision pending.
- A CAPTCHA, and an "account already exists" notice email.
- Changing the link-based verification used by existing accounts.

## Design review

**Reviewer:** independent read-only agent (design and security charter), 2026-11-23. Its code citations for the current behaviour were checked (`auth.controller.ts:117`, `auth.service.ts:122`, `orders.service.ts:494`). It did not read `apps/web`, the request-logging and body-redaction path, or the full `apps/app` register page.

**Verdict on the ticket as first written: FAIL**, four blockers, all now addressed in the Proposal above. The reviewer stated that with B1 to B4 fixed the design is PASS WITH CHANGES. It has not re-read the updated ticket.

| #             | Finding                                                                                                                                                           | Resolution                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| B1            | Pre-hijack: anyone could start a sign-up for a victim's address with their own password and have it confirmed by the victim's code.                               | `signupToken` binds confirm to the starting browser; every start overwrites the row; decoy token for verified emails.      |
| B2            | Deleting the row on the fifth wrong attempt, or at expiry, reset the send cap and cooldown.                                                                       | Row kept and locked; send counter anchored on a rolling hour; cleanup past `max(expiresAt, windowStartedAt + 1h)`.         |
| B3            | Compare-then-increment allowed more than 5 guesses under concurrency; an email-keyed verify bucket let a third party lock a victim out.                           | Reserve-first conditional update; verify bucket keyed on a token fingerprint.                                              |
| B4            | An unverified account left by the old route would block its real owner forever.                                                                                   | Confirm secures the existing row as in TTW-179 instead of creating a user.                                                 |
| S1            | No dedicated HMAC secret exists.                                                                                                                                  | New `SIGNUP_CODE_HMAC_KEY`, validated at startup. Needs a value in every environment.                                      |
| S2            | Enumeration through timing and the 409.                                                                                                                           | Same hashing work and byte-identical answers in `start`; the old route's 409 stays (residual risk).                        |
| S3            | Mail retries (8 attempts, about 8.5 min) could deliver a stale code; docs claim jobs carry only links.                                                            | Job carries `expiresAt` and is skipped when past; docs corrected.                                                          |
| S4            | CSRF exemptions are suffix based and do not cover the new routes; confirm should create user and session in one transaction.                                      | Routes added to the exemptions; single transaction, no call to `login()`.                                                  |
| S5            | The existing `customer_auth` bucket would block resend.                                                                                                           | Two dedicated buckets with the values above.                                                                               |
| S6            | Queue failure after the database write.                                                                                                                           | Decided at implementation and tested: generic success, send counter rolled back on queue failure.                          |
| S7            | Google sign-in for the same email.                                                                                                                                | Pending row deleted just before Google's transaction (accepted, see review 1 finding 4); confirm handles an existing user. |
| S8–S12, N1–N5 | Old-route interactions, schema and cleanup, normalisation and length limits, front-end token storage, residual risk, rate-limited verify, review record, Swagger. | Folded into the Proposal, Invariants and test plan above.                                                                  |

Open items for the user: (1) a new secret `SIGNUP_CODE_HMAC_KEY` must be set in every environment, including CI and production; (2) the follow-up for `apps/web` and its deadline.

## Implementation reviews

**Review 1, 2026-11-24** (independent read-only session; it read the code and the tests, and ran none of them). **Verdict: PASS WITH CHANGES.** Dimensions: correctness (SQL, time zone) PASS; security PASS WITH CHANGES; concurrency PASS in code, PASS WITH CHANGES in tests; regressions PASS; front PASS WITH CHANGES; tests PASS WITH CHANGES; docs, migration and contracts PASS.

| #    | Finding                                                                                                                                                                                                                                                                                                                                | State                                                                                                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **BLOCKER.** `register/resend` answered 429 for a real sign-up in its cooldown and 202 for the decoy token of a verified address: two calls revealed whether an address has an account.                                                                                                                                                | Fixed 2026-11-24: always the same generic 202. E2E tests changed to assert the same status and body for a real token in cooldown and an unknown token                                                      |
| 2    | Redis down (503 on the three routes, no row written) has no test                                                                                                                                                                                                                                                                       | Done 2026-11-24: three tests with the rate limiter failing (503 on start, verify and resend; nothing written or queued)                                                                                    |
| 3    | Races with Google sign-in, with the old register route, and resend against confirm are not tested against a real database                                                                                                                                                                                                              | Done 2026-11-24: three race tests against real Postgres (Google, old register route, resend). They found and fixed a 500 in the old register route, now 409 when the address is taken at the same moment   |
| 4    | The Google clean-up deletes the pending row outside the transaction (the ticket said inside). Not dangerous: confirm refuses when a verified account exists                                                                                                                                                                            | Accepted deviation: confirm refuses when a verified account exists, so the delete outside the transaction is safe; the ticket text is corrected here                                                       |
| 5    | The Playwright fixture reads the code from `bull:mail:*`, but the mail queue has `removeOnComplete: true`: a running worker may delete the job first. The spec was never run                                                                                                                                                           | Checked by reading: Playwright starts the API with `NODE_ENV=test`, where the mail processor does not autorun, so the job keeps its code. Explained in the fixture. Still not run                          |
| 6    | Three weak tests: "victim first" ends with `void attackerToken`; "31st call refused" asserts `limited >= 1`; "do not exhaust the victim" uses 10 distinct tokens over 12 requests                                                                                                                                                      | Done 2026-11-24: victim-first restarts and confirms with the victim password; the IP test asserts 30 answered then 429; a new per-token test; the per-email test uses 12 distinct tokens naming the victim |
| 7    | No test that `code` and `signupToken` stay out of logs (the request serializer logs only id, method, url)                                                                                                                                                                                                                              | Accepted gap: the request serializer logs only id, method and url; no test asserts it                                                                                                                      |
| 8–13 | NITs: the send window is fixed, not rolling (text says rolling); HMAC has no `rowId` (justified); a capped `start` sends nothing without a signal; small timing gap on `start`; `+` aliases multiply the per-address limit; `createdAt` default depends on session time zone; the processor skips expired jobs but not superseded ones | Text corrected (fixed window, HMAC without row id); remaining risks recorded in the architecture doc (aliases, silent cap, timing gap). Skipping superseded mail jobs not done                             |
| 14   | Front: hard-coded `red-*` colours in the new component, no `aria-describedby` on the code error, no focus on the code field, a reload restarts the 60 s countdown, `start` shows the raw API message for 429 and 503                                                                                                                   | Done 2026-11-24 except the countdown restarting on reload (accepted): theme tokens, `aria-describedby`, focus on the code field, dedicated 429 and 503 messages on start                                   |

Not verified by the reviewer: unit and e2e runs, Playwright, `auth-link-retention`, the log filter, `apps/web`, a real mail send. A second review is needed after the open SHOULD items are handled or accepted.

**Review 2, 2026-11-24** (second independent read-only session, on the code after the fixes). **Verdict: PASS WITH CHANGES, no blocker.** Review 1 findings 1, 2 and 6 are resolved, 3 resolved with a reservation now handled, 4 and 7 accepted. No oracle left in status, body, headers or limits between a real sign-up and a decoy; the remaining signal is a millisecond-scale timing gap (accepted).

| #     | Finding                                                                                                                                                                                            | State                                                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| S1    | The Playwright fixture would raise `WRONGTYPE`: its scan of `bull:mail:*` also matches the queue's list, stream and counter keys                                                                   | Fixed: only `hash` keys are read; checked against the real Redis                                                                                |
| S2    | `getByRole('alert')` in the Playwright spec hits Next.js's own route announcer                                                                                                                     | Fixed: filtered by the error text                                                                                                               |
| S3    | Ticket and doc text out of line with the code (HMAC row id, Google delete in the same transaction, `P2002` handling, resend identity, targeted lockout, stale evidence)                            | Fixed in this ticket and in `docs/14-auth-and-session-architecture.md`                                                                          |
| S4    | After the resend change the screen still said "We have sent you a new code" when nothing was sent                                                                                                  | Fixed: honest wording ("If your sign-up is still open, a new code is on its way…") and the test follows                                         |
| S5    | A collision with the old register route made a person who holds the right code get a 400 and lose an attempt                                                                                       | Fixed: the confirmation is tried once more after the rollback, so it takes the account over; a second collision is refused. Unit tests for both |
| N1–N8 | Timing gap, thin Redis-down assertions for verify and resend, narrow per-token test, no window-end test, shared-Redis dependence, stale header, untracked tickets, API error not tied to the field | Header fixed; the rest accepted or left for later; `ttw-253` and `ttw-255` must not be committed with this ticket                               |

Not verified by review 2: e2e runs (forbidden on the shared database), Playwright, the log filter, a real mail send, `apps/web`.

## Verification evidence

Last run 2026-11-24 (after review 2), on branch `codex/ttw-254-confirm-signup-with-an-email-code`, nothing committed.

| Check                                                                                                                                                                       | Result                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API integration suite `apps/api/test/signup-email-code.e2e-spec.ts` (real Postgres and Redis), run with `auth-surface`, `auth-rate-limit` and `google-oauth-linking`        | 76 of 76 pass (32 in the sign-up suite). It was written first and failed 26 of 26 against the missing routes (404)                                                                           |
| API unit tests with coverage (`pnpm --filter api test:coverage`)                                                                                                            | 186 suites, 2370 tests pass                                                                                                                                                                  |
| `pnpm coverage:ratchet`, `pnpm coverage:diff`                                                                                                                               | Pass; diff coverage 153 of 153 changed lines (100 %), floor 80 %                                                                                                                             |
| `pnpm --filter app test`                                                                                                                                                    | 47 suites, 363 tests pass (19 in `__tests__/auth`, written first and failing)                                                                                                                |
| `pnpm typecheck` (6 packages), `pnpm lint` (0 errors), `pnpm format:check`, `pnpm docs:validate`, `pnpm migrations:check`, `pnpm openapi:check`, `pnpm playwright:validate` | All pass                                                                                                                                                                                     |
| Browser journey in `apps/app` (API on port 3011, app on 3002), run before review 1                                                                                          | Form, then code screen (0 users, 1 pending row); wrong code refused on the same screen; right code opens the dashboard; account verified, role CUSTOMER, pending row gone. Test rows deleted |
| Fixture `tests/e2e/fixtures/signup-code.ts` against the real Redis                                                                                                          | Scans the queue's list, stream and counter keys without `WRONGTYPE` (review 2, S1); no code found for an absent address, as expected                                                         |

CI, 2026-11-24:

| Run                                                        | Result                                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CI` on the pushed branch (run 45379879598)                | 19 of 19 jobs green, including API Integration (all e2e suites, `auth-link-retention` included), Unit Tests, Coverage, Migration Baseline            |
| `CI` on `main` after the merge `b9aff2d` (run 45382586979) | 19 of 19 jobs green                                                                                                                                  |
| `Playwright Comprehensive` on `main` (run 45382587063)     | Green. It ran `signup-email-code.comprehensive.spec.ts` and both tests of the adapted `email-verification-banner.comprehensive.spec.ts`, all passing |

Not verified:

- **Playwright was not run locally** (another API occupied port 3001 and the test database is shared). It ran in CI on `main` and passed (see above).
- **`auth-link-retention.e2e-spec.ts`** failed locally ("jobs never failed", 30 s) because another API on the same Redis consumed the shared `mail` queue; it passes in CI.
- **Intermittent failures from other processes.** Two `auth-surface` tests failed once in a grouped run (socket hang up, a 404) and passed alone and again in later grouped runs. Other APIs on this machine share its ports, database and Redis.
- The automatic after-change check failed on product list and checkout app tests (1 s waits, TTW-255) while the machine was saturated (load average above 150); the same suites pass when it is calm.
- Request logging of `code` and `signupToken`: no test; the request serializer logs only id, method and URL (accepted gap). A real mail send and `apps/web` were not tried.

Migration `20261123134156_ttw254_pending_signups` was generated with `prisma migrate dev` on a throwaway database, which was dropped. The e2e global setup applies it to the shared test database.

## Completion summary

Complete. Merged into `main` as `b9aff2d` (feature commit `4319a66`) on 2026-11-24, no pull request, with a green `CI` and a green `Playwright Comprehensive` on `main` (see Verification evidence).

Shipped: a new apps/app sign-up creates no account, session or cookie until the person enters the 6-digit code emailed to them. Three routes (`register/start`, `register/verify`, `register/resend`) and a `pending_signups` table; a keyed code hash; a browser-bound token against pre-hijacking; attempts, cooldown and the hourly send cap enforced in SQL; two Redis rate-limit buckets; identical generic answers so the routes reveal nothing about existing accounts; a one-transaction confirmation that creates or secures the user and opens the session; the mail job, CSRF exemptions, Google clean-up, expired-row cleanup and env validation; a code screen in `apps/app`; API integration, unit, component and Playwright tests; the architecture doc and the OpenAPI artefacts. Two independent reviews are recorded above; no blocker is open.

Deviations from the plan:

- `POST /v1/auth/register` (old route) now answers 409 when the address is taken between its check and its insert, instead of a 500. Found by the race test; the route is otherwise unchanged.
- `register/verify` and `register/resend` take only `signupToken` (and `code`), not the email, so the limiter can key on the token (design review B3).
- Outside production `SIGNUP_CODE_HMAC_KEY` is optional: a key is derived from `JWT_ACCESS_SECRET` with HKDF. Production requires it (at least 32 characters). The user added a development value to the three local env files; **production needs its own value before this is deployed**.
- The hourly send cap is a fixed window enforced in SQL on the row; a refused queue add gives the send back.
- `register/resend` always answers the same generic 202 (review 1 finding 1).
- A unique-address collision on confirm is retried once, then refused (review 2, S5).
- The old Playwright banner test no longer signs up through the form (a form sign-up is now verified); it creates its customer through the old route.
- The Google clean-up deletes the pending row just before Google's transaction, not inside it (accepted).

Operations: set `SIGNUP_CODE_HMAC_KEY` in every production environment (the API refuses to start in production without it). The migration is in the Prisma history and was checked by the Migration Baseline job.

Follow-ups, none ticketed yet: the `apps/web` sign-up (the user has not reviewed that page; noted in the local ROADMAP), which still uses the old route without these protections; existing unverified accounts logging in; an "account already exists" notice; a CAPTCHA if the limits are not enough; no test that `code` and `signupToken` stay out of request logs.
