# TTW-027 — Content moderation & appeals (interim v1)

**Policy version:** `content-moderation-policy/v1-interim-2026-08-20`\
**Status:** Engineering interim — approved for implementation; formal legal / trust-and-safety / privacy sign-off still required before production go-live claims.

This matrix is the working source of truth for immutable decisions, owner appeals, projection updates, and customer-safe copy in slice 1.

## Appealability

| Outcome (latest decision for subject) | Appealable? | Notes                              |
| ------------------------------------- | ----------- | ---------------------------------- |
| `REJECTED`                            | Yes         | Within appeal window               |
| `FLAGGED`                             | Yes         | Within appeal window               |
| `APPROVED`                            | No          |                                    |
| `PENDING`                             | No          | Human queue / provider unavailable |

## Appeal window and cardinality

| Rule                    | Value                                                               |
| ----------------------- | ------------------------------------------------------------------- |
| Window                  | 14 days from `decision.createdAt`                                   |
| Active appeals          | At most one `PENDING` appeal per decision (DB partial unique index) |
| Who may appeal          | Subject owner only                                                  |
| Statement               | Required; max 2000 characters                                       |
| Evidence binary uploads | Deferred (not in slice 1)                                           |
| Withdraw                | Allowed while status is `PENDING`                                   |

## Ownership

| Subject type | Owner field                            |
| ------------ | -------------------------------------- |
| `DESIGN`     | `Design.userId`                        |
| `MEDIA`      | First linked `DesignAsset.ownerUserId` |
| `CAMPAIGN`   | `Campaign.organizerId`                 |

## Content edit / new automated decision

When content is edited or a new AI decision is recorded for the same `subjectType` + `subjectId`, all `PENDING` appeals for that subject are auto-`WITHDRAWN`.

## Availability while an appeal is pending

| Surface                      | Behaviour                                                                |
| ---------------------------- | ------------------------------------------------------------------------ |
| Design public share          | Still requires `APPROVED` only (TTW-026); pending appeal does not unlock |
| Media / campaign sellability | Pending appeal does **not** make content public or sellable              |

## Admin resolution

| Resolution   | Effect                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| `UPHELD`     | Append new decision with the **same outcome** as the challenged decision; reason `APPEAL_UPHELD`         |
| `OVERTURNED` | Append new decision; outcome `APPROVED` by default, or DTO `status` if `APPROVED`\|`REJECTED`\|`FLAGGED` |

Never mutate the challenged decision row. Resolution actor kind is `APPEAL_RESOLUTION`.

### Reviewer independence

If the challenged decision has `actorKind === ADMIN` and `actorUserId` is set, the resolver must not equal that `actorUserId` (HTTP 403).

## Reason codes (string array)

`AI_APPROVE`, `AI_FLAG`, `AI_REJECT`, `AI_UNAVAILABLE`, `AI_NO_CONTENT`, `ADMIN_APPROVE`, `ADMIN_REJECT`, `ADMIN_FLAG`, `LEGACY_BACKFILL`, `APPEAL_UPHELD`, `APPEAL_OVERTURNED`, `SYSTEM_RESUBMIT`

## Model version

For AI actors: `omni-moderation-latest`.

## Customer vs internal fields

| Field                 | Audience   | Contents                                                                                                            |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `customerExplanation` | Owner/API  | Safe generic copy only; never AI scores or internal notes                                                           |
| `internalEvidence`    | Admin only | Notes, optional `maxScore`, structured evidence                                                                     |
| Projection notes      | Internal   | `moderationNotes` mirrors internal notes; campaigns set `rejectionReason` from customer explanation when `REJECTED` |

## Legacy backfill

Migration inserts one `LEGACY_BACKFILL` / `SYSTEM` decision per existing `Design`, `MediaAsset`, and `Campaign` using current projection fields. Customer explanation is generic; `internalEvidence` is `{ "source": "legacy_backfill" }`.

## Deferred (later slices)

- Formal legal / T&S sign-off of taxonomy and SLAs
- Evidence binary uploads (TTW-021-safe references)
- `ESCALATED` workflow and SLA jobs
- Playwright customer/admin UI journeys
- Notification receipts via TTW-043
