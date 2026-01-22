# Backend — NestJS + Prisma

## Tech choices

- NestJS (TypeScript)
- Prisma ORM
- PostgreSQL
- Redis (optional): background jobs + rate limiting
- OpenAPI/Swagger for API docs
- Class-validator for DTO validation

## OpenAPI / Swagger (required)

The backend must auto-generate OpenAPI documentation via Swagger.

Requirements:

- Swagger UI available in non-prod by default (e.g. `/docs`).
- OpenAPI JSON available at a stable route (e.g. `/docs-json`).
- DTOs must be decorated so schemas are accurate (no undocumented request bodies).
- Auth-protected endpoints must be marked accordingly (Bearer/cookie auth description).
- Version routes under `/v1/*` and group endpoints by tags (Products, Orders, Fundraising, Admin, etc.).

This is mandatory to support rapid implementation, testing, and AI-agent accuracy.

## Auth approach

- Cookie-based JWT (access token short-lived, refresh token longer-lived)
- Roles:
  - `CUSTOMER`
  - `ORGANIZER`
  - `ADMIN`
- Admin routes are protected and separated from customer routes.

## Modules (must exist)

1. `auth` — login/register, password reset (if in design), session mgmt
2. `users` — profiles, addresses
3. `products` — products, variants, categories, pricing, availability
4. `inventory` — stock flags, out-of-stock, variant availability (basic)
5. `designs` — design models, uploads, moderation status
6. `orders` — carts/checkout, order lifecycle, refunds (policy-driven)
7. `fundraising` — campaigns, campaign products, links, performance snapshots
8. `admin` — admin workflows (orders/products/inventory/moderation/campaigns)
9. `analytics` — pre-aggregated metrics + CSV export endpoints
10. `notifications` — event handlers and delivery (email/sms/slack)

## Order state machine (suggested)

- `DRAFT` (optional cart)
- `PENDING_PAYMENT`
- `PAID`
- `PROCESSING`
- `FULFILLED`
- `DELIVERED`
- `CANCELLED`
- `REFUNDED`

Admin may move between certain states; payment webhooks move `PENDING_PAYMENT` → `PAID`.

## Fundraising states (suggested)

- `DRAFT`
- `PENDING_REVIEW` (optional)
- `ACTIVE`
- `PAUSED`
- `DISABLED`
- `ENDED`

## Moderation states (design uploads/art)

- `PENDING`
- `APPROVED`
- `REJECTED`
- `FLAGGED`

## Data model must support (minimum)

- Products → Variants (size/color) → availability flags
- Designs: structured model with layers per view (front/back/sleeve)
- Orders: line items + references to selected designs and variants
- Fundraising: campaigns, campaign pages, organizer payout details (local bank)
- Admin audit: basic audit trail for critical admin actions (optional but valuable)

## API boundaries

- Customer API: `/v1/...`
- Admin API: `/v1/admin/...`
- Public campaign pages may use `/v1/public/fundraisers/:slug`

See `99-prd-traceability.md` for exact PRD mapping.
