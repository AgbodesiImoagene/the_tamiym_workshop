# TTW-031 — Public campaign offer read model (interim v1)

**Policy version:** `public-campaign-offer/v1-interim-2026-08-21`\
**Status:** Engineering interim — approved for implementation; CDN/cache invalidation and full Playwright matrix deferred.

This matrix is the working source of truth for the anonymous public fundraiser offer payload and its relationship to authenticated campaign quotes.

## Caching

| Surface                       | v1 decision                                      |
| ----------------------------- | ------------------------------------------------ |
| Next.js `getPublicFundraiser` | No application cache (`revalidate: 120` removed) |
| CDN / edge cache              | Deferred; introduce only with stale-state tests  |

## Display price

| Rule            | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| Formula         | Campaign product base + option-value upcharges (same as quote path) |
| Excluded        | Campaign discounts, shipping, VAT, view surcharges, bulk tiers      |
| Label (UI copy) | “before discounts, shipping and VAT”                                |
| Serialization   | Integer **minor units** (`baseAmountMinor`, `unitAmountMinor`)      |

Authenticated `quoteCampaign` remains the authority for checkout totals. Public display must equal the quote’s pre-discount merchandise unit (`unitBasePrice + optionValueUpcharge`) when discounts are zero.

## Availability

| Rule      | Value                                                                       |
| --------- | --------------------------------------------------------------------------- |
| Signal    | Boolean `available` only                                                    |
| Never     | Exact stock counts, reserved quantities, low-stock thresholds               |
| Semantics | `variant.isAvailable` and, when inventory is tracked, sellable stock &gt; 0 |

Public availability is not a reservation; quote/order revalidate campaign, offer, price, design, and stock.

## Sellability filters (exclude entire offer)

Exclude a campaign product when any of:

- Campaign is not `ACTIVE`, or now is before `startDate`, or after `endDate`
- Product status is not `ACTIVE`
- Design is missing or `moderationStatus` is not `APPROVED`
- No campaign price row for the campaign currency
- No variants remain after availability projection (zero selectable variants)

## Disclosure (never return on public GET)

- SKU
- Cost / organizer cost basis
- `moderationNotes` / internal moderation scores
- Exact inventory quantities
- Organizer internals beyond public first/last name
- Product/variant Prisma passthrough fields not listed in the DTO

## Shared resolver

`resolveCampaignLinePrice` (pricing module) is the single formula for public unit display and campaign quote pre-discount merchandise. `buildPublicCampaignOffers` projects sellable offers for `GET /v1/public/fundraisers/:slug`.

## Deferred

- Full Playwright option-matrix coverage (smoke only if easy in slice 1)
- CDN caching / invalidation policy
- Persisting selection through auth → TTW-032
