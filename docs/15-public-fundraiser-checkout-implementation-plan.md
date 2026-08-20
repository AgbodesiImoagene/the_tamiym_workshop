# Public Fundraiser Checkout Implementation Plan

This document turns the target architecture in `14-auth-and-session-architecture.md` into an implementation sequence.

It is focused on one product goal:

- a supporter lands on a fundraiser page in `apps/web`
- stays on `apps/web` through auth, checkout, and payment initiation
- later uses `apps/app` for broader account and organizer workflows

## Outcome

After this work:

- fundraiser shopping is no longer forced through `apps/app`
- customer session works across `web` and `app`
- admin session remains isolated
- the public fundraiser page supports a minimal but real shopping flow

## Current state

Today:

- `apps/web` renders public fundraiser pages
- `apps/web` sends “Continue to sign up & checkout” and “Sign in” to `apps/app`
- API auth already supports cookie-based login and `/auth/me`
- API cookies are generic: `access_token` and `refresh_token`
- Google OAuth already distinguishes customer vs admin redirect target
- fundraiser public payload is not rich enough for full variant-aware checkout on `web`

## Guiding decisions

- No new `SUPPORTER` role
- Supporter accounts are `CUSTOMER` accounts
- `apps/web` owns fundraiser checkout UX
- `apps/app` owns account workspace and organizer workflows
- `apps/admin` uses separate session policy

## Workstreams

## 1. Auth and session policy

Goal:

- let customer auth work from both `web` and `app`
- avoid sharing the same browser cookie semantics with `admin`

### Backend changes

1. Split auth cookie names by audience

Recommended target:

- customer: `customer_access_token`, `customer_refresh_token`
- admin: `admin_access_token`, `admin_refresh_token`

This requires updates in:

- `apps/api/src/constants.ts`
- `apps/api/src/auth/auth-cookies.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/google-oauth.controller.ts`
- `apps/api/src/auth/strategies/jwt.strategy.ts`

2. Add audience-aware cookie helpers

Recommended shape:

- `setCustomerAuthTokenCookies()`
- `setAdminAuthTokenCookies()`
- `clearCustomerAuthTokenCookies()`
- `clearAdminAuthTokenCookies()`

3. Make cookie domain configurable

Add config such as:

- `COOKIE_PARENT_DOMAIN`
- `WEB_APP_URL`
- `CUSTOMER_APP_URL`
- `ADMIN_APP_URL`

Notes:

- today `FRONTEND_URL` is effectively used for the customer app in Google OAuth redirect logic
- rename or replace it so the intent is explicit

4. Review CORS configuration for all browser origins

Allow:

- `web`
- `app`
- `admin`

with credentialed requests.

5. Add CSRF strategy for cookie-authenticated browser writes

Because the target model uses shared customer session across subdomains, state-changing requests need deliberate CSRF handling before production release.

This can be implemented as:

- double-submit CSRF token, or
- origin + custom header strategy, or
- another well-defined browser CSRF mitigation layer

The exact technique can be chosen later, but it must be part of this workstream.

### Frontend changes

1. Add auth API client support in `apps/web`
2. Add `getMe`, login, register, logout handling in `apps/web`
3. Preserve fundraiser checkout context through auth round-trips

Recommended persisted context:

- `campaignSlug`
- selected campaign product
- selected variant
- quantity
- pending checkout return path

## 2. `apps/web` auth surface

Goal:

- users can authenticate from the public site without being redirected into `apps/app`

### Add routes or modal flow in `apps/web`

Recommended initial routes:

- `/auth/login`
- `/auth/register`

These should:

- use the same API auth endpoints already used by `apps/app`
- accept and preserve safe `next` paths
- support customer Google OAuth
- return users to fundraiser checkout context on success

### Update current fundraiser CTA behavior

Replace the current customer-app redirect helpers in `apps/web/lib/site.ts` with web-owned auth destinations for supporter checkout flows.

Examples:

- instead of redirecting to `app.tamiym.com/auth/login?next=...`
- use `www.tamiym.com/auth/login?next=/fundraiser/{slug}/checkout`

We can still keep links into `apps/app` for:

- “My account”
- “Order history”
- “Create your own fundraiser”

## 3. Fundraiser commerce API

Goal:

- let the public fundraiser page power real item selection and authenticated checkout

### Required backend capability

We need one of these models:

### Option A. Richer public fundraiser payload

Extend `GET /v1/public/fundraisers/:slug` to expose enough read-only product detail for real selection:

- campaign product id
- allowed variants
- variant attributes
- campaign price per variant or campaign-product pricing rules
- stock/availability signal if appropriate

Pros:

- simplest read model for `web`

Cons:

- larger public payload
- more care needed around what is safe to expose anonymously

### Option B. Dedicated authenticated campaign-cart endpoint

Keep the public payload lighter and add authenticated endpoints such as:

- `POST /v1/campaigns/:id/cart-items`
- or `POST /v1/me/campaign-cart-items`

Pros:

- tighter control over pricing and validation
- easier to evolve the internal cart model

Cons:

- still need enough public data to render real product choices before login

### Recommended approach

Use a hybrid:

- extend the public fundraiser payload enough to support real product and variant selection on `web`
- keep quote, order creation, and payment initiation authenticated

That preserves a responsive public shopping UI without pushing sensitive pricing logic into the browser.

### Additional backend checks

Ensure checkout paths validate:

- campaign is still `ACTIVE`
- campaign has not ended
- selected variant belongs to the campaign product
- campaign price exists and is valid
- inventory is available

## 4. `apps/web` fundraiser cart and checkout

Goal:

- deliver a minimal, campaign-scoped shopping experience entirely on `web`

### Phase 1: minimal single-campaign cart

Support:

- one active fundraiser context at a time
- one or more line items from the same campaign
- quantity editing
- shipping address selection/entry after login
- quote display
- Paystack initiation

This is enough for the product goal and avoids prematurely merging fundraiser checkout with the broader catalog cart.

### Phase 2: persistence and recovery

Add:

- local persisted cart state
- recovery after auth refresh
- recovery after Paystack return

### Phase 3: account handoff

After purchase:

- show success on `web`
- provide links into `apps/app` for order history and profile

## 5. `apps/app` role after the change

Goal:

- keep `apps/app` valuable without making it the in-flow checkout surface

`apps/app` should remain the place for:

- order history
- saved addresses
- profile management
- design workshop
- organizer campaign creation and monitoring

It should not be the required redirect target just because a supporter needs to sign in.

## 6. Admin session isolation

Goal:

- avoid customer session bleed into privileged operations

Required steps:

1. Separate admin cookie names
2. Ensure admin UI only reads admin session cookies
3. Keep admin login and logout distinct from customer login and logout behavior
4. Prefer shorter admin session lifetime
5. Reserve MFA for the admin hardening milestone

## 7. Documentation and naming cleanup

Goal:

- make configuration and intent easier to understand

Recommended cleanup:

- replace ambiguous `FRONTEND_URL` usage with `CUSTOMER_APP_URL` and `WEB_APP_URL`
- update auth and deployment docs when cookie names change
- update fundraiser docs when the checkout flow moves from `app` to `web`

## Suggested implementation order

1. Introduce customer/admin cookie separation in the API
2. Make cookie domain and frontend URL config explicit
3. Add `apps/web` auth routes and auth client
4. Preserve fundraiser checkout intent across auth
5. Extend fundraiser public payload for real selection
6. Build fundraiser cart state in `apps/web`
7. Add quote and create-order checkout screens in `apps/web`
8. Initiate Paystack from `apps/web`
9. Add success page and “view in account” handoff
10. Add CSRF hardening and production cookie/CORS review

## Test plan

### Backend

- auth cookie audience separation
- `/auth/me` for customer and admin session paths
- fundraiser quote/order authorization from `web` origin
- campaign checkout validation
- campaign ended / inactive enforcement

### Frontend

- fundraiser auth redirect preservation
- login/register return to checkout
- variant selection and quote flow
- create order and Paystack redirect
- success and retry flows

### End-to-end

1. Anonymous user lands on fundraiser page
2. Selects campaign item
3. Registers on `web`
4. Returns to checkout on `web`
5. Enters shipping details
6. Initiates payment
7. Lands on success page
8. Opens `apps/app` and sees authenticated account/order history

## Risks and mitigations

### Risk: auth sprawl across two customer-facing apps

Mitigation:

- keep API as the single auth authority
- share one customer session policy
- do not build separate identity models per frontend

### Risk: admin/customer cookie confusion

Mitigation:

- separate cookie names
- separate UI usage
- separate TTL and policy

### Risk: fundraiser checkout complexity grows into a second full store

Mitigation:

- keep the initial cart campaign-scoped
- avoid merging with general catalog cart in the first pass

### Risk: public API leaks too much internal commerce structure

Mitigation:

- expose only read-only data needed for selection
- keep quote, order creation, and payment initiation authenticated

## Deliverables

This plan should eventually result in:

- updated API auth cookie strategy
- `apps/web` customer auth flow
- `apps/web` fundraiser cart and checkout
- updated fundraiser public API contract
- updated deployment and auth docs

## Status

Recommended execution plan as of April 18, 2026.
