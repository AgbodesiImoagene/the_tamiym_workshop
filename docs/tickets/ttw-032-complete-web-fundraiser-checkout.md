# TTW-032 — Complete web fundraiser checkout

**Epic:** 3 — Complete customer and fundraiser revenue journeys  
**Status:** Not started  
**Risk:** High  
**Blocked by:** TTW-003, TTW-004, TTW-010, TTW-012, TTW-013, TTW-014, TTW-020, TTW-023, TTW-031  
**Blocks:** TTW-053, TTW-054

## Background

The public page collects placeholder choices but its register/login links preserve only the fundraiser URL. After auth, the selections are gone and no `apps/web` cart or checkout route exists. Campaign quote/order endpoints are authenticated and usable, while the only checkout UI in `apps/app` creates standard orders. That UI also generates a new order idempotency key per click and clears its cart before Paystack settlement. Payment callback configuration is a single URL and its default currently points at a web route that does not exist.

## Proposal

Keep supporter commerce on `apps/web`; `apps/app` remains the post-purchase account/order workspace. Implement a versioned, campaign-scoped local cart containing only campaign/product/variant/design ids and quantity—never trusted prices or PII. V1 supports one campaign at a time and one or more lines; switching campaigns requires an explicit replace confirmation. Persist cart and a stable order-submission idempotency key through password/Google auth, reload, provider redirect, back navigation, and retry.

Add web-owned checkout and order-confirmation routes. Authenticated, verified customers select/create a Nigeria shipping address, request an authoritative campaign quote, explicitly accept any price/availability change, create one campaign order, and initialize Paystack. Build the callback from trusted `WEB_APP_URL` plus order id on the server; reject unexpected provider authorization hosts. On return, treat query parameters as display-only and poll the owned order until backend webhook state is terminal. Retain cart/pending order on provider failure or timeout, clear only after confirmed settlement or explicit discard, and link successful customers to the TTW-033 account detail.

## Invariants

- All cart lines belong to one campaign and correspond to TTW-031 offers; ids/prices/availability are revalidated by the API at quote and order creation.
- Auth hand-offs preserve intent without placing cart JSON, PII, prices, tokens, or arbitrary external redirects in URLs.
- Repeated submit/refresh/back/retry creates at most one order for the same accepted cart/quote intent and at most one active payment attempt under TTW-012.
- A Paystack redirect or `reference` query parameter never marks an order paid; only verified backend settlement does.
- Cart is not destroyed while payment is pending/failed/unknown, and another user cannot read or resume an owned pending order.
- Customer cookies/CSRF/CORS follow TTW-020 and verification/session policy follows TTW-023.

## Implementation plan

1. Approve the one-campaign cart, retention/expiry, quote-drift confirmation, pending-order recovery, and post-purchase handoff decisions; define a versioned local schema and migration/discard behavior.
2. Implement web cart utilities/UI from TTW-031 typed selections, quantity/edit/remove/replace behavior, SSR-safe hydration, storage corruption/expiry handling, and no trusted client totals.
3. Preserve only a safe same-origin checkout path in password and Google auth; after auth, restore cart, require verification, and route to `/fundraiser/:slug/checkout`.
4. Add web address selection/creation, campaign quote, quote-review, order create, and initiation clients/routes. Persist one idempotency key per cart revision and one pending order id until resolved.
5. Change payment callback construction to trusted `WEB_APP_URL/orders/:id/confirm`, validate returned Paystack authorization URLs, and document per-environment CORS/cookie/CSRF configuration.
6. Add web confirmation/recovery UI that loads the owned order, polls pending state with a bounded strategy, supports safe retry, clears on success, and links to customer order detail.
7. Add provider-simulator and cross-surface Playwright journeys plus Swagger/shared contracts, analytics events, support copy, and PRD traceability.

## Test and observability plan

- Unit/component: cart schema migration/corruption/expiry, campaign replacement, stable idempotency key, auth-next sanitization, quote drift, address validation, pending/retry/success/error UI, keyboard/mobile behavior.
- Integration/e2e: web origin can call customer auth/address/campaign quote/order/initiation with CSRF; ownership and verification failures; callback/authorization URL allowlists; campaign status/date/price/stock revalidation.
- Failure, retry, and concurrency: duplicate submit, two tabs, refresh/back, provider initialization failure, abandoned redirect, failed/delayed/duplicate webhook, expired order, lost stock, changed price, ended campaign, and logout/user switch.
- Logs, metrics, traces, and alerts: funnel events for offer→auth→quote→order→provider→settled and recovery outcomes keyed by request/order ids only; alert on abnormal initialization and pending-age rates without cart/address data.

## References

- `apps/web/components/public-fundraiser-detail.tsx:61-71` — selection is local and auth return preserves only the fundraiser path.
- `apps/web/components/public-fundraiser-detail.tsx:282-294` — CTAs do not store or submit selected product/variant/quantity.
- `apps/web/app/auth/login/page.tsx:36-85` — safe `next` return exists for password login.
- `apps/web/app/auth/register/page.tsx:51-105` — registration uses the same path-only handoff.
- `apps/web/lib/redirect-path.ts:1-12` — same-origin redirect sanitizer.
- `apps/api/src/fundraising/campaigns.controller.ts:157-207` — authenticated campaign quote/order endpoints already exist.
- `apps/app/app/dashboard/checkout/page.tsx:132-146` — current standard checkout regenerates idempotency and clears cart before settlement.
- `apps/api/src/orders/payments.service.ts:72-90` — callback is one configured/default URL and provider redirect is accepted as returned.
- `docs/15-public-fundraiser-checkout-implementation-plan.md:100-255` — agreed web-owned supporter checkout direction.

## Acceptance criteria

- [ ] Product approves cart scope/expiry, quote-drift acceptance, pending recovery, and app handoff decisions recorded above.
- [ ] Real offer selections survive password and Google auth, reload, and provider round-trip without sensitive URL data.
- [ ] Verified customers can manage address, quote, accept drift, create one campaign order, and reach an allowlisted Paystack simulator URL entirely on `apps/web`.
- [ ] Duplicate clicks/tabs/reloads reuse the stable intent/order; integration evidence proves one order and one active payment attempt.
- [ ] Confirmation ignores untrusted redirect claims, polls owned backend state, retains recoverable cart on non-success, and clears only on settlement/explicit discard.
- [ ] Campaign ended/price changed/stock lost/order expired/provider failed/delayed webhook states are actionable and non-destructive.
- [ ] Cross-origin CSRF/session/ownership/verification tests and responsive accessible Playwright supporter journey pass.
- [ ] Swagger/shared contracts, environment docs, funnel telemetry, support copy, and PRD traceability are updated.
- [ ] High-risk security and independent implementation review pass.

## Out of scope

- Standard catalogue cart unification across `web` and `app` → follow-up after TTW-053.
- Customer account order detail → TTW-033.
- Payment/refund/inventory correctness internals → TTW-010, TTW-012, TTW-013, TTW-014.
- Returns, shipment tracking, and delivery exceptions → TTW-040, TTW-041.

## Design review

Record product/security reviewers, date, cart/expiry/recovery decisions, data-flow and threat model, API/callback interfaces, drift and failure UX, analytics/privacy, tests, and verdict.

## Implementation reviews

Record security and implementation iterations, checkout/idempotency/CSRF findings, fixes, evidence, dimension verdicts, and overall verdict.

## Verification evidence

Record exact unit/integration/Playwright commands, two-tab/duplicate/provider scenario names, database counts, trace ids, accessibility checks, and environment validation.

## Completion summary

Summarize cart/auth/checkout/callback behavior, recovery decisions, deviations, configuration/operations notes, PR, and account handoff.
