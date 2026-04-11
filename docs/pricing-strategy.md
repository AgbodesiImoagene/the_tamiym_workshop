# Pricing Strategy

## Purpose

This document explains the current pricing pipeline, the rounding policy, the data model constraints that exist today, and the main pricing gaps that should be treated as explicit follow-up work.

Primary implementation references:

- `apps/api/src/pricing/pricing.service.ts`
- `apps/api/src/pricing/currency-rounding.ts`
- `apps/api/src/pricing/pricing.types.ts`
- `apps/api/prisma/schema.prisma`

## Pricing Scope

The current pricing implementation supports two checkout modes:

- standard checkout
- campaign checkout

Shared pricing responsibilities:

- base prices from product or variant pricing
- option value upcharges
- shipping lookup by geo area
- VAT calculation
- order and line-item snapshots

Mode-specific behavior:

- standard checkout applies bulk pricing and buyer-paid view surcharge
- campaign checkout uses campaign product prices and may compute organizer cost basis separately

## Current Pricing Pipeline

At a high level, the current pipeline is:

1. load site settings and currency
2. validate shipping address ownership
3. compute each line item
4. aggregate subtotal and discount
5. compute shipping fee
6. compute VAT
7. compute total
8. round order total to display granularity

This behavior is described inline in `PricingService` as:

- base price
- option upcharge
- bulk adjustment for standard orders only
- view surcharge
- discounts
- unit and line totals
- shipping
- VAT
- rounding

## Money Sources By Pricing Type

### Product and variant base prices

Base unit price is resolved in this order:

1. `VariantPrice`
2. `ProductPrice`

One row per currency is enforced for both:

- `ProductPrice @@unique([productId, currency])`
- `VariantPrice @@unique([variantId, currency])`

### Campaign prices

Campaign prices are read from:

- `CampaignProductPrice`

Campaign checkout resolves price by matching:

- `campaignId`
- derived `productId` from the selected variant
- optional `designId`

The resulting campaign product price becomes the buyer `unitBasePrice`.

Important limitation:

- campaign prices are not variant-aware today

### Option value upcharges

Option value upcharges are stored in:

- `OptionValueUpcharge`

Uniqueness exists per option value and currency:

- `@@unique([optionValueId, currency])`

### Bulk pricing

Bulk pricing is stored in:

- `BulkPricing`

Uniqueness today:

- `@@unique([productId, variantId, currency, minQuantity])`

What this prevents:

- duplicate tiers with the same `minQuantity`

Overlap enforcement (in app):

- when creating or updating a tier, the API rejects overlapping quantity ranges for the same `(productId, variantId, currency)` via `BulkPricingService.assertNoOverlap` and admin bulk-pricing endpoints.

### Product view pricing

View surcharge rules are stored in:

- `ProductViewPricing`

Uniqueness includes currency:

- `@@unique([productId, variantId, productViewId, currency])`

## Discounts

### Discount model

Discounts are stored in `Discount` and attached through join tables:

- `DiscountProduct`
- `DiscountVariant`
- `DiscountCampaign`

Current campaign discount resolution in `PricingService`:

- finds the first matching active `DiscountCampaign`
- supports percentage or fixed discount
- applies the discount per unit
- returns `appliedDiscountId` on the quote so that order creation can persist an `OrderDiscount` record

Enforced at discount create/update (admin, `DiscountsService.validateActiveDiscountRules`):

- **One active discount per subject** (sitewide, or per campaign/product/variant). Subject is determined by scope and link tables.
- **FIXED requires currency.** For FIXED, only one active discount per (subject, currency).
- **PERCENTAGE and FIXED cannot both be active** for the same subject.

OrderDiscount usage:

- when a campaign order is created and a campaign discount was applied, an `OrderDiscount` row is created with `orderId`, `discountId`, `currency`, and `amountApplied` for audit and reporting.

## Campaign-Specific Economics

Campaign checkout distinguishes between:

- buyer price
- organizer cost basis

In campaign mode:

- `unitBasePrice` comes from `CampaignProductPrice`
- `organizerCostBasis` is separately derived from the underlying blank cost and applicable organizer-borne surcharge

This is useful for:

- organizer reporting
- payout calculations
- auditing the gap between selling price and underlying cost

Current limitation:

- organizer price floor is not enforced yet

Recommended rule:

- reject a campaign price if it is below the maximum effective organizer cost basis across eligible variants

## Current Rounding Policy

Implementation lives in:

- `apps/api/src/pricing/currency-rounding.ts`

Current configuration supports:

- `minorUnitsPerMajor`
- `roundingMode`
- `displayGranularity`

Supported rounding modes:

- `HALF_UP`
- `HALF_EVEN`
- `CEILING`
- `FLOOR`

Current `NGN` config:

- `minorUnitsPerMajor = 100`
- `roundingMode = HALF_EVEN`
- `displayGranularity = 100`

This means:

- line and intermediate money values are rounded to kobo precision
- final displayed order total is rounded to the nearest `100 NGN`

## Where Rounding Is Applied Today

### Rounded to minor units

The current implementation rounds to minor units at meaningful money boundaries, including:

- subtotal aggregation
- discount aggregation
- VAT amount
- organizer cost basis
- option upcharge sum
- bulk adjustment
- unit-before-discount
- unit final price
- line total
- campaign discount amount
- view surcharge total

### Rounded to display granularity

Only the final order total is rounded to display granularity:

- `totalAmount = roundToDisplayGranularity(totalBeforeDisplayRounding, currency)`

## Is The Current Rounding Good Enough?

For current NGN-only v1 checkout, the implementation is acceptable with caveats.

Strengths:

- rounding is centralized
- policy is configurable per currency entry
- float noise is reduced for fractional steps
- rounding happens at meaningful money boundaries instead of after every arithmetic operator

Caveats:

- arithmetic still uses JavaScript `number`, not exact decimal arithmetic
- display-granularity rounding can make `totalAmount` differ from the direct sum of persisted components
- there is no explicit `roundingAdjustment` field stored on `Order`
- `vatAmount` is returned in quotes but not currently stored on `Order`
- rounding configuration is not snapshotted onto the order for audit

Recommended follow-up improvements:

1. add `vatAmount` to the `Order` schema
2. add `roundingAdjustment` to the `Order` schema
3. document whether order reconciliation should use:
   - raw component sum, or
   - displayed final total with explicit adjustment
4. consider migrating pricing internals to exact decimal arithmetic if complexity increases

## Currency Strategy

The system is currently schema-driven for currency:

- `CurrencyCode` is an enum
- most price-bearing models store a `currency`

For the current Nigeria-only release, this is appropriate.

If multi-currency support is later introduced, separate:

- currency metadata
- pricing display policy

Intrinsic currency metadata:

- code
- symbol
- minor units per major unit

Business display policy:

- display granularity
- rounding mode
- optional merchandising endings

Merchandising endings such as `.99` should be treated as pricing-policy behavior, not intrinsic currency behavior.

## Documentation Requirements For Future Changes

Any change to pricing behavior must update:

- Swagger docs for affected endpoints and DTOs
- inline code documentation for non-trivial logic
- this document
- `docs/fundraising-campaign-management.md`
- tests covering:
  - standard quote calculation
  - campaign quote calculation
  - rounding behavior
  - overlap rejection for tiers or discounts
