# TTW-180 — Refuse known public MFA encryption keys in production

**Epic:** 8 — Client review delivery  
**Status:** Not started  
**Risk:** High  
**Blocked by:** None  
**Blocks:** None

## Background

On 2026-11-08, GitGuardian emailed the account owner about a "Generic Encryption Key" exposed in `AgbodesiImoagene/the_tamiym_workshop`, with the push dated 2026-11-08 10:21:19 UTC. The owner confirmed through the alert link that it names `.github/workflows/playwright-matrix.yml`. The only key in that file is the test value of `MFA_TOTP_ENCRYPTION_KEY` (line 67), the AES-256-GCM key that encrypts admin TOTP secrets (`docs/14-auth-and-session-architecture.md:88`).

That test value (`zghUm6jv…zdQ=`) is public and committed in:

- `apps/api/.env.test.example:11`, in the repository since TTW-023 (August 2026, commit `f02098d`);
- `apps/api/src/config/env-validation.spec.ts:20` and `apps/api/src/auth/admin-mfa.service.spec.ts:47-48`;
- the CI workflows `.github/workflows/ci.yml:184` and `:274`, `.github/workflows/playwright-comprehensive.yml:55`, and `.github/workflows/playwright-matrix.yml:67`. The matrix workflow was added on 2026-11-07 (commit `de66332`, TTW-176). It is the file the alert names. The same value in the other files was not flagged.

A second public value sits in `apps/api/.env.example:11`: `AAAA…A=`, which decodes to 32 zero bytes.

The key only protects test data. Nothing is in production, so no real secret has leaked. The weakness is what production accepts:

- `validateEnv` (`apps/api/src/config/env-validation.ts:136-151`) only checks that the key is base64 and decodes to 32 bytes. Both public values pass. The placeholder list `forbiddenPlaceholders` (`env-validation.ts:72-76`) covers JWT secrets only.
- `decodeMfaEncryptionKey` (`apps/api/src/auth/admin-mfa.crypto.ts:24-41`) makes the same checks at use time.
- The production secrets template `infra/runtime/secrets/.env.example` does not list `MFA_TOTP_ENCRYPTION_KEY` at all, while the API requires it (`env-validation.ts:15`). An operator who has to find a value has the two public ones closest to hand.

If either public value reached production, anyone who reads the repository could decrypt every admin TOTP secret stored in the database, and so defeat admin MFA.

## Proposal

To confirm at design review:

1. Under `NODE_ENV=production` only, `validateEnv` refuses `MFA_TOTP_ENCRYPTION_KEY` when its decoded bytes:
   - equal the committed test key; or
   - are all the same byte (covers `AAAA…=` and similar fillers).
     The comparison uses the decoded bytes, so whitespace or padding variants of the same key are caught too.
2. The error names the variable and says to generate a fresh key (`openssl rand -base64 32`). It never prints the value.
3. Development and test boot exactly as today, so that `.env.example` and `.env.test.example` keep working locally.
4. Add `MFA_TOTP_ENCRYPTION_KEY=PLACEHOLDER_MFA_TOTP_ENCRYPTION_KEY` to `infra/runtime/secrets/.env.example`, with the generation command in a comment. The placeholder already fails the 32-byte check.

Option to decide at design review: stop hard-coding the test key in the CI workflows. The jobs would generate a key at run time (for example `openssl rand -base64 32` written to `$GITHUB_ENV`) and pass it to the seed script (`apps/api/scripts/seed-e2e-dummy-data.ts:534`), which must use the same key as the API. This removes the source of future scanner alerts, at the cost of touching four workflow jobs. It does not change production safety, which steps 1–3 cover.

Rejected: rotating the key. Nothing in production was ever encrypted with a public key, so there is nothing to re-encrypt.

Once this ships, the owner can mark the GitGuardian alert as a test credential (false positive) and, if the CI option is kept, as resolved.

## Invariants

- The API refuses to boot in production with a publicly known MFA encryption key.
- Development and test boot exactly as before.
- No log line or error message contains the key value.

## Implementation plan

1. Write the failing unit tests in `env-validation.spec.ts` (see the test plan).
2. Add the production-only refusal in `env-validation.ts`, next to the existing 32-byte check.
3. Add the placeholder and generation comment to `infra/runtime/secrets/.env.example`. Update `docs/14-auth-and-session-architecture.md:88` and the release checklist if they list production secrets.
4. If the design review keeps the CI option, generate the key at run time in the four workflow jobs, and prove it with one green CI run on `main`.

## Test and observability plan

- Unit/component (`apps/api/src/config/env-validation.spec.ts`), with `NODE_ENV=production` and an otherwise valid production config:
  - the committed test key is refused;
  - the same key with surrounding whitespace is refused;
  - `AAAA…=` (32 zero bytes) and another filler (32 identical bytes) are refused;
  - a random 32-byte key is accepted;
  - the error message does not contain the key value.
  - Outside production (`NODE_ENV=development`), both public values are still accepted.
- Integration/e2e: none needed. `validateEnv` is skipped under `NODE_ENV=test` (`env-validation.ts:113-115`), and the e2e suites keep using the test key.
- Failure, retry, and concurrency: not applicable (startup check).
- Logs, metrics, traces, and alerts: startup failure is already fatal and visible in the deploy logs. Check that the new message reveals no value.

## References

- `apps/api/src/config/env-validation.ts:15` — key is required.
- `apps/api/src/config/env-validation.ts:72-76` — placeholder list (JWT only).
- `apps/api/src/config/env-validation.ts:136-151` — current base64 / 32-byte check.
- `apps/api/src/auth/admin-mfa.crypto.ts:24-41` — decode at use time.
- `apps/api/.env.example:11`, `apps/api/.env.test.example:11` — the two public values.
- `.github/workflows/ci.yml:184,274`, `.github/workflows/playwright-comprehensive.yml:55`, `.github/workflows/playwright-matrix.yml:67` — test key in CI.
- `infra/runtime/secrets/.env.example` — production template, key missing.
- `docs/14-auth-and-session-architecture.md:88` — what the key protects.

## Acceptance criteria

- [ ] Under `NODE_ENV=production`, the API refuses to boot with the committed test key or with any 32-identical-byte key, and the error does not print the key.
- [ ] Development and test boot unchanged with the example env files.
- [ ] `infra/runtime/secrets/.env.example` lists `MFA_TOTP_ENCRYPTION_KEY` with a placeholder and the generation command.
- [ ] The CI option is decided at design review and, if kept, CI is green on `main` with a generated key.
- [ ] Required quality gates pass with evidence recorded below (API typecheck, lint, unit tests, coverage diff).

## Out of scope

- Rotating or re-encrypting existing TOTP secrets (none exist in production).
- Rewriting Git history to remove the test key. It is a test value, and it stays in the example files on purpose.
- Other test secrets in the example files (JWT values are already refused by `forbiddenPlaceholders`).

## Design review

Not started.

## Implementation reviews

Not started.

## Verification evidence

Not started.

## Completion summary

Not started.
