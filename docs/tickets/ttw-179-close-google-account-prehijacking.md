# TTW-179 — Close account pre-hijacking through Google sign-in

**Epic:** 8 — Client review delivery\
**Status:** Implemented (committed on the ticket branch, not merged into `main`)\
**Risk:** High\
**Blocked by:** TTW-082 (this branch is cut from `codex/ttw-082-link-google-sign-in-to-confirmed-emails` at `df4b451`, not from `main`; merge TTW-082 into `main` first)\
**Blocks:** None

## Background

Found by the independent review of TTW-082 ("Pre-existing, out of scope" in `docs/tickets/ttw-082-link-google-sign-in-to-confirmed-emails.md`).

`AuthService.loginWithGoogleProfile` (`apps/api/src/auth/auth.service.ts:595-613` on the TTW-082 branch) links a Google identity whose email Google confirms to the existing account found by that email, even when that account never confirmed its email (`emailVerifiedAt` null).

Attack (account pre-hijacking): an attacker registers a password account with the victim's email and never confirms it. When the victim later signs in with Google, the Google identity is linked to that account, `emailVerifiedAt` is filled, and the attacker keeps the password and any open session. The attacker keeps access to an account the victim now uses: orders, addresses, phone, designs.

## Proposal

Rule decided by the user on 2026-11-08 (recorded as decided, not to be reopened). When Google confirms the email and the existing account found by email has `emailVerifiedAt` null:

1. Accept the link and sign in, as today.
2. Remove the password (`passwordHash` set to null; no random password). Password login on such an account then answers the generic `Invalid credentials`; the owner can set a password through "forgot password".
3. Revoke every existing session of the account (`AuthSessionService.revokeAllForUser`) before issuing the new Google session.
4. Delete pending password-reset and email-verification tokens of the account.
5. Write an audit log entry for the password removal.
6. Queue an email to the account's address through the existing mail queue (`MAIL_QUEUE_NAME`): the account is now linked to Google, the password set before the email was confirmed was removed, and the owner should check their saved addresses and phone number. English text, no secret.
7. Delete nothing else: addresses, phone, name and designs stay (a legitimate user cannot be told apart from a victim).

Accounts whose email is already confirmed, and Google identities already linked, keep today's behaviour. Steps 2-5 are atomic with the link (one DB transaction, no network call inside it). The email is queued after the commit.

Technical choices approved with the plan (2026-11-08):

- **Email queue failure does not fail the sign-in.** The protection is already committed; failing would leave a linked account and no session. The failure is logged without the email address.
- ~~The clean-up only applies to ACTIVE accounts~~: superseded by the round-2 decision below for SUSPENDED accounts. ADMIN accounts keep today's behaviour (TTW-113).

Round-2 decisions by the user (2026-11-08, after the first implementation review):

- **Suspended unconfirmed account** (customer-surface role): same clean-up as an active one (link, password removed, sessions revoked, pending links deleted, audit, one transaction). The Google sign-in is still refused (generic `google_failed`). The owner receives a different English email: account now linked to Google, password set before the email was confirmed removed, account currently blocked, contact the support team. So a later reactivation cannot bring the pre-registered password back.
- **Races closed here**: password login and password change only write if the password hash they checked is still the stored one. A password removed in between (by the Google clean-up) wins.

Rejected (by the user, for now): deleting addresses/phone/designs; changing the checkout address preselection in `apps/app/app/dashboard/checkout/page.tsx`. Not chosen: the notification outbox (it carries consent/preference policy for marketing-type notices); the user asked for the existing mail queue.

## Invariants

- After a Google sign-in links a customer-surface account (CUSTOMER or ORGANIZER, ACTIVE or SUSPENDED) whose email was unconfirmed, no password set before the link works, and no session issued before the link is accepted, including a password login or password change already past its password check. ADMIN accounts are outside this invariant (TTW-113).
- A suspended account is never signed in by Google.
- The link, password removal, session revocation, token deletion and audit entry commit together or not at all.
- Confirmed accounts and already-linked identities keep their password and sessions.
- No account data other than the password, sessions and pending one-time tokens is deleted.
- The email and logs carry no token, password or provider id; logs carry no email address.

## Implementation plan

1. Branch `codex/ttw-179-close-google-account-prehijacking` from the TTW-082 branch (`df4b451`).
2. Record the design review below.
3. Tests first: unit (`auth.service.spec.ts`, mail service/processor specs), integration (`test/google-oauth-linking.e2e-spec.ts`); show them failing for the right reason.
4. Implement in `auth.service.ts`; new mail job, `MailService` method, processor case and template.
5. Threat-model row in `docs/14-auth-and-session-architecture.md`.
6. Gates, independent review, evidence below, local commit.

## Test and observability plan

- Unit: unconfirmed customer account → password removed, sessions revoked, tokens deleted, audit written, mail queued after commit, addresses untouched; confirmed account → unchanged; already linked → unchanged; non-active/admin unconfirmed → no clean-up; queue failure → sign-in still succeeds.
- Mail: new `MailService` method renders the new template with the settings URL; processor routes the new job.
- Integration: real `AppModule` + Postgres + cookies, only `GoogleOAuthService` replaced: after the callback, the old password no longer logs in, the old refresh session is refused, pending tokens are gone, addresses stay, the link exists; a confirmed account keeps its password.
- Round 2: suspended unconfirmed account → same clean-up, sign-in refused, "blocked, contact support" email; admin → unchanged; password login/change refused when the checked hash is no longer stored (unit and real-database integration).
- Logs/metrics: one `log` line without email on clean-up, `warn` without email on queue failure; existing `auth_login` metric unchanged; existing `mail` queue metrics cover the new job.

## References

- `apps/api/src/auth/auth.service.ts` `loginWithGoogleProfile` — link by email.
- `apps/api/src/auth/auth-session.service.ts` `revokeAllForUser`.
- `apps/api/src/mail/processors/mail.processor.ts`, `apps/api/src/mail/mail.service.ts` — mail jobs.
- `docs/14-auth-and-session-architecture.md` — threat model.

## Acceptance criteria

- [x] Google sign-in onto an unconfirmed account removes the password, revokes old sessions, deletes pending reset/verification tokens, writes an audit entry, and queues the notice email; all DB changes in one transaction with the link.
- [x] Confirmed accounts and already-linked identities behave as before.
- [x] Addresses, phone, name and designs are untouched.
- [x] A suspended unconfirmed account is secured the same way, stays refused, and its owner is told to contact support.
- [x] A password login or password change whose checked password was removed in between writes nothing.
- [x] Threat-model row updated; no endpoint/DTO/schema change (no Swagger, contract or migration change).
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Checkout address preselection (`apps/app/app/dashboard/checkout/page.tsx`) — rejected by the user for now.
- Admin Google sign-in, and the link row written for an ADMIN account before the role check → TTW-113.

## Design review

Recorded 2026-11-08, before implementation, on the TTW-082 branch at `df4b451`. Plan approved by the user the same day.

**Finding confirmed.** In `loginWithGoogleProfile`, once the Google `sub` is not yet linked and `profile.emailVerified === true`, the `existingByEmail` branch writes a `UserOAuthAccount` row and then, in a separate write, sets `emailVerifiedAt`. `passwordHash`, `AuthSession` rows and `AuthToken` rows are never touched.

**Design.**

1. In the `existingByEmail` branch, after the existing DELETED check, decide `secureUnconfirmed = emailVerifiedAt === null && status === ACTIVE && isRoleAllowedForSurface(role, CUSTOMER)`. Otherwise the branch is unchanged.
2. When `secureUnconfirmed`, one `prisma.$transaction`:
   - create the link row;
   - set `passwordHash: null` and `emailVerifiedAt: now` on the user;
   - `authSession.revokeAllForUser(userId, tx)`;
   - delete `AuthToken` rows of type `PASSWORD_RESET` and `EMAIL_VERIFICATION`;
   - write audit `auth.password.removed_on_google_link`, action `UPDATE`, with only booleans and a count (`hadPassword`, `revokedSessions`), no email or provider id.

   No network call inside.

3. After the commit, `mailQueue.add(JOB_GOOGLE_LINKED_PASSWORD_REMOVED_EMAIL, { to, settingsUrl })`, where `settingsUrl = FRONTEND_URL + /dashboard/settings` (the page with saved addresses and phone). Wrapped in try/catch: a failure logs a `warn` without the email and does not fail the sign-in.
4. Then the existing flow runs: name updates, surface/status/privileged checks (they pass by construction), and `completeLoginSession`, which creates the new session in its own transaction after the revocation.
5. Mail: new constant, `MailService.sendGoogleLinkedPasswordRemovedEmail`, processor case (its log line carries no address), template `google-linked-password-removed.hbs`.
6. No endpoint, DTO, schema or migration change. No new metric: the `mail` queue job metric covers the new job, the audit row records the event.

**Threats considered.**

- **Attacker keeps the password**: it is removed in the same transaction as the link.
- **Attacker keeps an open session**: revoked in that transaction. Access tokens are bound to `sid` and checked against the live session row.
- **Attacker holds a reset or verification link**: deleted.
- **Partial failure**: one transaction, so either everything is committed or nothing is. A failure surfaces as the generic `google_failed`, and the next attempt starts from scratch.
- **Concurrent callbacks**: the unique `(provider, providerAccountId)` makes the second link insert fail and roll back its transaction. The user then signs in through the already-linked path.
- **Enumeration**: no response difference; the email goes only to the account's own address.
- **Logs and email**: no token, password, provider id or email address in logs, and no secret in the email.
- **Races** (found during design and the first review, fixed in round 2, see the addendum):
  - An attacker's `change-password` request already past its password check could write a new hash just after this transaction commits.
  - An attacker's password `login` already past its bcrypt check created its session in a separate transaction that did not re-check the hash.
- **Suspended accounts** (found by the first review, fixed in round 2): an unconfirmed SUSPENDED account took today's path, which wrote the link and `emailVerifiedAt` before refusing. After a reactivation, the pre-registered password still worked. ADMIN stays with TTW-113.
- **Pre-existing, not changed**: if Redis does not answer, `mailQueue.add` can hang rather than reject; the try/catch only covers rejections. The same applies to the verification and reset emails.

**Tests planned.** Listed under "Test and observability plan".

**Addendum, round 2 (2026-11-08, approved by the user before coding).**

1. `needsPreHijackCleanup` replaces the ACTIVE-only test: `emailVerifiedAt === null`, status `ACTIVE` or `SUSPENDED`, customer-surface role. The transaction is unchanged; the audit `after` gains `accountSuspended`. After the commit, an ACTIVE account gets the existing notice, a SUSPENDED one gets `google-linked-account-suspended-email` (new constant, `MailService.sendGoogleLinkedAccountSuspendedEmail`, processor case, template `google-linked-account-suspended.hbs`). The existing status check then refuses the suspended sign-in.
2. `completeLoginSession` takes an optional `checkedPasswordHash`; only the password `login` passes it. When it is given, `lastLoginAt` is stamped with `updateMany({ where: { id, passwordHash: checked } })`, and a count other than 1 records `failure` and throws the same `Invalid credentials` as a wrong password, which rolls back before any session row. The admin-MFA and Google paths keep the unconditional update.
3. `changePassword` updates with `updateMany({ where: { id, passwordHash: checked } })`; a count other than 1 throws `Current password is incorrect` before the revocation and audit.
4. Why it closes the race under PostgreSQL READ COMMITTED: each request's first write is the user-row update.
   - **Login locks first**: the Google clean-up waits on its own user update. After the login commits, the clean-up's `revokeAllForUser` reads the fresh state and revokes the new session.
   - **Clean-up locks first**: the login's conditional update waits, PostgreSQL re-evaluates the condition on the new row, nothing matches, and the login is refused.
   - **No deadlock**: neither side holds a lock the other needs before its first user-row write.

## Implementation reviews

**2026-11-08, independent reviewer (fresh subagent, implementation + security charter), read-only: PASS, no blocking finding.** The reviewer re-ran the three touched unit specs (3 suites, 51 tests passed) and confirmed, with file and line references:

- The single transaction contains the link, `passwordHash: null` + `emailVerifiedAt`, `revokeAllForUser(id, tx)`, the token deletion and the audit, with no network call. The mail is queued after the commit. The new session is created afterwards in `completeLoginSession`.
- Old access JWTs are refused (`jwt.strategy.ts` requires `sid`, `assertAccessSession` rejects revoked sessions). Refresh is race-safe (`rotateSession` is conditional on `revokedAt: null`). Legacy REFRESH rows are purged by `completeLoginSession`.
- No bypass through email case, DELETED, SUSPENDED, ADMIN or the already-linked path. Unconfirmed ORGANIZER accounts are secured. Concurrent callbacks fail on the unique constraint.
- No email, token or provider id in logs, audit or mail. No response difference (no enumeration). The template is copied by `nest-cli.json`, and `/dashboard/settings` shows phone and addresses.

Non-blocking findings and what was done:

1. **Race with a password login in flight**: added to the residual races in the design review, with the proposed follow-up.
2. **Unconfirmed SUSPENDED/ADMIN account written as confirmed before the refusal**: the invariant was narrowed to ACTIVE customer-surface accounts, and the case is recorded as a known limitation. The SUSPENDED case needs a decision from the user (ADMIN → TTW-113).
3. **Test gaps**:
   - Added `makes every clean-up write through the transaction client, none through the root client`: a distinct transaction client, which proves the five writes go through it and none through the root client.
   - Added `also secures an unconfirmed organiser account…`.
   - Not added: an e2e assertion that the job is queued (the processor may consume it immediately; the unit tests cover the job name and payload).
   - Noted as pre-existing: a hanging Redis `add` is not covered by the try/catch.

**2026-11-08, round 2, independent reviewer (fresh subagent, implementation + security + concurrency charter), read-only: PASS, no blocking finding.** The reviewer re-ran the three touched unit specs (3 suites, 62 tests passed) and `tsc --noEmit` (no error), and confirmed:

- The suspended path uses the same single transaction, is still refused with the generic `google_failed`, queues the right email, and puts no address in logs. ADMIN is unchanged.
- The race is closed in both interleavings under READ COMMITTED, with no deadlock. The admin-MFA and Google paths correctly keep the unconditional update. The new refusals return the same response and metric as a wrong password (no enumeration).
- Replacing the "suspended keeps its password" test is consistent with the new rule; the ADMIN case stays tested.

Non-blocking findings and what was done:

1. The race e2e tests return 401/400 even if a future change made the old "no password" check refuse first. Done: they were shown failing without the fix (evidence below).
2. Those tests replay "removal, then write" one after the other, not truly in parallel. The truly concurrent case rests on the locking argument in the addendum. Recorded here.
3. The ticket still described the old rule. Done: proposal, invariants, threat analysis and summary updated.
4. If the status changed to something other than ACTIVE/SUSPENDED between the read and the transaction, the "blocked" email was sent. Done: that email is now sent only when the status is SUSPENDED (`enqueueGoogleLinkedNotice`).

## Verification evidence

Run on 2026-11-08 in worktree `.claude/worktrees/magical-feynman-93d6cb`, branch cut from the TTW-082 branch at `df4b451`, local Postgres (`tamiym_workshop_test`) and Redis.

**Tests written first, failing for the right reason (before the fix):**

- `pnpm --filter api test -- src/auth/auth.service.spec.ts` → `Tests: 5 failed, 38 passed`. Failing:
  - `links, removes the password, revokes sessions and deletes pending tokens in one transaction`: no `passwordHash: null` update;
  - `writes an audit entry for the password removal…`: no such entry;
  - `queues the notice email after the transaction commits…`: 0 calls;
  - `does not sign in or send the email when the transaction fails`: a session was created;
  - `still signs in when the notice email cannot be queued…`: nothing was queued, so no warning.

  The confirmed, already-linked, suspended, admin and "deletes nothing else" tests already passed: they pin today's behaviour.

- `pnpm --filter api test -- src/mail/mail.service.spec.ts src/mail/processors/mail.processor.spec.ts` → `3 failed, 5 passed`: `sendGoogleLinkedPasswordRemovedEmail is not a function`, `ENOENT … google-linked-password-removed.hbs`, `Unknown mail job name`.
- `pnpm --filter api test:e2e -- test/google-oauth-linking.e2e-spec.ts` → `1 failed, 5 passed`: `removes the old password…` failed with `expected 401 "Unauthorized", got 200 "OK"` on the password login after the Google callback. The old password still worked.

**After the first fix (commit `ff3f8d8`):**

| Command                                                               | Result                                                                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter api test -- src/auth/auth.service.spec.ts`             | 45 tests passed                                                                                                |
| `pnpm --filter api test:e2e -- test/google-oauth-linking.e2e-spec.ts` | 6 tests passed (only this spec was run, as agreed with the parallel TTW-084 session)                           |
| `pnpm --filter api typecheck`                                         | passed (exit 0)                                                                                                |
| `pnpm --filter api lint`                                              | 0 errors; existing warnings in files this ticket does not touch. `eslint` on the 8 changed TS files: no output |
| `pnpm format:check`                                                   | All matched files use Prettier code style                                                                      |
| `pnpm docs:validate`                                                  | Documentation validation passed                                                                                |
| `pnpm --filter api test:coverage`                                     | 146 suites, 1286 tests passed                                                                                  |
| `pnpm coverage:ratchet`                                               | passed (statements 82.45%, branches 65.92%, functions 72.08%, lines 82.69%)                                    |
| `pnpm coverage:diff` (after `git fetch origin main`)                  | 30/30 changed lines covered (100%), floor 80%                                                                  |

**Round 2: tests written first, failing for the right reason (before the change):**

- `pnpm --filter api test -- src/auth/auth.service.spec.ts` → `Tests: 6 failed, 45 passed`. Failing:
  - `links and secures the account, then still refuses the sign-in`: no `passwordHash: null` update;
  - `queues the "account blocked, contact support" notice…`: 0 calls;
  - `opens the password-login session only if the checked password is still the stored one`: no conditional update;
  - `refuses the password login and opens no session when the password changed meanwhile`: "Received promise resolved instead of rejected";
  - `changes the password only if the checked current password…`: no conditional update;
  - `refuses the change and writes nothing else when the password was removed meanwhile`: resolved instead of rejected.
- Mail specs → `3 failed, 8 passed`: method missing, template missing, unknown job name.
- `pnpm --filter api test:e2e -- test/google-oauth-linking.e2e-spec.ts`: the new `secures a suspended unconfirmed account…` failed on `expect(after.passwordHash).toBeNull()`.
- The two race e2e tests (`opens no session for a password login whose password was removed meanwhile`, `does not set a new password when the checked one was removed meanwhile`) were written after the code. They were then shown failing with the two conditional `where` clauses put back temporarily to `{ id }`: `expected 401 "Unauthorized", got 200 "OK"` and `expected 400 "Bad Request", got 200 "OK"`. The file was restored from a copy afterwards.
- A single run had `removes the old password…` fail with `expected 401, got 403` on the old-session `/auth/me` call. Three consecutive runs with the response logged returned `401 "User not found"`, and it did not come back. Cause not found; possibly the parallel session sharing the test database and Redis.

**After round 2 (final state):**

| Command                                                               | Result                                                                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter api test -- src/auth/auth.service.spec.ts`             | 51 tests passed                                                                                                           |
| `pnpm --filter api test:e2e -- test/google-oauth-linking.e2e-spec.ts` | 9 tests passed (only this spec was run)                                                                                   |
| `pnpm --filter api typecheck`                                         | passed (exit 0)                                                                                                           |
| `pnpm --filter api lint`                                              | 0 errors, 14 existing warnings in files this ticket does not touch; `eslint` on the 8 changed TS files: exit 0, no output |
| `pnpm format:check`                                                   | All matched files use Prettier code style                                                                                 |
| `pnpm docs:validate`                                                  | Documentation validation passed                                                                                           |
| `pnpm --filter api test:coverage`                                     | 146 suites, 1295 tests passed                                                                                             |
| `pnpm coverage:ratchet`                                               | passed (statements 82.48%, branches 65.96%, functions 72.10%, lines 82.71%)                                               |
| `pnpm coverage:diff` (base `origin/main`)                             | 48/48 changed lines covered (100%), floor 80%                                                                             |

Not run: Playwright or a browser run. A real Google sign-in cannot be played locally. The e2e drives the real HTTP callback, `AppModule`, Postgres, cookies, password login, `/auth/me` and `/auth/refresh`, with only the Google code exchange replaced. The notice email was not sent through a real SMTP server: templates are stubbed under `NODE_ENV=test`, and the template is rendered for real in `mail.service.spec.ts`.

## Completion summary

- `AuthService.loginWithGoogleProfile`: when a confirmed Google email meets an existing customer or organiser account (ACTIVE or SUSPENDED) whose email was never confirmed, one transaction does all of the following:
  - links the account;
  - removes the password and marks the email confirmed;
  - revokes every session;
  - deletes pending reset and verification links;
  - writes the audit entry `auth.password.removed_on_google_link`.

  After the commit:
  - an active account is signed in and receives the `google-linked-password-removed-email` notice (check addresses and phone, link to `/dashboard/settings`);
  - a suspended account is still refused and receives `google-linked-account-suspended-email` (contact support).

  Both emails are in English and carry no secret. A queue failure is logged without the address and changes nothing. Addresses, phone, name and designs are kept.

- Password login and password change now only write if the password they checked is still stored, so a password removed in between always wins.
- Unchanged: confirmed accounts, already-linked identities and admin accounts (TTW-113).
- Tests:
  - `auth.service.spec.ts`: 18 unit tests in the TTW-179 blocks;
  - mail: 4 tests in `mail.service.spec.ts`, 2 in `mail.processor.spec.ts`;
  - `test/google-oauth-linking.e2e-spec.ts`: 5 integration tests.
- Docs: threat-model row in `docs/14-auth-and-session-architecture.md`.
- No endpoint, DTO, schema, migration or OpenAPI change.
- Deviations: the round-2 scope (suspended accounts, races) was added at the user's request after the first review; one first-round test pinning "suspended keeps its password" was replaced because the rule changed.
- Left to do:
  - merge TTW-082 then TTW-179 into `main` and read CI, when the user asks;
  - `docs/tickets/ROADMAP.md` was not touched, to avoid conflicts with parallel ticket work.
