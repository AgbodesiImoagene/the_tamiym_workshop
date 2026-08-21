# TTW-030 — Organiser onboarding (interim v1)

**Policy version:** `organiser-onboarding-policy/v1-interim-2026-08-21`\
**Terms version:** `organiser-terms/v1-interim-2026-08-21`\
**Status:** Engineering interim — approved for implementation; formal legal / trust-and-safety sign-off still required before production go-live claims.

This matrix is the working source of truth for organiser eligibility, applications, admin review, role promotion, and campaign DRAFT entry in slice 1.

## Eligibility

| Rule           | Value                                                        |
| -------------- | ------------------------------------------------------------ |
| Account status | `ACTIVE`                                                     |
| Role           | `CUSTOMER` (applicants); approved users become `ORGANIZER`   |
| Email          | `emailVerifiedAt` set                                        |
| Profile        | `firstName`, `lastName`, and `phone` non-empty               |
| Terms          | Applicant must accept current organiser terms at submit time |

Bank / payout KYC details are **not** required for application or DRAFT campaign creation (TTW-042).

## Application fields

| Field              | Constraint                       |
| ------------------ | -------------------------------- |
| `organisationName` | 2–120 characters                 |
| `intendedUse`      | 20–2000 characters               |
| `termsVersion`     | Must equal current terms version |
| `termsAcceptedAt`  | Required ISO timestamp at submit |

## Cardinality and withdraw

| Rule              | Value                                                                        |
| ----------------- | ---------------------------------------------------------------------------- |
| Open applications | At most one `PENDING` per user (PostgreSQL partial unique index)             |
| Withdraw          | Allowed while `PENDING`                                                      |
| Reapply           | Allowed after `REJECTED` or `WITHDRAWN` (new row; prior decisions immutable) |

## Admin review

| Decision | Effect                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Approve  | Atomically: application `APPROVED`, role `CUSTOMER`→`ORGANIZER`, revoke customer sessions (TTW-023 `AuthSession`), audit, notification outbox |
| Reject   | Requires `customerVisibleReason` (10–500), sanitized (no internal notes / scores); may set `internalNotes` (admin-only)                       |
| Reviewer | `ADMIN` and must not be the applicant                                                                                                         |

## Customer-visible vs internal fields

| Field                   | Audience   | Contents                                                     |
| ----------------------- | ---------- | ------------------------------------------------------------ |
| `customerVisibleReason` | Applicant  | Safe rejection copy only                                     |
| `internalNotes`         | Admin only | Support / review notes; never returned on customer endpoints |

## Admin role override

Direct admin `CUSTOMER`→`ORGANIZER` role change **requires** a non-empty reason and creates an equivalent `APPROVED` application record when none exists (audit + session revoke preserved).

## Campaign entry

An approved `ORGANIZER` may create a `DRAFT` campaign via existing `CampaignsService.create` from the customer app. Full campaign authoring remains TTW-035.

## Deferred

- Full Playwright customer→admin→DRAFT journey (note in ticket)
- Formal legal sign-off on terms copy
- Payout KYC (TTW-042)
