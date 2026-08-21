# TTW-034 — Campaign readiness and decisions (interim v1)

**Policy version:** `campaign-readiness/v1-interim-2026-08-21`\
**Status:** Engineering interim — approved for slice 1 implementation; formal product/operations/moderation/finance sign-off still required before production go-live claims.

This matrix is the working source of truth for server-side campaign readiness, legal transitions used in slice 1, `draftRevision` as the reviewed revision candidate, and organiser-visible decision notifications.

## Authority

| Rule              | Value                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Evaluator         | One server-side readiness service; clients never trust or invent readiness                      |
| Policy stamp      | Every evaluation / decision response may include `readinessPolicyVersion`                       |
| Revision handoff  | TTW-035 `Campaign.draftRevision` is the candidate reviewed revision                             |
| Approved revision | On successful activate, persist `approvedRevision = draftRevision`                              |
| Resume            | `PAUSED → ACTIVE` only when `approvedRevision === draftRevision` and activate readiness is zero |
| Ownership 404     | Missing and foreign campaigns share `404 Campaign not found` (TTW-030/035 pattern)              |

## Readiness phases

### Submit (`DRAFT → REVIEW` attempt)

Blockers (any → deny submit with stable codes):

| Check                                | Code                                      |
| ------------------------------------ | ----------------------------------------- |
| Title empty                          | `CAMPAIGN_READINESS_TITLE_MISSING`        |
| Description empty                    | `CAMPAIGN_READINESS_DESCRIPTION_MISSING`  |
| Story empty                          | `CAMPAIGN_READINESS_STORY_MISSING`        |
| Dates end ≤ start                    | `CAMPAIGN_READINESS_DATE_ORDER_INVALID`   |
| Zero priced offers                   | `CAMPAIGN_READINESS_NO_OFFERS`            |
| Offer missing design                 | `CAMPAIGN_READINESS_OFFER_DESIGN_MISSING` |
| Offer price invalid / &lt; floor     | `CAMPAIGN_READINESS_OFFER_PRICE_INVALID`  |
| Organiser not ACTIVE ORGANIZER       | `CAMPAIGN_READINESS_ORGANISER_INELIGIBLE` |
| Current organiser terms not accepted | `CAMPAIGN_READINESS_TERMS_NOT_CURRENT`    |

Designs may still be `PENDING` / `FLAGGED` at submit. Rejected designs block submit (`CAMPAIGN_READINESS_DESIGN_REJECTED`).

### Activate / resume (`REVIEW → ACTIVE` or `PAUSED → ACTIVE`)

All submit blockers, plus:

| Check                                      | Code                                      |
| ------------------------------------------ | ----------------------------------------- |
| Design not APPROVED                        | `CAMPAIGN_READINESS_DESIGN_NOT_APPROVED`  |
| Product not ACTIVE                         | `CAMPAIGN_READINESS_PRODUCT_INACTIVE`     |
| No sellable variant on an offer            | `CAMPAIGN_READINESS_NO_AVAILABLE_VARIANT` |
| End date missing or not strictly in future | `CAMPAIGN_READINESS_END_DATE_INVALID`     |
| Approved revision mismatch (resume only)   | `CAMPAIGN_READINESS_REVISION_MISMATCH`    |

### Warnings (non-blocking in slice 1)

| Check                         | Code                                 |
| ----------------------------- | ------------------------------------ |
| Future `startDate`            | `CAMPAIGN_READINESS_SCHEDULED_START` |
| Payout / KYC not yet enforced | `CAMPAIGN_READINESS_PAYOUT_DEFERRED` |

Payout eligibility remains TTW-042. Slice 1 records the deferred warning only; it does not block activation.

## Future start (scheduled)

- Activation may succeed when `startDate` is in the future.
- Status becomes `ACTIVE`; no `SCHEDULED` enum.
- Public lookup / quote / order must treat “before startDate” as not sellable (TTW-031 already filters start; full quote/order enforcement remains a later slice if gaps remain).
- Organiser notification distinguishes live vs scheduled approval.

## Transition matrix (slice 1 enforced paths)

| From   | To     | Actor     | Gate                                       |
| ------ | ------ | --------- | ------------------------------------------ |
| DRAFT  | REVIEW | Organiser | Submit readiness + AI pre-screen           |
| REVIEW | DRAFT  | Admin/AI  | Reject reason (customer-visible only)      |
| REVIEW | ACTIVE | Admin     | Activate readiness; set `approvedRevision` |
| ACTIVE | PAUSED | Admin     | Existing status update                     |
| PAUSED | ACTIVE | Admin     | Resume readiness + revision match          |
| ACTIVE | ENDED  | System    | Expiry job (unchanged)                     |

Deferred to later slices: pause-edit → DRAFT invalidation UX, DISABLED recovery, immutable transition table, concurrent effect keys beyond notification `dedupeKey`.

## Decision notifications (organiser transactional)

Use `NotificationOutbox` + TTW-043 delivery machinery. Never include internal moderation notes, AI scores, or admin-only fields.

| Event                         | When                                             |
| ----------------------------- | ------------------------------------------------ |
| `organiser.campaign.approved` | Admin activate (payload `mode`: live\|scheduled) |
| `organiser.campaign.rejected` | Admin reject or AI auto-reject                   |
| `organiser.campaign.resumed`  | Admin resume from PAUSED                         |

Submission acknowledgment, pause, disable, and end templates are deferred to a later slice.

## Customer-visible vs internal

| Field / content                          | Audience           |
| ---------------------------------------- | ------------------ |
| Blocker codes + safe messages            | Organiser / admin  |
| `customerVisibleReason` / rejection copy | Organiser          |
| AI notes, scores, admin notes            | Admin / audit only |

## Rollback

- Forward: add nullable `approvedRevision`; backfill null for historical rows.
- Rollback: drop `approvedRevision` after writers stop depending on it.
- Resume of legacy ACTIVE→PAUSED rows without `approvedRevision` requires re-activation via REVIEW path or explicit admin recovery (document in ops; not silently grandfathered as reviewed).

## Deferred

- Full transition / readiness snapshot schema and quarantine migration for invalid ACTIVE rows
- Atomic pause-edit → DRAFT + resubmission UX
- Playwright full lifecycle matrix
- Payout KYC hard gate (TTW-042)
- Preference / dead-letter machinery beyond existing outbox (TTW-043)
