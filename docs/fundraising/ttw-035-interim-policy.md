# TTW-035 — Organiser campaign authoring (interim v1)

**Policy version:** `organiser-campaign-authoring/v1-interim-2026-08-21`\
**Status:** Engineering interim — approved for slice 1 implementation; formal product/T&S sign-off still required before production go-live claims.

This matrix is the working source of truth for owned DRAFT campaign authoring, offer mutations, draft revision concurrency, price guidance disclosure, and owner-only draft preview.

## Authorization

| Rule       | Value                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| Actor      | Active `ORGANIZER` (or `ADMIN` acting as themselves via organiser routes)                |
| Ownership  | Campaign `organizerId` must equal authenticated user id; no client-supplied organiser id |
| Mutability | Basics and offers: `DRAFT` only                                                          |
| Foreign    | Another user’s campaign → same `404 Campaign not found` as missing; never mutate         |

## Explicit save + draft revision

| Rule            | Value                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------- |
| Field           | `Campaign.draftRevision` (Int, default 1, monotonic)                                      |
| Client contract | Every basics/offer mutation supplies `expectedRevision` matching the last loaded revision |
| Success         | Persist change and increment revision **once** per successful mutation                    |
| Stale writer    | Conditional write miss → `409` with code `CAMPAIGN_STALE_REVISION` + reload guidance      |
| TTW-034 handoff | Same revision is the candidate reviewed/approved revision once readiness is enforced      |

## Basics validation (stable codes)

| Field / rule | Constraint                                 | Code                                            |
| ------------ | ------------------------------------------ | ----------------------------------------------- |
| Title        | Non-empty when provided                    | `CAMPAIGN_TITLE_INVALID`                        |
| Slug         | Non-empty, URL-safe, unique                | `CAMPAIGN_SLUG_INVALID` / `CAMPAIGN_SLUG_TAKEN` |
| Goal         | Null/omit OK; if set, finite number &gt; 0 | `CAMPAIGN_GOAL_INVALID`                         |
| Dates        | When both present, end &gt; start          | `CAMPAIGN_DATE_ORDER_INVALID`                   |
| Status       | Not DRAFT                                  | `CAMPAIGN_NOT_DRAFT`                            |

## Offers (product + design + price)

| Rule       | Value                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| Atomicity  | Validate ownership, product match, uniqueness, and floor **before** writes; one transaction |
| Design     | Required; must belong to organiser (`Design.userId`) and match `productId`                  |
| Moderation | Pending/flagged designs allowed while drafting; clearly labelled in owner UI                |
| Price      | Required positive NGN major units ≥ current server floor (`getMinCampaignProductPrice`)     |
| Uniqueness | One offer per `(campaignId, productId, designId)`                                           |
| Guidance   | Currency + minimum selling price + non-promising copy; **never** expose cost/basis          |
| Floor copy | Do not claim fixed profit across variants; quote/order pricing remains authoritative        |

## Owner detail + draft preview

| Surface         | Value                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| Owner detail    | Full owned campaign + offers, design moderation labels, price guidance fields, revision                    |
| Draft preview   | Owner-authenticated **DRAFT only**; reuses TTW-031 offer projection with `purchasable: false` + DRAFT mark |
| Design lookup   | Missing and foreign designs share `CAMPAIGN_DESIGN_NOT_FOUND` (no existence oracle)                        |
| Preview filters | No foreign/deleted/unsafe media; REJECTED designs excluded from preview offers                             |
| Public GET      | Unchanged — ACTIVE + APPROVED only (TTW-031)                                                               |

## Submission (interim blockers)

Submission uses existing `POST /campaigns/:id/submit-for-review`. Slice 1 surfaces stable interim blocker codes when the DRAFT is not ready enough to attempt review. **TTW-034** owns the final readiness matrix and transition authority.

| Interim blocker (examples)             | Code                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| Missing title                          | `CAMPAIGN_SUBMIT_MISSING_TITLE`                                                        |
| No priced offers                       | `CAMPAIGN_SUBMIT_NO_OFFERS`                                                            |
| Offer below live floor / invalid price | `CAMPAIGN_SUBMIT_OFFER_PRICE_INVALID` (re-checks current `getMinCampaignProductPrice`) |

## Rollback (migration)

- Forward: add `draftRevision INT NOT NULL DEFAULT 1`; existing rows backfill to 1.
- Rollback: drop column `draftRevision` after confirming no writers depend on it (safe while clients ignore the field).
- No data loss on stale 409 — rejected writers do not overwrite newer state.

## Deferred

- Full Playwright authoring matrix (hooks only in slice 1)
- Final readiness / activation / decision notifications → TTW-034
- Artwork editing → workshop; media hardening → TTW-021
- Payout KYC → TTW-042
