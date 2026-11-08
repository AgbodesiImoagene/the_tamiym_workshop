# TTW-184 — Keep raw reset and verification links out of retained Redis jobs

**Epic:** 8 — Client review delivery  
**Status:** Scoped  
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

- [ ] A Redis read alone cannot produce a working reset or verification link once the send has failed for good.
- [ ] Failed auth emails remain visible to operations without secrets or PII.
- [ ] Docs (`docs/14-auth-and-session-architecture.md`) are updated.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- `mail.processor.ts` logs the recipient address on success for verification and reset emails ("Sent verification email to …"), which the logging rule forbids. TTW-179 already removed the address from its own log line. Worth fixing, but it is a separate PII-in-logs issue: fold it in only if the design review agrees.
- Two simultaneous reset requests can leave two valid links (`deleteMany` then `create` outside a transaction). Pre-existing, noted in TTW-083.
- No `@MaxLength` on `token` in `reset-password.dto.ts` / `verify-email.dto.ts`. Noted in TTW-083.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
