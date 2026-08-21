# TTW-042 — Payout eligibility & KYC (interim v1)

**Policy version:** `payout-eligibility/v1-interim-2026-08-21`\
**Status:** Engineering interim — approved for slice 1 implementation; formal legal/compliance/finance/operations sign-off still required before production go-live claims.

This matrix is the working source of truth for organiser/destination eligibility at campaign activation, payout preview, run creation, approval, and provider initiation. Server evaluation is authoritative; clients must not invent eligibility.

## Authority

| Rule            | Value                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------- |
| Evaluator       | Pure server function (`payout-eligibility`) with stable denial codes                          |
| Policy stamp    | Every payout run / payout row stores `policyVersion` + safe eligibility snapshot              |
| Destination     | Bank fields snapshotted on payout create; execution uses snapshot, never live edits           |
| Default profile | At most one `isDefault=true` per user (PostgreSQL partial unique index)                       |
| Automation      | `AUTO_EXECUTE` blocked unless `PAYOUT_AUTO_EXECUTE_ENABLED=true` **and** clean-run evidence   |
| Bank resolution | Slice 1: deterministic stub (`PAYOUT_BANK_RESOLUTION_MODE=stub`); live Paystack resolve later |

## Eligibility gates (slice 1)

Invoked at:

1. Campaign readiness **activate / resume** (blockers)
2. Payout run **preview** (exclude ineligible campaigns)
3. Payout run **create**
4. Payout run **approve**
5. Immediately before **provider initiation** (run execute + admin ad-hoc initiate)

Submit readiness may surface a non-blocking warning when payout eligibility would fail; it does not block DRAFT→REVIEW.

## Organiser requirements

| Check                   | Denial code                     | Notes                                                                 |
| ----------------------- | ------------------------------- | --------------------------------------------------------------------- |
| Account `ACTIVE`        | `PAYOUT_ORGANISER_NOT_ACTIVE`   |                                                                       |
| Role `ORGANIZER`        | `PAYOUT_ORGANISER_ROLE_INVALID` |                                                                       |
| Email verified          | `PAYOUT_EMAIL_UNVERIFIED`       | `emailVerifiedAt` set                                                 |
| Phone present           | `PAYOUT_PHONE_MISSING`          | Interim: non-empty `phone` until phone-OTP verification exists        |
| Current organiser terms | `PAYOUT_TERMS_NOT_CURRENT`      | Reuses TTW-030 `ORGANIZER_TERMS_VERSION` as interim payout terms gate |

## Destination (payout profile) requirements

| Check                                   | Denial code                   | Notes                                              |
| --------------------------------------- | ----------------------------- | -------------------------------------------------- |
| Selected or default profile exists      | `PAYOUT_PROFILE_MISSING`      | Campaign profile or organiser default              |
| Profile owned by recipient organiser    | `PAYOUT_PROFILE_NOT_OWNED`    |                                                    |
| Status `VERIFIED` (selection / preview) | `PAYOUT_PROFILE_NOT_VERIFIED` | `PENDING_VERIFICATION` / `REJECTED` / `SUPERSEDED` |
| Not `SUSPENDED`                         | `PAYOUT_PROFILE_SUSPENDED`    | Also blocks execute even with prior snapshot       |
| Not `REJECTED`                          | `PAYOUT_PROFILE_REJECTED`     |                                                    |
| Bank resolution recorded (stub or live) | `PAYOUT_BANK_UNRESOLVED`      | Stub writes `STUB_MATCH`                           |

### Lifecycle statuses

| Status                 | May be selected for new payouts | Notes                                      |
| ---------------------- | ------------------------------- | ------------------------------------------ |
| `PENDING_VERIFICATION` | No                              | Created under live mode until admin/verify |
| `VERIFIED`             | Yes                             | Required for selection                     |
| `REJECTED`             | No                              |                                            |
| `SUSPENDED`            | No                              | Invalidates in-flight execute recheck      |
| `SUPERSEDED`           | No                              | Prior destination after bank edit          |

### Bank resolution (interim stub)

| Mode | Env `PAYOUT_BANK_RESOLUTION_MODE` | Create behaviour                                                                   |
| ---- | --------------------------------- | ---------------------------------------------------------------------------------- |
| Stub | `stub` (non-production default)   | Deterministic “match” on supplied name/number; profile → `VERIFIED` + `STUB_MATCH` |
| Live | `live` (required in production)   | Profile → `PENDING_VERIFICATION`; admin verify until provider name-match lands     |

Stub does **not** call Paystack resolve. Production forbids `stub` (same posture as virus-scanner deterministic ban).

### Destination edits

- Label / default-flag edits do not change bank identity.
- Bank code / account number / account name edits: clear `recipientCode`, bump `destinationVersion`, set status `PENDING_VERIFICATION` (or stub-reverify), and never mutate snapshotted payout rows.
- Existing payouts keep immutable `snapshotBank*` / `snapshotProfileId` / `snapshotDestinationVersion`.

## Policy snapshot on payouts

On run create (and ad-hoc initiate), each payout stores:

- `policyVersion`
- `eligibilitySnapshot` (JSON: codes, gate, profile id, destination version — **no** full account numbers)
- `snapshotBankCode`, `snapshotAccountName`, `snapshotAccountMask`, `snapshotRecipientCode`
- `snapshotProfileId`, `snapshotDestinationVersion`

Execution rechecks organiser active + profile not suspended/rejected; destination fields come from the snapshot.

## Automation gate

| Setting                       | Default                                      | Effect                                                                  |
| ----------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| `PAYOUT_AUTO_EXECUTE_ENABLED` | unset/`false`                                | Site/campaign cannot use `AUTO_EXECUTE`; scheduler will not auto-queue  |
| Clean-run evidence            | Owner-approved TTW-015 reconciliation period | Required before enabling env in production (ops runbook; not automated) |

`MANUAL` and `AUTO_APPROVAL_REQUIRED` remain available.

Denial when blocked: `PAYOUT_AUTO_EXECUTE_DISABLED`.

## Cadence / minimum / hold (unchanged authority)

Settlement hold, cadence days, and minimum amount remain SiteSettings / campaign ledger (TTW-011). Slice 1 does not redefine fee allocation, per-day caps, or two-person approval thresholds (deferred).

## Customer / admin safe messaging

| Audience        | Content                                              |
| --------------- | ---------------------------------------------------- |
| Organiser/admin | Stable denial codes + actionable safe messages       |
| Logs/metrics    | Codes + ids only — never account numbers or KYC docs |
| API responses   | Masked account (`***1234`); no raw secrets           |

## Rollback

- Forward: add status/version/snapshot columns; remediate multi-default rows; add partial unique index.
- Rollback: stop writers relying on new columns; drop index/columns after deploy rollback (coordinate with payout freeze).

## Deferred

- Legal/compliance sign-off on KYC evidence, age/residency, beneficial owners, retention
- Live Paystack account-resolve + name-match thresholds
- Phone OTP verification field
- Distinct payout-terms document version
- Two-person approval thresholds and fee/reserve/max-per-day limits
- Playwright organiser verify → eligible journey
- UI for verification state beyond API fields
