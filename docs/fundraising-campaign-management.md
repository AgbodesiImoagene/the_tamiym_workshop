# Fundraising Campaign Management

## Purpose

This document explains the current organizer-facing fundraising campaign flow in the API, how campaign pricing works today, and the main constraints and gaps that matter for future changes.

Primary implementation references:

- `apps/api/src/fundraising/campaigns.controller.ts`
- `apps/api/src/fundraising/campaigns.service.ts`
- `apps/api/src/pricing/pricing.service.ts`
- `apps/api/src/orders/orders.service.ts`
- `apps/api/prisma/schema.prisma`

## Current Organizer Flow

### 1. Create campaign

Endpoint:

- `POST /campaigns`

Current behavior:

- Allowed for `ORGANIZER` and `ADMIN`.
- Accepts `title`, optional `slug`, optional `description`, `story`, `goalAmount`, `startDate`, and `endDate`.
- If `slug` is omitted, the service generates one from `title`.
- Slug must be unique.
- Campaign is created with:
  - `status = DRAFT`
  - `currency = DEFAULT_CURRENCY` (`NGN`)

Relevant code:

- `CampaignsController.create()`
- `CampaignsService.create()`

### 2. List own campaigns

Endpoint:

- `GET /campaigns`

Current behavior:

- Returns organizer-owned campaigns ordered by newest first.
- Includes attached `CampaignProduct` records and basic product details.

Relevant code:

- `CampaignsController.findAll()`
- `CampaignsService.findAll()`

### 3. Get one campaign

Endpoint:

- `GET /campaigns/:id`

Current behavior:

- Organizer-only access.
- Returns campaign details with attached products and optional linked design.

Relevant code:

- `CampaignsController.findOne()`
- `CampaignsService.findOne()`

### 4. Update campaign

Endpoint:

- `PATCH /campaigns/:id`

Current behavior:

- Organizer-only access.
- Can update:
  - `title`
  - `slug`
  - `description`
  - `story`
  - `status`
  - `goalAmount`
  - `startDate`
  - `endDate`
- Slug uniqueness is rechecked.

Payout mode override (`payoutModeOverride`) is **admin-only**: `PATCH /admin/campaigns/:id/payout-policy` with `{ "payoutModeOverride": "MANUAL" | "AUTO_APPROVAL_REQUIRED" | "AUTO_EXECUTE" }` or `null` to clear.

Important note:

- Organizers can currently set lifecycle status directly.
- There is no dedicated review/publish workflow in the service layer yet.

Relevant code:

- `CampaignsController.update()`
- `CampaignsService.update()`

### 5. Add product to campaign

Endpoint:

- `POST /campaigns/:id/products`

Current behavior:

- Organizer-only access.
- Accepts:
  - `productId`
  - optional `designId`
  - optional `price`
- Validates:
  - campaign exists
  - organizer owns the campaign
  - product exists
  - if `designId` is provided, the design exists and belongs to the same product
- Creates a `CampaignProduct`.
- If `price` is provided and `price > 0`, creates one `CampaignProductPrice` row in `NGN`.

Relevant code:

- `AddCampaignProductDto`
- `CampaignsController.addProduct()`
- `CampaignsService.addProduct()`

## Public Campaign Flow

### 6. Public fundraiser page

Endpoint:

- `GET /public/fundraisers/:slug`

Current behavior:

- Public endpoint.
- Only returns campaigns with `status = ACTIVE`.
- Includes:
  - campaign metadata
  - public organizer details
  - attached campaign products
  - performance snapshot with `currentAmount`, `goalAmount`, and `currency`

Relevant code:

- `PublicFundraisersController.getBySlug()`
- `CampaignsService.getBySlug()`

## Buyer Checkout Flow For Campaigns

### 7. Quote campaign order

Endpoint:

- `POST /campaigns/:id/orders/quote`

Current behavior:

- Authenticated endpoint.
- Validates campaign existence and shipping address ownership.
- Prices each requested variant through campaign pricing rules.
- Returns:
  - line items
  - subtotal
  - discount
  - shipping
  - VAT
  - total

Relevant code:

- `CampaignsController.quoteCampaignOrder()`
- `PricingService.quoteCampaign()`

### 8. Create campaign order

Endpoint:

- `POST /campaigns/:id/orders`

Current behavior:

- Authenticated endpoint.
- Reuses `PricingService.quoteCampaign()`.
- Checks inventory before transaction.
- Reserves inventory in transaction.
- Creates an order in `PENDING_PAYMENT`.
- Snapshots pricing detail onto each `OrderItem`, including:
  - `unitBasePrice`
  - `unitDiscountAmount`
  - `unitFinalPrice`
  - `variantSnapshot`
  - `pricingBreakdown`
  - `organizerCostBasis`

Relevant code:

- `CampaignsController.createCampaignOrder()`
- `OrdersService.createCampaignOrder()`

### 9. Organizer campaign order reporting

Endpoint:

- `GET /campaigns/:id/orders`

Current behavior:

- Organizer-only access.
- Returns redacted order data with line-level economics.
- Does not expose buyer PII.
- Includes fields useful for organizer reporting such as:
  - `unitBasePrice`
  - `unitDiscountAmount`
  - `unitFinalPrice`
  - `organizerCostBasis`
  - `pricingBreakdown`

Relevant code:

- `CampaignsController.getCampaignOrders()`
- `OrdersService.findOrdersByCampaignForOrganizer()`

## Current Campaign Pricing Model

### Data model

Today, campaign pricing is stored at the `CampaignProduct` level:

- `CampaignProduct` is uniquely identified by:
  - `campaignId`
  - `productId`
  - optional `designId`
- `CampaignProductPrice` stores one price per currency for that `CampaignProduct`.

This means campaign pricing is currently:

- product-aware
- optional-design-aware
- not variant-aware

### Runtime pricing behavior

In campaign checkout:

1. Buyer chooses a `variantId`.
2. `PricingService` loads the variant and derives `productId`.
3. The service looks up the matching `CampaignProduct` by:
   - `campaignId`
   - derived `productId`
   - `designId`
4. The matching `CampaignProductPrice` becomes the buyer `unitBasePrice`.
5. The organizer's economic reference is computed separately as `organizerCostBasis`.

`organizerCostBasis` currently represents:

- underlying variant or product base price
- plus any organizer-borne view surcharge

In campaign mode:

- buyer does not pay view surcharge
- organizer cost basis may still include it for payout math and audit

## Current Gaps

### Gap 1: price is not variant-aware

Because the organizer sets one campaign price at the product or product+design level, the same price may cover multiple variants with different costs.

Risk:

- a price that is profitable for one variant may be loss-making for another

### ~~Gap 2: no enforced campaign price floor~~ (implemented)

When adding a product with a price, the API now enforces:

- `campaign price >= max organizer cost basis` across all variants for that product (and optional design).
- Organizer cost basis = variant base price + applicable view/design surcharge (option upcharges remain customer-borne).
- `PricingService.getMinCampaignProductPrice()` computes the floor; `CampaignsService.addProduct()` rejects lower prices with a clear error message.

### Gap 3: organizer status transitions are permissive

Organizers can currently update `status` directly through the general update endpoint.

If moderation or publication rules are needed later, status transitions should move behind explicit workflow rules.

## Recommended Direction

### Implemented: minimum campaign product price

The product-level floor is enforced:

- Organizer enters one campaign price per `CampaignProduct` when adding a product.
- Backend computes the maximum organizer cost basis (variant base + view/design surcharge) across all variants for that product and optional design.
- If the provided price is below that floor, the API returns `400 Bad Request` with a message that the price must be at least the computed minimum.

### Longer-term option

Add optional advanced pricing:

- default mode: one simple campaign price
- advanced mode: per-variant campaign price overrides

That allows power users to tune margins without forcing every organizer through a complex setup.

## Documentation Requirements For Future Changes

Any change to campaign management or campaign pricing should update:

- Swagger endpoint descriptions and DTO docs
- this document
- `docs/pricing-strategy.md`
- tests covering:
  - organizer product setup
  - campaign quote generation
  - campaign order creation
  - price floor validation
