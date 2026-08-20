# TTW-023 — Enforce account and privileged-auth policy

**Epic:** 2 — Security and trust boundaries  
**Status:** In progress
**Risk:** High  
**Blocked by:** TTW-003, TTW-004, TTW-020  
**Blocks:** TTW-030, TTW-032, TTW-042, TTW-053, TTW-054

## Background

Email verification exists but is not required by login or business actions. Login/resend/reset throttles are local endpoint counters rather than an explicit distributed abuse policy. Refresh tokens are rows without a named session/audience, while access JWTs remain usable until expiry after logout or role change. Admin UI copy claims verified-only access, but the API does not enforce verification and has no MFA.

## Proposal

Adopt these v1 product decisions: unverified customers may sign in and complete verification, but cannot create an order, apply as an organiser, or manage payout details; organiser and admin access always requires a verified email. Admin console authentication requires TOTP after primary authentication, with encrypted secrets and one-time hashed recovery codes. Use Redis-backed throttling keyed by both normalized identity and trusted client IP, with stricter admin/recovery buckets and generic responses.

Replace bare refresh-token rows with named, audience-bound sessions (`customer` or `admin`) carrying a hashed rotating refresh credential, creation/last-seen/expiry/revocation metadata, and optional coarse device label. Put a session id/audience in access JWTs and make guards reject revoked or mismatched sessions. Password reset/change, account suspension/deletion, role change, recovery-code use, and security-sensitive admin action revoke the defined session set immediately. Provide customer session listing/revocation and admin “sign out all” controls without exposing tokens or precise fingerprinting data.

## Invariants

- Verification and MFA requirements are enforced by API policy, never only by UI visibility.
- A revoked, expired, rotated, or wrong-audience session cannot refresh or authorize an access JWT.
- Refresh credentials and MFA recovery codes are stored only as irreversible hashes; TOTP secrets are encrypted with a rotatable application key.
- Rate limits work across API replicas and cannot be bypassed by changing email case or trusting arbitrary forwarded-IP headers.
- Auth responses and telemetry do not disclose whether an account exists, its MFA enrollment, tokens, secrets, or recovery codes.

## Implementation plan

1. Record the auth threat model and endpoint/action matrix for verification, reauthentication, MFA, session TTL, revocation, and throttling; document trusted-proxy configuration.
2. Add session and MFA schema/migrations, partial/unique constraints, secret encryption versioning, hashed token utilities, and a migration that safely revokes legacy refresh tokens.
3. Centralize verified-account/action policy and enforce it on order creation, organiser application, payout-profile mutation, and all admin entry points. Return a stable machine-readable error code for frontend guidance.
4. Implement admin TOTP enrollment/challenge/recovery and require completion before an admin session is issued. Provide audited reset/recovery operations with no production bypass.
5. Issue audience/session-bound access and rotating refresh credentials; implement list, revoke-one, and revoke-all APIs and the required app/admin UI.
6. Move auth/recovery throttles to the shared Redis store with identity+IP keys, escalation windows, generic errors, metrics, and operator alerts.
7. Update Swagger/shared types, environment validation, recovery runbook, deployment secrets, and Playwright role setup.

## Test and observability plan

- Unit/component: action-policy matrix, normalized throttle keys, token hashing/rotation, TOTP windows, recovery-code single use, redaction, and session UI states.
- Integration/e2e: real Redis/PostgreSQL tests for enrollment, challenge, refresh rotation, revoke-one/all, password/role/status revocation, verification gates, audience mismatch, and multi-replica throttling semantics.
- Failure, retry, and concurrency: concurrent refresh permits one winner; replayed recovery codes fail; Redis/MFA-secret-provider failure is fail-closed for privileged access; clock-skew boundaries are tested.
- Logs, metrics, traces, and alerts: aggregate login/challenge/throttle/revocation outcomes by surface without identity or secret labels; alert on admin recovery/reset and abnormal privileged failures.

## References

- `apps/api/src/auth/auth.service.ts:65-100` — registration issues verification but creates an ACTIVE customer.
- `apps/api/src/auth/auth.service.ts:339-377` — password login does not enforce verification.
- `apps/api/src/auth/auth.service.ts:523-587` — stateless access JWT and bare refresh token issuance.
- `apps/api/src/auth/auth.service.ts:594-672` — refresh rotation has no session/audience contract.
- `apps/api/src/auth/auth.controller.ts:55-238` — endpoint-local throttling and recovery surfaces.
- `apps/api/src/constants.ts:24-53` — current shared TTL and throttle constants.
- `apps/api/prisma/schema.prisma:335-402` — user verification and generic `AuthToken` storage.
- `apps/api/src/admin/admin-users.service.ts:104-117` — role change revokes refresh tokens but not issued access JWTs.
- `apps/admin/app/auth/login/page.tsx:113` — verified-admin promise is currently UI copy only.

## Acceptance criteria

- [ ] The approved action matrix is documented and enforced consistently by reusable API policy.
- [ ] Unverified customers can verify but cannot order, apply as organiser, or mutate payout details; organiser/admin access requires verification.
- [ ] Every admin login completes TOTP or a single-use recovery path before an admin session is issued.
- [ ] Sessions are audience-bound, rotating, listable, immediately revocable, and contain no plaintext refresh credentials.
- [ ] Concurrent refresh/replay, role/status/password revocation, and cross-surface denial pass against PostgreSQL and Redis.
- [ ] Distributed identity+IP rate limits, trusted-proxy handling, generic responses, metrics, and alerts are proven.
- [ ] Swagger/shared contracts, migration/rollback, key rotation, account recovery, and admin MFA reset runbooks are complete.
- [ ] Playwright covers verify-to-checkout, admin enrollment/challenge/recovery, session revocation, and accessible error/recovery states.
- [ ] High-risk security and independent implementation review pass.

## Out of scope

- Cookie names, CSRF, and customer/admin surface isolation → TTW-020.
- Organiser business eligibility and approval workflow → TTW-030.
- Payout KYC and step-up rules beyond account authentication → TTW-042.

## Design review

**Reviewer:** implementing agent — 2026-08-20\
**Verdict:** APPROVED for verification-policy slice; MFA/sessions/Redis throttles deferred within this ticket.

**Action matrix (v1, from ticket proposal):**
| Actor | May login unverified? | Gated until verified |
| CUSTOMER | Yes | CREATE_ORDER, MUTATE_PAYOUT_PROFILE, APPLY_AS_ORGANISER (stub for TTW-030) |
| ORGANIZER / ADMIN | No — must verify before login/refresh/JWT | Privileged access |

**Blast radius:** `AccountPolicyService`; order create paths; payout profile mutate; login/refresh/JWT/Google; password-reset refresh revoke.

**Error contract:** `403` body `{ code: 'EMAIL_NOT_VERIFIED', action, message }` for frontend guidance.

**Deferred (same ticket):** admin TOTP + recovery codes; named hashed sessions with list/revoke; Redis identity+IP throttles; Playwright MFA/session suites.

## Implementation reviews

**Security (slice 1):** PASS — auth boundary uses generic 401; `EMAIL_NOT_VERIFIED` only on post-auth action gates. Residual (non-blocking): payment initiation not gated for legacy pending orders.

**Implementation (slice 1):** PASS — OpenAPI notes on order/campaign-order/payout mutate; privileged 403 helper removed; service-boundary `code`/`action` assertions; 60 related unit tests green.

## Verification evidence

- Unit: `account-policy`, `auth.service`, `jwt.strategy`, `orders.service`, `payout-profiles.service` (60 tests).
- Diff coverage vs `origin/main`: ≥80% (`pnpm coverage:diff` + CI Coverage).
- E2e: `auth-surface` privileged fixtures set `emailVerifiedAt`; CI API Integration green.
- CI: all checks green on https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/32383125073
- PR: https://github.com/AgbodesiImoagene/the_tamiym_workshop/pull/30

## Completion summary

Slice 1 (verified-email action policy) shipped. Remaining same-ticket work: admin TOTP + recovery, named hashed sessions, Redis identity+IP throttles, Playwright suites.
