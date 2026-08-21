# TTW-031 — Render real fundraiser offers

**Epic:** 3 — Complete customer and fundraiser revenue journeys
**Status:** In progress — slice 1 implemented
**Risk:** High
**Blocked by:** TTW-003, TTW-004, TTW-014, TTW-021
**Blocks:** TTW-032, TTW-034, TTW-053

## Background

The public fundraiser payload returns campaign products, one campaign price, and a design thumbnail but no options, variants, or availability. The page compensates with ten hard-coded colours and eight hard-coded sizes. Those selections are not tied to a real `variantId`, do not affect price, and are discarded by the auth links. The actual quote path requires a variant and adds real option upcharges, so the visible offer can disagree with what is sellable and chargeable.

## Proposal

Create an explicit public campaign-offer read model. For each sellable campaign product, return safe product/options metadata, approved design presentation, campaign base price, and selectable variants with option-value ids/codes/display metadata, a boolean availability signal, and a display unit price before checkout discounts, shipping, and VAT. Do not expose SKU, exact stock counts, organizer cost basis, moderation notes, or internal pricing data.

Extract a shared campaign line-price resolver from `PricingService` so the read model and authenticated quote use the same campaign membership, base-price, option-upcharge, currency, and availability rules. The public display price is campaign base plus real option upcharges; campaign discounts and all order totals remain server-quoted at checkout and are labelled accordingly. For v1, fetch this correctness-sensitive page without the current 120-second application cache; introduce explicit invalidation/CDN policy later only with stale-state tests.

Replace placeholders with option-driven controls that resolve only valid variant combinations, disable unavailable variants, reset dependent selections when product changes, update image/price/accessibility text, and produce a typed `{campaignId, campaignProductId, productId, variantId, designId, quantity}` selection for TTW-032.

## Invariants

- Every selectable combination resolves to exactly one available variant belonging to that campaign product.
- Public display amount and authenticated quote use the same campaign price and option upcharges; final discounts/shipping/VAT remain server authority.
- Inactive, not-yet-started, ended, disabled, unpriced, non-ACTIVE-product, unsafe-design, and wholly unavailable offers cannot be selected.
- Anonymous payloads disclose no exact inventory, organizer economics, private design data, moderation notes, or internal identifiers beyond those required to submit a selection.
- Quote/order APIs revalidate campaign, offer, price, design, and stock; public availability is never treated as a reservation.

## Implementation plan

1. Define and document the versioned `PublicCampaignOffer` DTO, money serialization, disclosure policy, and “price before discounts/shipping/VAT” copy.
2. Extract campaign offer/line resolution from pricing into one production service; use it from public read, quote, and activation-readiness consumers without duplicating formulas.
3. Build the public fundraiser query with explicit selects and sellability filters, including `startDate`/`endDate`; remove Prisma-model passthrough and the 120-second Next cache.
4. Update Swagger/shared web types and render generic ordered option controls from API metadata, mapping combinations to real variants and boolean availability.
5. Persist the typed in-memory selection boundary for TTW-032, including product-switch reset, quantity bounds, no-offer/unavailable/error/reload states, and screen-reader status updates.
6. Add pricing/read-model contract tests and responsive Playwright selection coverage using products whose options are not colour/size. _(Playwright matrix deferred; unit/integration coverage landed in slice 1.)_

## Test and observability plan

- Unit/component: arbitrary option sets/order, valid-combination resolution, dependent reset, disabled stock, quantity bounds, price/thumbnail changes, malformed/empty offers, keyboard and screen-reader states.
- Integration/e2e: public DTO disclosure snapshot; campaign/product/date/design/price filters; every returned variant accepted by campaign quote; display base+upcharge equals quote before documented adjustments.
- Failure, retry, and concurrency: inventory/price/status changes between page load and quote fail safely with actionable refresh; no selection creates a reservation.
- Logs, metrics, traces, and alerts: public read outcome/latency and count of excluded invalid offers; no variant ids, stock counts, or user data as metric labels. _(Metrics deferred to TTW-051.)_

## References

- `apps/web/components/public-fundraiser-detail.tsx` — API-driven options/variants (hard-coded colour/size removed).
- `apps/web/lib/fundraisers.ts` — public client types + `cache: 'no-store'`.
- `apps/api/src/fundraising/campaigns.service.ts` — disclosure-safe `getBySlug` + sellability filters.
- `apps/api/src/pricing/campaign-line-price.ts` — shared `resolveCampaignLinePrice`.
- `apps/api/src/pricing/pricing.service.ts` — `buildPublicCampaignOffers` + quote path reuse.
- `docs/fundraising/ttw-031-interim-policy.md` — interim disclosure/caching/price policy.

## Acceptance criteria

- [x] The approved public DTO/disclosure and price-label decisions are documented in Swagger/shared contracts.
- [x] Hard-coded colour/size data is removed; controls render arbitrary API-defined options and only valid variant combinations.
- [x] Public payload excludes all non-sellable campaign offers and does not expose exact stock, SKU, cost basis, or moderation internals.
- [x] Contract tests prove every returned variant belongs to the offer and its displayed base+upcharge matches the quote resolver.
- [x] Product/variant/quantity changes update selection, availability, image, and display price accessibly on desktop and mobile.
- [ ] Price/inventory/campaign drift between read and quote produces an actionable non-destructive error. _(Checkout-time UX → TTW-032.)_
- [ ] Integration and Playwright coverage includes no products, no variants, arbitrary option names, out of stock, future/ended campaign, and API failure. _(Unit coverage landed; full Playwright deferred.)_
- [ ] High-risk security and independent implementation review pass.

## Out of scope

- Persisting selection through auth and completing payment → TTW-032.
- Inventory consumption/reconciliation → TTW-014.
- Campaign submission/activation ownership and design-readiness checks → TTW-034.
- Public CDN caching optimization after correctness baseline → TTW-053.

## Design review

**Date:** 2026-08-21
**Policy version:** `public-campaign-offer/v1-interim-2026-08-21`
**Charter:** Product + security interim for slice 1 public offer read model.

### Decisions

| Topic           | Decision                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Caching         | No Next.js 120s cache on fundraiser detail (`cache: 'no-store'`). CDN deferred.                                     |
| Display price   | Campaign base + option upcharges; label “before discounts, shipping and VAT”; integer minor units on wire.          |
| Availability    | Boolean only; when inventory tracked, sellable stock &gt; 0; never expose counts.                                   |
| Sellability     | Exclude non-ACTIVE campaign/window, non-ACTIVE product, non-APPROVED design, missing price, no available variants.  |
| Disclosure      | Never SKU, cost/organizerCostBasis, moderationNotes, exact inventory, organizer internals beyond first/last name.   |
| Shared resolver | `resolveCampaignLinePrice` + `PricingService.buildPublicCampaignOffers`; quote campaign path uses the same formula. |
| Drift           | Public availability is not a reservation; quote/order revalidate. Actionable checkout drift UX deferred to TTW-032. |
| Accessibility   | `aria-live` status for product/option/price/qty; option groups labelled; unavailable controls disabled.             |

**Verdict:** Proceed with slice 1 implementation under interim policy (formal legal/T&S sign-off still required before production go-live claims).

## Implementation reviews

_Pending independent implementation + security review after commit._

## Verification evidence

```text
pnpm --filter api lint          # 0 errors (pre-existing warnings only)
pnpm --filter api typecheck     # pass
pnpm --filter web typecheck     # pass
pnpm --filter api exec jest --testPathPatterns='pricing|campaigns|public-fundraisers' --coverage=false
  # 7 suites, 70 tests passed
node scripts/quality/check-diff-coverage.mjs --base origin/main --floor 80
  # 52/58 lines (89.66%) — pass
```

Key tests:

- `resolveCampaignLinePrice` — base + upcharge rounding
- `PricingService buildPublicCampaignOffers` — display base+upcharge equals quote pre-discount; disclosure snapshot; sellability filters; OOS boolean without counts
- `CampaignsService getBySlug` — offerPolicyVersion, startDate window, expired end, disclosure-safe mapping
- `PublicFundraisersController` — delegates to service

## Completion summary

_Slice 1 (this commit):_ public offer contract, shared pricing resolver, web option UI, no app-level cache. Selection remains in React state for TTW-032. Playwright full matrix and CDN caching deferred.
