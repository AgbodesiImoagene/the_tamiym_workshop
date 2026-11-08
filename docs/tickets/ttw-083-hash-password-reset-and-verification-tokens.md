# TTW-083 — Hash password-reset and email-verification tokens

**Epic:** 8 — Client review delivery\
**Status:** In progress\
**Risk:** High\
**Blocked by:** TTW-005\
**Blocks:** TTW-089

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 1.7, Password reset and verification tokens stored in plain text** (Critical, P0, 2–4 h, status "To do"): Sessions are hashed, these tokens are not. A database leak would allow password resets.

## Proposal

- Store only a digest of each `AuthToken`, the same way sessions and share links do (TTW-023, TTW-026).
- Send the raw token by email only. Look tokens up by digest.
- The migration removes existing plaintext tokens: the project is not in production, so outstanding links can simply stop working.

## Invariants

- No raw reset or verification token is readable in the database.
- A token stays single-use and expiring.
- Tokens never appear in logs.

## Implementation plan

1. Start `codex/ttw-083-hash-password-reset-and-verification-tok` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Generate the migration with `pnpm --filter api exec prisma migrate dev --name <name>`, after checking that no other open ticket has one in flight.
8. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: issue, consume, replay and expiry with digests.
- Integration: reset and verify flows against real Postgres, and the stored value differs from the emailed token.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/prisma/schema.prisma (AuthToken.token)` — row 1.7
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] A database read alone cannot produce a working reset or verification link (`auth-token-hashing.e2e-spec.ts`: the stored row never contains the emailed token, and sending the stored digest is refused for both flows).
- [x] Swagger, shared contracts, migrations and docs are updated where applicable (no DTO or endpoint change, `openapi:check` passes; migration `20261108115106_ttw083_hash_auth_tokens`; `docs/14-auth-and-session-architecture.md`).
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Recorded 2026-11-08, before implementation.

**Finding confirmed on `main` (f9bdf0b).** `apps/api/src/auth/auth.service.ts` wrote the raw token to `auth_tokens.token` (`forgotPassword`, `createVerificationToken`) and looked it up as is (`verifyEmail`, `resetPassword`). The integration test below showed the emailed token in the stored row before the fix. TTW-005 (Blocked by) is Complete. No open client question covers this ticket.

**Design.**

- New `apps/api/src/auth/auth-token.crypto.ts`: `mintAuthToken()` (32 random bytes, hex) and `hashAuthToken()` (SHA-256 hex), the same shape as `auth-session.crypto.ts` (TTW-023) and `designs/design-share.crypto.ts` (TTW-026). A plain SHA-256 is enough: the token has 256 bits of entropy, so no salt or slow hash is needed.
- `AuthToken.token` becomes `tokenHash String @unique`. The redundant `@@index([token])` is dropped (the unique index already covers lookups).
- Issue: store `hashAuthToken(token)`, put only the raw token in the emailed link. Consume: look up by `hashAuthToken(submitted)`.
- Single use under concurrency: consumption is `deleteMany({ where: { id } })` inside the transaction, **before** the user write. `count === 0` means another request consumed it first: 400 `Invalid or expired …`, and nothing is written (no password change, session revocation or audit). Under Postgres READ COMMITTED the second `DELETE` waits for the first transaction, then finds no row. Before this change the second request got a 500 (Prisma P2025 on `delete`).
- Expired token: removed with `deleteMany` (no error if a concurrent request already removed it), then 400.
- Migration: `DELETE FROM "auth_tokens"` first (outstanding links stop working, accepted because the project is not in production; this also clears legacy plaintext REFRESH rows), then the CLI-generated column and index change.
- No DTO or endpoint changes, so OpenAPI stays as it is. Logs: `req.body.token` is already redacted (`app.module.ts`), and no new log line.

**Threats considered.** Database leak: the digest cannot be sent as a token (tested). Replay: rejected (tested). Two simultaneous clicks: one succeeds and one is refused (tested). Timing on lookup: the lookup is a unique-index equality on a digest of attacker input, so nothing about the stored token is revealed.

**Isolation from parallel sessions.** This worktree uses its own dev and test databases (`tamiym_workshop_ttw083`, `tamiym_workshop_test_ttw083`) and Redis DB 13 in its gitignored env files, so its migration and e2e teardown do not affect the TTW-086 session.

## Implementation reviews

**Review 1, 2026-11-08: independent reviewer (fresh agent, correctness + security charter for a High ticket). Verdict: PASS, no blocker.** It checked that no code path still reads or writes the old `token` column, the concurrency of single-use consumption under READ COMMITTED, expiry, log redaction, migration ordering and index names, and that no existing test was weakened. Findings and outcome:

- **S1** (should-fix): verification-token expiry was not tested → fixed: unit test `rejects an expired verification token and removes it`.
- **S2** (should-fix): the e2e "two simultaneous …" tests do not guarantee the race actually overlaps (verification has no bcrypt step between read and transaction) → accepted as is and noted here. The deterministic proof of the `count === 0` path is the unit tests `refuses a reset/verification whose token was consumed by a concurrent request`; the e2e tests prove the end-to-end outcome (one 200, one 400, never a 500).
- **N1** (nit): expiry was not re-checked when consuming → fixed: consumption is `deleteMany({ where: { id, expiresAt: { gt: now } } })`, test `consumes a token only while the database still holds it unexpired` (failed first, then passed).
- **N2** (nit): the migration came from `migrate diff`, not `migrate dev` → recorded under Deviations.

**Out-of-scope observations from the review (reported, not fixed here):**

- The raw link stays readable in the BullMQ mail job data in Redis (`resetUrl`, `verifyUrl`, plus an unused `token` field in the verification job, `auth.service.ts` `enqueueVerificationEmail` / `mail.service.ts`). Failed jobs are kept (`mail.module.ts`, `removeOnFail: { count: 200 }`), so a Redis read gives a valid link until it expires. Candidate follow-up: drop the unused `token` field and shorten retention.
- `forgotPassword` and `createVerificationToken` run `deleteMany` then `create` outside a transaction, so two simultaneous requests can leave two valid links. Pre-existing behaviour.
- `token` in `reset-password.dto.ts` / `verify-email.dto.ts` has no `@MaxLength`. A very long value is only hashed, within the body-parser limit.

## Deviations from the plan

- **Migration generation.** As in TTW-081, `prisma migrate dev --create-only` stops with "Prisma Migrate has detected that the environment is non-interactive" (unique-constraint warning prompt). The SQL comes from the same CLI: `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`, preceded by one hand-written `DELETE FROM "auth_tokens";` explained in the file header. `pnpm migrations:check` confirms there is no drift.
- **Single-use under concurrency.** Not in the original proposal: consumption became a conditional `deleteMany` checked inside the transaction, because two simultaneous clicks used to return a 500 on the second request (seen in the failing e2e test before the fix).
- `docs/tickets/README.md` and `ROADMAP.md` are not changed on this branch: they are updated when the ticket is closed after merge, and leaving them alone avoids conflicts with the parallel TTW-086 branch.

## Verification evidence

Run on 2026-11-08 in worktree `.claude/worktrees/ttw-083` (Node v24.22.1), with dedicated databases `tamiym_workshop_ttw083` / `tamiym_workshop_test_ttw083` and Redis DB 13.

**Tests written first, failing for the right reason (before implementation):**

- `pnpm --filter api test -- src/auth/auth-token.crypto.spec.ts src/auth/auth.service.spec.ts`: crypto suite "Cannot find module './auth-token.crypto'"; 7 failed in the TTW-083 block, e.g. `Expected: "c649…b963" Received: undefined` (no `tokenHash` written) and `Received: {"where": {"token": "raw-reset", …}}` (lookup by raw token); concurrent consumption "Received promise resolved instead of rejected".
- `pnpm --filter api test:e2e -- test/auth-token-hashing.e2e-spec.ts`: 5 failed, 2 passed. The stored row contained the emailed token (`Expected value: not "b43d…241c"`, found in the `SELECT *` values), and the simultaneous-click tests returned a 500 instead of `[200, 400]`. The 2 passing tests (expired reset, digest sent as verification token) are guards that already held.

**After implementation:**

| Command                                                                                                   | Result                                                                          |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm --filter api test -- src/auth`                                                                      | 20 suites, 223 tests passed                                                     |
| `pnpm --filter api test:e2e -- test/auth-token-hashing.e2e-spec.ts test/google-oauth-linking.e2e-spec.ts` | 2 suites, 16 tests passed                                                       |
| `pnpm --filter api test:e2e` (full suite, before the N1 fix)                                              | 24 suites, 147 tests passed                                                     |
| `pnpm test`                                                                                               | exit 0 (api 148 suites / 1320 tests at that point, app 42 tests)                |
| `pnpm --filter api test:coverage`                                                                         | 148 suites, 1322 tests passed                                                   |
| `pnpm coverage:ratchet`                                                                                   | passed (statements 82.98 %, branches 66.51 %, functions 72.57 %, lines 83.23 %) |
| `pnpm coverage:diff` (base `origin/main`)                                                                 | 2 files, 16/16 changed lines covered (100 %)                                    |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check`                                                      | exit 0                                                                          |
| `pnpm migrations:check`                                                                                   | "Prisma schema matches the migrations."                                         |
| `pnpm openapi:check`                                                                                      | "OpenAPI contract drift check passed."                                          |
| `pnpm docs:validate`                                                                                      | "Documentation validation passed."                                              |

Not verified: no browser journey (no visible change; the forgot/reset pages are TTW-089). The migration was applied only to the dedicated local databases.

## Completion summary

- Reset and verification tokens are stored only as `sha256(token)` in `auth_tokens.tokenHash`; the raw token exists only in the emailed link (`apps/api/src/auth/auth-token.crypto.ts`, `auth.service.ts`).
- Consumption is single-use and race-safe: a replay, a simultaneous click or a token that expired meanwhile gets a 400 and writes nothing (previously a 500 on the simultaneous click).
- Migration `20261108115106_ttw083_hash_auth_tokens` removes every existing row: outstanding links stop working.
- State: committed locally on `codex/ttw-083-hash-password-reset-and-verification-tok`. Not pushed or merged. `README.md` / `ROADMAP.md` to be updated when the ticket is closed.
- Remaining: the out-of-scope observations listed under Implementation reviews (raw link in Redis job data is the main one), to be ticketed if wanted. TTW-089 (forgot/reset pages) is unblocked once this is merged.
