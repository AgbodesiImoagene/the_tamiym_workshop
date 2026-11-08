# TTW-082 — Link Google sign-in only to confirmed emails

**Epic:** 8 — Client review delivery\
**Status:** Implemented-unverified (committed on the ticket branch, not merged into `main`)\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 1.8, Google sign-in links accounts without a confirmed email** (Critical, P0, 1–2 h, status "To do"): An existing account is linked to a Google account with the same address without checking email_verified. Account takeover risk.

## Proposal

- Read Google's `email_verified` claim and pass it to the account-linking code.
- Link to an existing account, or create one, only when Google confirms the address. Otherwise refuse with the same generic sign-in error.
- Log the refusal without the email address.

## Invariants

- An existing password account is never linked through an unconfirmed Google address.
- Accounts already linked keep signing in.
- Customer and admin surfaces stay separate (TTW-020).

## Implementation plan

1. Start `codex/ttw-082-link-google-sign-in-to-confirmed-emails` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: confirmed, unconfirmed and missing `email_verified`, each with and without an existing account.
- Integration: the callback leaves the existing account unlinked when the claim is false.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/auth/auth.service.ts:575` — row 1.8
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] A Google profile without a confirmed email cannot sign in to, or link with, an existing account.
- [x] Swagger, shared contracts, migrations and docs are updated where applicable. No endpoint, DTO or schema change, so no Swagger, contract or migration change. `docs/14-auth-and-session-architecture.md` threat model has a new row.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Admin Google sign-in → TTW-113.

## Design review

Recorded 2026-11-08, before implementation, on `main` at `dc0e11e`.

**Finding confirmed.** `AuthService.loginWithGoogleProfile` (`apps/api/src/auth/auth.service.ts:576-622`) looks up an existing user by email when no `UserOAuthAccount` matches the Google `sub`, and links it without reading `profile.emailVerified`. It also creates a new account when the email is unconfirmed. `GoogleOAuthService.exchangeCodeForProfile` already maps `email_verified === true` to `emailVerified`, so a missing claim is already `false`.

**Design.**

1. Unchanged: a Google `sub` that is already linked keeps signing in, whatever the current claim (invariant "accounts already linked keep signing in"). The existing surface, status and privileged-role checks still run afterwards.
2. New gate, placed right after the linked lookup and before any email lookup: when `profile.emailVerified !== true`, record `recordAuthLogin({ outcome: 'denied' })`, log a `warn` with no email and no provider id, and throw a generic `UnauthorizedException`. The controller already turns every error into `?error=google_failed`, so the browser sees the same generic error as any other Google failure.
3. Account creation only happens past that gate, so `emailVerifiedAt` is always set at creation.
4. No endpoint, DTO, schema or migration change. No new metric: the existing `auth_login` outcome `denied` covers it.

**Threats considered.** Takeover through an unconfirmed Google address: blocked before the email lookup, so no link row can be written. Email enumeration: the refusal is the same redirect whether or not an account exists. Logs: the refusal log and the controller log carry no email, token or provider id. Concurrency: the gate is a pure check on the verified profile, so it adds no race; the existing unique constraint on `(provider, providerAccountId)` still guards duplicate links.

**Tests planned.** Unit (`auth.service.spec.ts`): confirmed/unconfirmed × existing/no account, already linked + unconfirmed, refusal log without email. Unit (`google-oauth.service.spec.ts`): claim `true`/`false`/missing. Integration (`test/google-oauth-linking.e2e-spec.ts`): real `AppModule` + Postgres, with only the Google provider client replaced: an unconfirmed callback leaves the password account unlinked and sets no session cookie; a confirmed callback links it.

**Noted, out of scope.** An ADMIN account whose Google email is confirmed still gets a link row before the role check refuses the sign-in (`auth.service.ts:656`). Sign-in stays refused. Belongs with TTW-113.

## Implementation reviews

**2026-11-08, independent reviewer (fresh subagent, implementation + security charter), read-only: PASS, no blocking finding.** The reviewer re-ran `pnpm --filter api test -- src/auth/auth.service.spec.ts src/auth/google-oauth.service.spec.ts` (2 suites, 37 tests passed) and confirmed:

- Both `userOAuthAccount.create` calls in `loginWithGoogleProfile` sit after the `emailVerified !== true` gate, and the gate runs before any email lookup, so email case/whitespace, DELETED users and privileged roles cannot bypass it. The gate reads nothing from the database, so it opens no race.
- Already-linked identities keep signing in. Surface and status checks are unchanged. Both refusals return the same generic message, and the controller maps every error to `google_failed`.
- The service warning is a fixed string. The controller's `err.message` carries no email, token or provider id.
- Replacing `GoogleOAuthService` in the e2e follows the same pattern as `PaystackTransactionClient` in `payment-initiation.e2e-spec.ts`.

Non-blocking, handled:

- The ticket wording ("local commit", pending sections) was out of date. Fixed here.
- The "missing claim × with/without account" cases are tested in `google-oauth.service.spec.ts` (missing or non-boolean claim → `emailVerified: false`). `GoogleOAuthProfile.emailVerified` is a `boolean`, so `AuthService` only ever sees `true` or `false`, and both are covered there.

Non-blocking, left as is:

- `test/google-oauth-linking.e2e-spec.ts` repeats the bootstrap of `createE2eApp` (without the `rawBody` hook, which the callback does not need), because the shared helper cannot override providers. `payment-initiation.e2e-spec.ts` does the same. Letting `createE2eApp` accept overrides would be a separate test-harness change.

Pre-existing, out of scope (reported to the user, not fixed here):

- **Account pre-hijacking.** An attacker registers a password account with the victim's email and never confirms it. When the victim later signs in with Google (confirmed email), the Google identity is linked to the attacker's account, the attacker keeps the password, and `emailVerifiedAt` gets filled. Needs its own ticket: refuse the link, or drop the password, when the existing account's email is not confirmed.
- An ADMIN account with a confirmed Google email gets a link row before the role check refuses the sign-in (TTW-113).
- `google-oauth.controller.ts:84` logs the user-supplied `error` query parameter unsanitised (log injection, no PII).

## Verification evidence

Run on 2026-11-08 in worktree `.claude/worktrees/ttw-082`, branch based on local `main` at `dc0e11e`.

**Tests written first, failing for the right reason (before the fix):**

- `pnpm --filter api test -- src/auth/auth.service.spec.ts src/auth/google-oauth.service.spec.ts` → `Tests: 4 failed, 33 passed`. Failing: `refuses to link an existing account when Google has not confirmed the email` ("Received promise resolved instead of rejected": the link and the session were made), `refuses to create an account…`, `gives the same refusal whether or not an account exists…`, `logs the refusal without the email address or provider id`. The claim-mapping tests in `google-oauth.service.spec.ts` already passed: they pin the existing, correct behaviour.
- `pnpm --filter api test:e2e -- test/google-oauth-linking.e2e-spec.ts` with the `main` version of `auth.service.ts` put back temporarily → `Tests: 2 failed, 2 passed`; the unconfirmed callback redirected to `http://localhost:3000/dashboard` instead of `/auth/login?error=google_failed`.

**After the fix:**

| Command                                                                                                                        | Result                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter api test -- src/auth`                                                                                           | 19 suites, 193 tests passed                                                                                                                                                                                                                                                             |
| `pnpm --filter api test:e2e -- test/google-oauth-linking.e2e-spec.ts test/auth-surface.e2e-spec.ts test/auth-role.e2e-spec.ts` | 3 suites, 41 tests passed (3 consecutive runs). A first run had 2 failures in the existing `auth-surface`/`auth-role` suites that did not reproduce in the next 3 runs; output not kept, cause not investigated (possible overlap with another session using the shared test DB/Redis). |
| `pnpm --filter api typecheck`                                                                                                  | passed (`tsc --noEmit`, no output)                                                                                                                                                                                                                                                      |
| `pnpm --filter api lint`                                                                                                       | 0 errors, 14 warnings, all in files this ticket does not touch; `eslint` on the 4 changed files: no output                                                                                                                                                                              |
| `pnpm format:check`                                                                                                            | All matched files use Prettier code style                                                                                                                                                                                                                                               |
| `pnpm docs:validate`                                                                                                           | Documentation validation passed                                                                                                                                                                                                                                                         |
| `pnpm --filter api test:coverage`                                                                                              | 146 suites, 1271 tests passed                                                                                                                                                                                                                                                           |
| `pnpm coverage:ratchet`                                                                                                        | passed (statements 82.36%, branches 65.86%, functions 71.99%, lines 82.59%)                                                                                                                                                                                                             |
| `pnpm coverage:diff` (after `git fetch origin main`)                                                                           | 5/5 changed lines covered (100%), floor 80%                                                                                                                                                                                                                                             |

Not run: Playwright and a browser run. Real Google sign-in cannot be played locally; `test/google-oauth-linking.e2e-spec.ts` drives the real HTTP callback, `AppModule`, Postgres and cookies, with only the Google code exchange replaced.

## Completion summary

- `AuthService.loginWithGoogleProfile` now refuses, before any email lookup, a Google identity that is not yet linked when Google does not confirm the email. The refusal is a generic `UnauthorizedException`, metric outcome `denied`, and a PII-free warning. Accounts are therefore only created with a confirmed email (`emailVerifiedAt` always set).
- Tests: 7 new unit tests in `auth.service.spec.ts`, 4 in the new `google-oauth.service.spec.ts`, 4 integration tests in the new `test/google-oauth-linking.e2e-spec.ts`.
- Docs: new threat-model row in `docs/14-auth-and-session-architecture.md`.
- No deviation from the plan. No endpoint, DTO, schema, migration or OpenAPI change.
- Left to do: merge into `main` and read CI when the user asks; open a ticket for the account pre-hijacking finding above if the user agrees. `docs/tickets/ROADMAP.md` is not ticked yet, to avoid a conflict with parallel ticket work.
