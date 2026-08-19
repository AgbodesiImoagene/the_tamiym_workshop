# TTW-031 — Render real fundraiser offers

**Epic:** 3 — Complete customer and fundraiser revenue journeys  
**Status:** Not started  
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
6. Add pricing/read-model contract tests and responsive Playwright selection coverage using products whose options are not colour/size.

## Test and observability plan

- Unit/component: arbitrary option sets/order, valid-combination resolution, dependent reset, disabled stock, quantity bounds, price/thumbnail changes, malformed/empty offers, keyboard and screen-reader states.
- Integration/e2e: public DTO disclosure snapshot; campaign/product/date/design/price filters; every returned variant accepted by campaign quote; display base+upcharge equals quote before documented adjustments.
- Failure, retry, and concurrency: inventory/price/status changes between page load and quote fail safely with actionable refresh; no selection creates a reservation.
- Logs, metrics, traces, and alerts: public read outcome/latency and count of excluded invalid offers; no variant ids, stock counts, or user data as metric labels.

## References

- `apps/web/components/public-fundraiser-detail.tsx:15-28` — hard-coded colours and sizes.
- `apps/web/components/public-fundraiser-detail.tsx:61-83` — selections are local placeholders and price is campaign-row only.
- `apps/web/components/public-fundraiser-detail.tsx:219-280` — controls do not map to a variant or upcharge.
- `apps/web/lib/fundraisers.ts:3-43` — public client type has no options/variants/availability.
- `apps/web/lib/fundraisers.ts:46-56` — public campaign is cached for 120 seconds.
- `apps/api/src/fundraising/campaigns.service.ts:394-431` — current public Prisma include/read model.
- `apps/api/src/pricing/pricing.service.ts:237-435` — authoritative variant, campaign price, option-upcharge, and quote computation.
- `apps/api/src/products/products.service.ts:427-486` — existing product variant/availability projection that can inform, not duplicate, the campaign read model.

## Acceptance criteria

- [ ] The approved public DTO/disclosure and price-label decisions are documented in Swagger/shared contracts.
- [ ] Hard-coded colour/size data is removed; controls render arbitrary API-defined options and only valid variant combinations.
- [ ] Public payload excludes all non-sellable campaign offers and does not expose exact stock, SKU, cost basis, or moderation internals.
- [ ] Contract tests prove every returned variant belongs to the offer and its displayed base+upcharge matches the quote resolver.
- [ ] Product/variant/quantity changes update selection, availability, image, and display price accessibly on desktop and mobile.
- [ ] Price/inventory/campaign drift between read and quote produces an actionable non-destructive error.
- [ ] Integration and Playwright coverage includes no products, no variants, arbitrary option names, out of stock, future/ended campaign, and API failure.
- [ ] High-risk security and independent implementation review pass.

## Out of scope

- Persisting selection through auth and completing payment → TTW-032.
- Inventory consumption/reconciliation → TTW-014.
- Campaign submission/activation ownership and design-readiness checks → TTW-034.
- Public CDN caching optimization after correctness baseline → TTW-053.

## Design review

Record product/security reviewers, date, DTO disclosure, price semantics/copy, caching decision, shared resolver interface, invalidation/drift behavior, accessibility, tests, and verdict.

## Implementation reviews

Record security and implementation iterations, pricing/disclosure findings, fixes, evidence, dimension verdicts, and overall verdict.

## Verification evidence

Record DTO snapshots, formula/contract test names, API integration and Playwright commands, accessibility results, and stale-state evidence.

## Completion summary

Summarize public offer contract, shared pricing refactor, UI behavior, caching decision, deviations, operational notes, PR, and TTW-032 handoff.
