# Public marketing site & fundraiser supporter flow

## Implemented (current)

- **Marketing site (`apps/web`):** Home decorative arcs, sticky header with mobile nav, consolidated nav (Workshop → customer app register, Fundraisers, About), footer CTA overlapping the dark footer per Figma-style layout.
- **Public campaign URL:** `GET /v1/public/fundraisers/:slug` returns **ACTIVE** campaigns only (see `CampaignsService.getBySlug`). Shareable link shape: `{NEXT_PUBLIC_WEB_URL}/fundraiser/{slug}` (local dev: `http://localhost:3000/fundraiser/{slug}`).
- **Public campaign page:** Story + description, goal progress (when `goalAmount` is set), sellable campaign offers from the API (ordered options, variants with boolean availability, display unit price = campaign base + option upcharges, labelled “before discounts, shipping and VAT”). Typed in-memory selection `{campaignId, campaignProductId, productId, variantId, designId, quantity}` is prepared for TTW-032; auth links do not yet persist it.
- **Account path for checkout:** “Continue to sign up & checkout” / “Sign in” use `?next=/dashboard/products` on the customer app (`apps/app`) so returning users land in the shop after auth. **`getSafeRedirectPath`** (`apps/app/lib/redirect-path.ts`) blocks open redirects (only same-origin paths starting with `/`).

## Not yet implemented (intentional next steps)

1. **Persisting selection through auth and completing payment** — Public payload now exposes `variantId` / campaign product IDs and the UI builds a typed selection; TTW-032 must carry that intent through web auth and checkout. See `14-auth-and-session-architecture.md` and `15-public-fundraiser-checkout-implementation-plan.md`.
2. **Public-site auth and checkout** — The recommended target architecture is to keep supporter checkout on `apps/web`, not redirect into `apps/app` mid-flow.
3. **Featured campaigns & discovery** — Homepage/landing modules, “active campaigns” search, and category filters are out of scope for this iteration.
4. **Ended / non-active campaigns** — Slug lookup for non-`ACTIVE` or out-of-window campaigns currently 404s; a future version could return a read-only “campaign closed” page.
5. **CDN caching** — Application-level 120s revalidate removed (TTW-031); CDN/edge cache deferred until stale-state tests exist.

## Environment

- `NEXT_PUBLIC_CUSTOMER_APP_URL` — customer app base URL (used for Workshop / auth links from marketing).
- `NEXT_PUBLIC_API_URL` — API base for `getPublicFundraiser` (default `http://localhost:3001/v1`).

## Design reference

- Figma: **TTW-Site** (see `.cursor/rules/Design-tokens.mdc`).
