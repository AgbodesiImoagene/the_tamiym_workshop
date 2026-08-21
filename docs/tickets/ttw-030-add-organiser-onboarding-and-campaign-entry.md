# TTW-030 — Add organiser onboarding and campaign entry

**Epic:** 3 — Complete customer and fundraiser revenue journeys  
**Status:** In progress — slice 1 implemented  
**Risk:** High  
**Blocked by:** TTW-003, TTW-004, TTW-023  
**Blocks:** TTW-035, TTW-042, TTW-053

## Background

Campaign creation and payout-profile APIs require `ORGANIZER` or `ADMIN`, but every registration creates a `CUSTOMER`. The customer fundraiser page detects the resulting 403 and only says organiser access is required. An admin can directly change any user role, but there is no application, eligibility evidence, approval queue, customer status, or campaign-creation CTA. A new customer therefore has no product-supported route into fundraising.

## Proposal

Adopt an admin-approved v1 onboarding model. An ACTIVE customer with a verified email, first/last name, phone, and accepted current organiser terms may submit one open application containing an organisation/display name and short intended-use statement. Bank details are not required until campaign activation/payout readiness. Rejected applicants see the reason and may submit a new version; prior decisions remain immutable history.

Add an `OrganizerApplication` lifecycle (`PENDING`, `APPROVED`, `REJECTED`, `WITHDRAWN`) with reviewer, timestamps, terms version/acceptance, reason, and audit metadata. Enforce at most one open application per user in PostgreSQL. Add self-service status/submit/withdraw endpoints and an admin queue/detail/approve/reject flow. Approval atomically marks the application approved, changes `CUSTOMER` to `ORGANIZER`, revokes incompatible sessions through TTW-023, audits the decision, and creates one applicant notification. Generic admin role changes must not silently bypass this workflow: a CUSTOMER→ORGANIZER override requires a reason and creates an equivalent approved application record.

Replace the locked fundraiser state with eligibility/application/status UI. Once approved, show a “Create fundraiser” entry that creates a DRAFT campaign from the existing core fields and opens its owned detail route. Full product/design/price authoring is deliberately split into TTW-035 so this auth/schema ticket remains reviewable.

## Invariants

- A CUSTOMER cannot create campaigns or payout profiles without an approved application and current ORGANIZER role.
- A user has at most one PENDING application; every approval/rejection remains attributable and auditable.
- Only an ADMIN other than the applicant can decide an application, and a terminal decision cannot be replayed or overwritten.
- Approval, role change, session revocation record, audit, and applicant outbox creation are one database transaction; notification delivery may retry without duplicate business effects.
- An organiser can create/read/update only their own DRAFT campaign; client-supplied organiser ids are ignored.

## Implementation plan

1. Approve the eligibility fields, current terms version/copy, reviewer permissions, rejection/reapplication, and support override policy; add the application schema, enums, constraints, and rollback plan.
2. Implement self-service application status/submit/withdraw APIs with centralized eligibility evaluation and stable error codes; enforce verification through TTW-023.
3. Implement paginated/filterable admin application APIs and transactional approve/reject/override operations by reusing one role-transition service rather than duplicating `AdminUsersService` logic.
4. Add idempotent organiser application decision outbox events/templates and audit/metrics without including application free text in telemetry.
5. Build customer eligibility, application, pending/rejected/approved states and an accessible campaign DRAFT creation form/owned detail entry.
6. Build the admin queue/detail/decision UI with explicit confirmation and a required customer-visible rejection reason.
7. Update Swagger/shared contracts, organiser support/terms documentation, seed fixtures, and the PRD-to-test manifest.

## Test and observability plan

- Unit/component: eligibility matrix, application transitions, required terms/reasons, role-override behavior, customer state UI, and admin confirmation/error states.
- Integration/e2e: PostgreSQL uniqueness/ownership tests; approval transaction and rollback; role/session/outbox/audit effects; customer/organiser/admin authorization matrix.
- Failure, retry, and concurrency: concurrent submits create one PENDING row; concurrent/replayed decisions have one winner and one notification; mail failure leaves the approved role intact and retryable outbox.
- Logs, metrics, traces, and alerts: application submitted/approved/rejected/withdrawn counters and review-age metric; audit links actor/application/user without free-text or bank data labels.

## References

- `apps/api/src/auth/auth.service.ts:77-98` — every registration creates an ACTIVE CUSTOMER.
- `apps/api/src/fundraising/campaigns.controller.ts:46-67` — campaign creation requires ORGANIZER/ADMIN.
- `apps/api/src/fundraising/payout-profiles.controller.ts:32-68` — payout profiles use the same role gate.
- `apps/api/src/admin/admin-users.service.ts:68-134` — direct generic role changes and refresh-token deletion.
- `apps/api/prisma/schema.prisma:335-369` — single user role with no organiser eligibility/application model.
- `apps/app/app/dashboard/fundraiser/page.tsx:93-105` — UI infers organiser lock from a payout-profile 403.
- `apps/app/app/dashboard/fundraiser/page.tsx:187-205` — no-campaign copy and locked state provide no actionable onboarding path.

## Acceptance criteria

- [ ] Product/legal approve eligibility, terms version, reapplication, reviewer, and override decisions recorded above.
- [ ] Database constraints prevent more than one open application and preserve immutable terminal decisions.
- [ ] Eligible customers can submit/withdraw and see pending/rejected/approved status; ineligible users receive actionable non-sensitive guidance.
- [ ] Admins can filter/review/approve/reject; decision transaction changes role, revokes sessions, audits, and queues exactly one applicant notification.
- [ ] Direct CUSTOMER→ORGANIZER override requires a reason and creates equivalent application/audit history.
- [ ] An approved organiser can create a DRAFT campaign from the customer app and another user cannot access it.
- [ ] Integration concurrency/rollback and Playwright customer→application→admin approval→DRAFT campaign journey pass.
- [ ] Swagger/shared contracts, migrations, notification templates, terms/support docs, and observability are updated.
- [ ] High-risk security and independent implementation review pass.

## Out of scope

- Email verification, MFA, and session architecture → TTW-023.
- Full organiser campaign product/design/price builder and submission UX → TTW-035.
- Campaign activation readiness and decision notifications → TTW-034.
- Payout KYC/cadence/minimum/reversal policy → TTW-042.

## Design review

Record product/legal/security owners, date, eligibility/terms/override decisions, data-retention and support policy, schema/state machine, authorization, session effects, UI states, tests, and verdict.

## Implementation reviews

### Slice 1 dual review (2026-08-21) — PASS

- Security: PASS
- Implementation: PASS after remediations (`5ff649a`) — typecheck, REJECTED reapply UI, override PENDING withdraw, diff coverage ≥80%.

Record security and implementation iterations, transition/authorization findings, fixes, evidence, dimension verdicts, and overall verdict.

## Verification evidence

Record migration tests, exact unit/integration/Playwright commands, concurrent transition tests, audit/outbox samples, accessibility checks, and approved terms version.

## Completion summary

Summarize shipped eligibility and application flow, role/session migration, campaign entry, decisions/deviations, operational notes, PR, and TTW-035 handoff.

## Design review (slice 1)

**Date:** 2026-08-21  
**Risk:** High  
**Verdict:** Proceed with interim policy (formal legal sign-off deferred)

### Decisions recorded

| Topic             | Decision                                                                     |
| ----------------- | ---------------------------------------------------------------------------- |
| Eligibility       | ACTIVE CUSTOMER + verified email + first/last name + phone                   |
| Terms             | `organiser-terms/v1-interim-2026-08-21`                                      |
| Policy            | `organiser-onboarding-policy/v1-interim-2026-08-21`                          |
| Open applications | At most one PENDING per user (partial unique index)                          |
| Withdraw          | Allowed while PENDING                                                        |
| Reject            | Requires sanitized `customerVisibleReason`; reapply after REJECTED/WITHDRAWN |
| Approve           | Atomic APPROVED + CUSTOMER→ORGANIZER + session revoke + audit + outbox       |
| Reviewer          | ADMIN ≠ applicant                                                            |
| Override          | CUSTOMER→ORGANIZER requires reason + equivalent APPROVED application         |
| Bank details      | Deferred (TTW-042)                                                           |
| Campaign entry    | Approved ORGANIZER can create DRAFT via existing CampaignsService.create     |

Policy doc: `docs/organiser/ttw-030-interim-policy.md`

### Deferred

- Full Playwright customer→admin→DRAFT journey (API e2e covers path)
- Formal legal / trust-and-safety sign-off on terms copy
- Payout KYC (TTW-042)

## Implementation notes (slice 1)

- Module: `apps/api/src/organizer`
- Customer routes: `/v1/organiser/applications/*`
- Admin routes: `/v1/admin/organiser/applications/*`
- Migration: `20260821010000_ttw030_organiser_applications`
- Customer app: fundraiser dashboard onboarding + draft create CTA
