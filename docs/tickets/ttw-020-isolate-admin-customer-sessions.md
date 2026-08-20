# TTW-020 — Isolate admin and customer sessions

**Epic:** 2 — Security and trust boundaries  
**Status:** In review  
**Risk:** High  
**Blocked by:** TTW-003, TTW-004  
**Blocks:** TTW-032, TTW-053

## Background

Password login is surface-agnostic, customer login can issue an admin-role session, and JWT extraction falls back across customer/admin cookie names. With cross-subdomain `SameSite=None` cookies, the intended security boundary and CSRF posture are not enforced server-side.

## Proposal

Make the requested auth surface a trusted server-derived property, permit admin authentication only through the admin flow, use only the cookie for that surface, and reject role/surface mismatch. Adopt and test a deliberate CSRF defense for every cookie-authenticated state change. Normalize password-login email consistently and revoke incompatible sessions during migration.

## Invariants

- Admin credentials/session never authenticate customer surfaces.
- Customer/organiser credentials/session never authenticate admin surfaces.
- Bearer-token use is explicit and cannot silently weaken browser-cookie policy.
- Cross-site state-changing requests fail without valid CSRF evidence.

## Test and observability plan

- Integration matrix across host/surface, role, cookie type, bearer token and CSRF token/origin.
- Playwright uses simultaneous admin/customer contexts and attempts cross-surface reuse.
- Audit/metric mismatches and denied CSRF without logging secrets.

## References

- `apps/api/src/auth/auth.service.ts:339-370` — surface-agnostic password login and unnormalized lookup.
- `apps/api/src/auth/strategies/jwt.strategy.ts:39-63` — cookie fallback.
- `docs/14-auth-and-session-architecture.md` — intended boundary.

## Acceptance criteria

- [x] Threat model and cookie/domain/CSRF decision are documented.
- [x] Server enforces surface/role/cookie matching for login, refresh, me and logout.
- [x] Email normalization and session migration/revocation are covered.
- [x] Integration and Playwright cross-surface denial tests pass.
- [ ] High-risk security and independent implementation review pass.

## Out of scope

- Privileged MFA policy → TTW-023.
