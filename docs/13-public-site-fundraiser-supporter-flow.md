# Public marketing site & fundraiser supporter flow

## Implemented (current)

- **Marketing site (`apps/web`):** Home decorative arcs, sticky header with mobile nav, consolidated nav (Workshop → customer app register, Fundraisers, About), footer CTA overlapping the dark footer per Figma-style layout.
- **Public campaign URL:** `GET /v1/public/fundraisers/:slug` returns **ACTIVE** campaigns only (see `CampaignsService.getBySlug`). Shareable link shape: `{NEXT_PUBLIC_WEB_URL}/fundraiser/{slug}` (local dev: `http://localhost:3000/fundraiser/{slug}`).
- **Public campaign page:** Story + description, goal progress (when `goalAmount` is set), product list with selection when multiple products, campaign price from API, placeholder color/size/quantity (choices are not yet tied to real variants on the public API).
- **Account path for checkout:** “Continue to sign up & checkout” / “Sign in” use `?next=/dashboard/products` on the customer app (`apps/app`) so returning users land in the shop after auth. **`getSafeRedirectPath`** (`apps/app/lib/redirect-path.ts`) blocks open redirects (only same-origin paths starting with `/`).

## Not yet implemented (intentional next steps)

1. **Campaign line items in cart/checkout** — Public payload does not expose `variantId` / campaign product IDs required for `quoteOrder` / `createOrder`. Next work: either extend the public API (read-only variant + campaign price) or a dedicated campaign-cart endpoint usable from `apps/web` after login.
2. **Public-site auth and checkout** — The recommended target architecture is to keep supporter checkout on `apps/web`, not redirect into `apps/app` mid-flow. See `14-auth-and-session-architecture.md`.
   Execution plan: `15-public-fundraiser-checkout-implementation-plan.md`.
3. **Deep link preservation** — If any fallback handoff to `apps/app` remains, append `?campaignSlug=&campaignProductId=` (or similar) to preserve context.
4. **Featured campaigns & discovery** — Homepage/landing modules, “active campaigns” search, and category filters are out of scope for this iteration.
5. **Ended / non-active campaigns** — Slug lookup for non-`ACTIVE` campaigns currently 404s; a future version could return a read-only “campaign closed” page.

## Environment

- `NEXT_PUBLIC_CUSTOMER_APP_URL` — customer app base URL (used for Workshop / auth links from marketing).
- `NEXT_PUBLIC_API_URL` — API base for `getPublicFundraiser` (default `http://localhost:3001/v1`).

## Design reference

- Figma: **TTW-Site** (see `.cursor/rules/Design-tokens.mdc`).
