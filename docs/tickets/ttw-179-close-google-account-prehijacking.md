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
- **The clean-up only applies to an account that will actually be signed in**: a role allowed on the customer surface, status `ACTIVE`. For any other account (admin, suspended…), the Google sign-in is refused afterwards anyway, as today, and removing its password would lock it out. Those keep today's behaviour.

Rejected (by the user, for now): deleting addresses/phone/designs; changing the checkout address preselection in `apps/app/app/dashboard/checkout/page.tsx`. Not chosen: the notification outbox (it carries consent/preference policy for marketing-type notices); the user asked for the existing mail queue.

## Invariants

- After a Google sign-in links an ACTIVE customer-surface account (CUSTOMER or ORGANIZER) whose email was unconfirmed, no password set before the link works, and no session issued before the link is accepted. Accounts that are not ACTIVE, or not allowed on the customer surface, are outside this invariant: see "Known limitation" in the design review.
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
- **Residual races** (not fixed here, proposed follow-up):
  - An attacker's `change-password` request already past its password check could write a new hash just after this transaction commits.
  - An attacker's password `login` already past its bcrypt check (`auth.service.ts` `login`) creates its session in a separate transaction that does not re-check the hash, so a login in flight during the commit gets a fresh, valid session. Bounded by the 5-attempts-per-minute login throttle; the reviewer estimates about 1 % per victim Google sign-in for an attacker looping logins.
  - Fix for both: make the session creation and the password update conditional on the hash that was checked (`updateMany` on `{ id, passwordHash }`, refuse when nothing matched).
- **Known limitation (found by the implementation review)**: an unconfirmed account that is SUSPENDED (or ADMIN) takes today's path. The link row and `emailVerifiedAt` are written, and only then is the sign-in refused. If support later reactivates that account, the owner signs in through the already-linked path, with no clean-up, and a pre-registered password still works. ADMIN belongs with TTW-113. For SUSPENDED, the user has to choose: refuse before any write, or accept it as a known limitation.
- **Pre-existing, not changed**: if Redis does not answer, `mailQueue.add` can hang rather than reject; the try/catch only covers rejections. The same applies to the verification and reset emails.

**Tests planned.** Listed under "Test and observability plan".

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

**After the fix (final state):**

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

Not run: Playwright or a browser run. A real Google sign-in cannot be played locally. The e2e drives the real HTTP callback, `AppModule`, Postgres, cookies, password login, `/auth/me` and `/auth/refresh`, with only the Google code exchange replaced. The notice email was not sent through a real SMTP server: templates are stubbed under `NODE_ENV=test`, and the template is rendered for real in `mail.service.spec.ts`.

## Completion summary

- `AuthService.loginWithGoogleProfile`, when a confirmed Google email meets an existing ACTIVE customer-surface account whose email was never confirmed, does all of the following in one transaction:
  - links the account;
  - removes the password and marks the email confirmed;
  - revokes every session;
  - deletes pending reset and verification links;
  - writes the audit entry `auth.password.removed_on_google_link`.

  It then queues the `google-linked-password-removed-email` notice (English, no secret, link to `/dashboard/settings`). A queue failure is logged without the address and does not block the sign-in. Addresses, phone, name and designs are kept.

- Confirmed accounts, already-linked identities and non-active or admin accounts behave as before.
- Tests: 12 new unit tests in `auth.service.spec.ts` (TTW-179 block), 2 in `mail.service.spec.ts`, 1 in `mail.processor.spec.ts`, 2 integration tests in `test/google-oauth-linking.e2e-spec.ts`.
- Docs: threat-model row in `docs/14-auth-and-session-architecture.md`.
- No endpoint, DTO, schema, migration or OpenAPI change.
- Deviation from the plan: none in behaviour. Two tests added after the review, and the invariant was narrowed (see the review).
- Left to do:
  - merge TTW-082 then TTW-179 into `main`, and read CI, when the user asks;
  - user decision on the SUSPENDED known limitation;
  - follow-up ticket for the residual races (password login / change-password conditional on the checked hash);
  - `docs/tickets/ROADMAP.md` not touched, to avoid conflicts with parallel ticket work.
