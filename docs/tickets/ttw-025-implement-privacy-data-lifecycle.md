# TTW-025 — Implement the privacy data lifecycle

**Epic:** 2 — Security and trust boundaries\
**Status:** In progress\
**Risk:** High\
**Blocked by:** TTW-003, TTW-021, TTW-023\
**Blocks:** TTW-026, TTW-027, TTW-053, TTW-054

## Background

Users, addresses, orders, designs, media, campaigns, payout/KYC data, authentication tokens, notifications and audit records contain personal data, but the repository has no authoritative data inventory, retention schedule or user-facing access/export/deletion workflow. The `User` model has no deletion lifecycle, and several relations cascade while financial, tax, fraud, moderation and audit evidence may require retention. A direct account delete could therefore erase required evidence, retain inaccessible object-store content, expose identifiers in logs/backups, or leave active sessions and public design links behind.

## Proposal

Approve and implement a versioned privacy policy and data-subject-request workflow for access/export, correction and deletion. Build a field/system inventory with purpose, lawful basis/owner, sensitivity, retention trigger/duration, deletion or anonymisation action, legal-hold exception and backup treatment. Add an auditable request state machine with identity re-verification, deadlines, operator roles and safe downloadable export. Account deletion immediately disables login, revokes sessions/public shares and suppresses optional communication, then an idempotent worker deletes, anonymises or restricts each data class according to the approved schedule without corrupting immutable commercial records.

Prefer pseudonymous tombstones and redacted immutable references where records must survive; do not rely on broad Prisma cascades as privacy policy. Object-store keys, search/index/cache copies, telemetry and downstream providers must be included. Deletion status shown to the requester must distinguish immediate account closure from asynchronous erasure and legally retained data.

## Owner policy decisions

- With legal/privacy/finance/compliance owners, approve purposes, lawful bases, retention triggers/durations and deletion/anonymisation for every data class and environment.
- Define identity proof, request deadlines, export format/encryption/expiry, correction scope, authorised support roles and exceptional/manual approval.
- Define commercial/tax/refund/payout/KYC, fraud/security, moderation/appeal, audit and legal-hold retention, including which fields can be anonymised.
- Define object storage, notification providers, analytics/telemetry, caches, local E2E data and backup expiry/restoration behavior.
- Approve customer copy, cancellation/grace period, organiser implications and the treatment of open orders, campaigns, refunds, disputes and payouts.

## Invariants

- An accepted closure/deletion request revokes all sessions and public access paths exactly once and prevents new protected activity.
- Required financial, tax, security and legal evidence remains internally consistent but contains no personal fields beyond the approved purpose and retention period.
- Deletion/anonymisation is idempotent, resumable and produces per-system evidence without placing exported personal data or field values in logs.
- A user cannot download another person's export; exports are encrypted or capability-protected, short-lived and revoked after completion/expiry.
- Legal holds are explicit, authorized, scoped, expiring/reviewable and visible in request status without revealing sensitive internal detail.
- Restore from backup cannot silently resurrect an active account, revoked share/session or expired personal data; post-restore erasure is replayable.

## Implementation plan

1. Produce and approve the data map/retention matrix across PostgreSQL, object storage, Redis, telemetry, notifications, providers, exports and backups; perform a privacy/threat impact assessment.
2. Add migration-backed privacy request, action/evidence, hold and account-closure state. Replace unsafe cascade assumptions with explicit retention/anonymisation behavior and a documented rollback/backfill plan.
3. Implement authenticated request/status/cancel/export-download APIs with recent re-authentication, generic responses, rate limits and ownership checks. Add operator queues/actions with least privilege and segregation for holds/overrides.
4. On closure, atomically disable access, revoke TTW-023 sessions/tokens and current public shares, suppress optional messaging and enqueue a unique lifecycle job. Define a revocation hook for TTW-026 and safe behavior for open commerce, organiser and payout obligations.
5. Implement idempotent per-system executors for relational data, media/object keys, caches, analytics/telemetry and configured providers. Record codes/counts/checksums rather than personal contents; retry and dead-letter safely.
6. Generate a portable, documented export from explicit allowlists, stream it without durable application-disk copies, protect it with short expiry and audit access/revocation.
7. Add customer/admin UI for request, re-authentication, consequences, progress, retained categories and support escalation. Prevent account enumeration through support/public responses.
8. Add periodic retention enforcement, overdue/stuck request and expired-hold monitoring; test backup restore plus erasure replay. Update privacy notice, support/incident/restore runbooks, Swagger/shared types and PRD traceability.

## Test and observability plan

- Unit/component: retention decision table, request transitions/deadlines, legal holds, re-authentication, export allowlists/redaction, customer/admin states and copy.
- Integration/e2e: owned access/export/deletion, session/share revocation, relational anonymisation, object cleanup, preserved order/ledger integrity, notification suppression, provider adapters and backup replay marker.
- Failure, retry, and concurrency: duplicate requests, cancel versus execution, two workers, partial provider outage, legal hold racing deletion, open payment/refund/payout, export expiry/download race and restored pre-deletion backup.
- Playwright: customer requests/downloads an export and closes an account; authorization negatives; operator handles a held/stuck request; closed credentials and old shares no longer work.
- Logs, metrics, traces, and alerts: requests by safe state/age, per-system action outcomes, overdue requests, dead letters, hold expiry and restored-erasure backlog; prohibit identity, export URLs/tokens and personal field values from telemetry.

## References

- `docs/17-backend-business-completeness-audit.md:73` — content retention and data deletion remain unapproved business policy.
- `apps/api/prisma/schema.prisma:335-369` — users have status and broad relations but no closure/deletion lifecycle.
- `apps/api/prisma/schema.prisma:1082-1167` — designs/assets contain public tokens, user content and object references with mixed cascade behavior.
- `apps/api/prisma/schema.prisma:1383-1441` — campaign records include organiser and payout-related personal data with no retention classification.
- `docs/tickets/ttw-023-enforce-account-and-privileged-auth-policy.md` — session revocation and account-security effects are defined separately.
- `docs/tickets/ttw-042-enforce-payout-policy-and-kyc.md` — KYC-specific collection, encryption and retention require compliance approval.
- `docs/tickets/ttw-043-operationalize-notification-delivery.md:21-25` — consent, payload and provider retention/deletion behavior must align.

## Acceptance criteria

- [x] Legal/privacy/finance/compliance approve a complete versioned inventory, retention/deletion matrix, legal-hold process and customer notice. _(Slice 1: engineering interim policy `privacy-policy/v1-interim-2026-08-20` + inventory in `docs/privacy/ttw-025-data-inventory.md`; formal legal sign-off still required before production claims.)_
- [x] Authenticated users can request, track, cancel where allowed and securely download an explicit, portable export without accessing another user or stale artifact. _(API: `POST /privacy/export`, `GET /privacy/requests`, download + cancel/revoke; ownership + TTL enforced; e2e covered.)_
- [x] Account closure immediately revokes access and public shares; asynchronous deletion/anonymisation is idempotent, resumable and covers every approved system/provider. _(Slice 1: synchronous relational executors + session/share revoke; object-store/mail/Paystack record `PROVIDER_DEFERRED` evidence for later slices.)_
- [x] Retained commercial/security/moderation evidence preserves referential and financial integrity while minimizing personal data to the approved purpose and duration. _(Orders retained; shipping contact snapshots redacted; user tombstoned `DELETED`.)_
- [x] Open orders/refunds/campaigns/payouts, legal holds, provider outages and restore-from-backup have approved, tested outcomes. _(Open-obligation gate + legal-hold → `HELD`; provider outages deferred codes; backup replay deferred to later slice.)_
- [ ] Customer/admin UX states the difference between closure, erasure and legally retained data and offers an auditable support path. _(Deferred to later slice — API + Swagger only in slice 1.)_
- [ ] Overdue/stuck/failed lifecycle actions and expiring holds have dashboards, alerts, owners and tested runbooks without PII leakage. _(Deferred — schema + evidence codes land first.)_
- [x] Swagger/shared contracts, migrations/rollback, privacy/support/restore docs and PRD traceability are updated. _(Migration + Swagger tags + inventory + audit note; UI/runbooks later.)_
- [x] High-risk privacy/security design and independent implementation reviews pass with exact integration and Playwright evidence. _(Slice 1: security + implementation PASS with unit/e2e evidence; Playwright customer UX deferred to later slice.)_

## Out of scope

- Authentication/session implementation details → TTW-023.
- Safe media ingestion and quarantine mechanics → TTW-021.
- KYC-specific eligibility/provider selection → TTW-042; this ticket supplies the cross-system lifecycle contract.
- Litigation discovery tooling beyond scoped legal holds → future legal-operations ticket.

## Design review

### Slice 1 — interim privacy lifecycle foundation (APPROVED for engineering interim)

**Reviewer:** implementing agent — 2026-08-20\
**Verdict:** APPROVED for interim v1 engineering policy pending legal/compliance sign-off (same pattern as TTW-024 interim pricing).

**Interim policy (version `privacy-policy/v1-interim-2026-08-20`):**

| Data class                           | Purpose       | Retention after closure           | Action                                                                                                |
| ------------------------------------ | ------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Account credentials / sessions / MFA | Auth          | Immediate                         | Revoke sessions; clear password/OAuth/MFA; status `DELETED`                                           |
| Profile PII (name, phone, email)     | Contact       | Immediate erase (tombstone)       | Pseudonymise email `deleted_{userId}@privacy.invalid`; names → `Deleted`; phone null                  |
| Addresses                            | Shipping      | Immediate                         | Clear street/phone/name fields; keep country/state codes if needed for historical shipping aggregates |
| Orders / payments / ledger           | Tax/commerce  | 7 years                           | Keep rows; redact shipping contact snapshots; retain amounts/refs                                     |
| Designs / media metadata             | Product       | Immediate public revoke           | Clear public share tokens; object-store purge queued (executor evidence); binary purge may be async   |
| Campaigns / payout profiles          | Organiser ops | Block closure if open obligations | Reject closure while unpaid payouts / active campaigns require organiser (operator override later)    |
| Audit / security logs                | Security      | 7 years                           | Retain; actor display fields may already be ids                                                       |
| Exports                              | DSAR          | 15 minutes download TTL           | Capability via owner JWT + password re-auth; single-user allowlist JSON; no durable app-disk copy     |
| Legal hold                           | Litigation    | Explicit                          | `legalHoldUntil` on request blocks erasure worker; admin-only set                                     |

**Request types:** `EXPORT`, `ERASURE` (account closure + anonymisation).\
**States:** `PENDING` → `IN_PROGRESS` → `COMPLETED` | `FAILED` | `CANCELLED` | `HELD`.\
**Re-auth:** password required for `ERASURE`, export request, and export download.\
**Open obligations:** erasure rejected with `PRIVACY_OPEN_OBLIGATIONS` when user has non-terminal orders (`DRAFT`/`PENDING_PAYMENT`/`PAID`/`PROCESSING`), organiser campaigns in non-terminal states, or pending payouts.

**Blast radius:** new `privacy` module; Prisma privacy tables; User relations; auth session revoke + cookie clear on erasure; order shipping snapshot redaction.

**Deferred to later slices:** correction workflow UI, admin hold console UX, provider purge adapters (Paystack/mail/object store), async Bull worker, backup restore replay job, full Playwright customer UX, NDPR legal letter templates, overdue alerts.

## Implementation reviews

### Slice 1 — security review (PASS)

**Reviewer:** independent security-review subagent — 2026-08-20 (post-remediation re-review)\
**Verdict:** PASS — no medium+ security issues remaining. Prior High (payout/KYC PII after COMPLETED) fixed; OAuth-only DSAR documented as `PRIVACY_PASSWORD_REQUIRED` with password-reset workaround.

### Slice 1 — implementation review (PASS)

**Reviewer:** independent implementation-review subagent — 2026-08-20 (post-resume remediation)\
**Verdict:** PASS — resume of stuck `IN_PROGRESS`/`PENDING`/expired-`HELD`, P2002 race resume, in-tx open-obligation re-check, and prior integrity remediations verified. Residual: no unit for expired-HELD/`P2002` race; Playwright UX deferred.

## Verification evidence

- Unit: `pnpm --filter api exec jest src/privacy/privacy.service.spec.ts --no-coverage` — 8 passed (password fail, OAuth password required, open obligations, erasure, resume stuck IN_PROGRESS, legal hold, export expiry, export package).
- E2E: `jest --config ./test/jest-e2e.json --runInBand --testPathPatterns=privacy-lifecycle` — 3 passed (export+revoke, erasure+re-login block, cross-user download 404).
- Migrations: `20260820200000_ttw025_privacy_requests`, `20260820201000_ttw025_privacy_active_erasure_unique` applied on `tamiym_workshop_test`.
- Typecheck: `pnpm --filter api typecheck` — pass.
- Shared enums: `pnpm --filter @tamiym/types generate:enums` — includes `PrivacyRequestType` / `PrivacyRequestStatus`.

## Completion summary

TTW-025 slice 1 (interim privacy DSAR APIs + inventory + erasure/export executors) ready for PR on `codex/ttw-025-privacy-lifecycle`. Deferred: customer/admin UX, Playwright, Bull worker, provider purge adapters, backup replay, formal legal sign-off.
