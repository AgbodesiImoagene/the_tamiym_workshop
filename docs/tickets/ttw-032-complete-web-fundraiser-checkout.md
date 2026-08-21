# TTW-032 — Complete web fundraiser checkout

**Epic:** 3 — Complete customer and fundraiser revenue journeys  
**Status:** In progress (slice 1)  
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

1. Approve the one-campaign cart, retention/expiry, quote-drift confirmation, pending-order recovery, and post-purchase handoff decisions; define a versioned local schema and migration/discard behavior. → **done (slice 1 interim policy).**
2. Implement web cart utilities/UI from TTW-031 typed selections, quantity/edit/remove/replace behavior, SSR-safe hydration, storage corruption/expiry handling, and no trusted client totals. → **done (slice 1).**
3. Preserve only a safe same-origin checkout path in password and Google auth; after auth, restore cart, require verification, and route to `/fundraiser/:slug/checkout`. → **done (password path; Google deferred polish).**
4. Add web address selection/creation, campaign quote, quote-review, order create, and initiation clients/routes. Persist one idempotency key per cart revision and one pending order id until resolved. → **done (slice 1).**
5. Change payment callback construction to trusted `WEB_APP_URL/orders/:id/confirm`, validate returned Paystack authorization URLs, and document per-environment CORS/cookie/CSRF configuration. → **done (slice 1).**
6. Add web confirmation/recovery UI that loads the owned order, polls pending state with a bounded strategy, supports safe retry, clears on success, and links to customer order detail. → **done (slice 1; TTW-033 deep link still account orders list).**
7. Add provider-simulator and cross-surface Playwright journeys plus Swagger/shared contracts, analytics events, support copy, and PRD traceability. → **deferred (Playwright matrix / funnel telemetry).**

## Test and observability plan

- Unit/component: cart schema migration/corruption/expiry, campaign replacement, stable idempotency key, auth-next sanitization, quote drift, address validation, pending/retry/success/error UI, keyboard/mobile behavior.
- Integration/e2e: web origin can call customer auth/address/campaign quote/order/initiation with CSRF; ownership and verification failures; callback/authorization URL allowlists; campaign status/date/price/stock revalidation.
- Failure, retry, and concurrency: duplicate submit, two tabs, refresh/back, provider initialization failure, abandoned redirect, failed/delayed/duplicate webhook, expired order, lost stock, changed price, ended campaign, and logout/user switch.
- Logs, metrics, traces, and alerts: funnel events for offer→auth→quote→order→provider→settled and recovery outcomes keyed by request/order ids only; alert on abnormal initialization and pending-age rates without cart/address data.

## References

- `docs/fundraising/ttw-032-interim-policy.md` — policy `web-fundraiser-checkout/v1-interim-2026-08-21`.
- `apps/web/lib/campaign-cart.ts` — versioned local cart.
- `apps/web/app/fundraiser/[slug]/checkout/page.tsx` — quote / accept / create / initiate.
- `apps/web/app/orders/[id]/confirm/page.tsx` — poll owned order; clear cart on SUCCEEDED.
- `apps/api/src/orders/payments.service.ts` — `WEB_APP_URL` campaign callback + auth host allowlist.

## Acceptance criteria

- [x] Product/engineering interim approves cart scope, quote-drift acceptance, pending recovery, and app handoff decisions (`web-fundraiser-checkout/v1-interim-2026-08-21`).
- [x] Offer selections persist in scoped localStorage through auth `next=/fundraiser/:slug/checkout` without sensitive URL data (password path; Google polish deferred).
- [x] Verified customers can manage address, quote, accept drift, create one campaign order, and initiate Paystack on `apps/web`.
- [x] Stable cart `idempotencyKey` per revision; payment initiation still TTW-012 single active attempt.
- [x] Confirmation ignores untrusted redirect claims, polls owned backend state, retains cart on non-success, clears on settlement/explicit discard.
- [ ] Campaign ended/price changed/stock lost/order expired/provider failed/delayed webhook states — partial (API errors surface; full UX matrix deferred).
- [ ] Cross-origin CSRF/session Playwright supporter journey — deferred.
- [x] Env docs (`WEB_APP_URL`, authorization hosts) + OpenAPI `emailVerified` on `/auth/me`; funnel telemetry deferred.
- [ ] High-risk security and independent implementation review pass.

## Out of scope

- Standard catalogue cart unification across `web` and `app` → TTW-055.
- Customer account order detail → TTW-033.
- Payment/refund/inventory correctness internals → TTW-010, TTW-012, TTW-013, TTW-014.
- Returns, shipment tracking, and delivery exceptions → TTW-040, TTW-041.

## Design review

**Date:** 2026-08-21  
**Policy version:** `web-fundraiser-checkout/v1-interim-2026-08-21`  
**Charter:** Product + security interim for slice 1 web-owned campaign cart/checkout.

### Decisions

| Topic               | Decision                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Cart scope          | One campaign; confirm replace on switch; ids+qty only; `schemaVersion` + stable `idempotencyKey` + optional `pendingOrderId`. |
| Storage             | `localStorage` key `ttw.web.campaign-cart.v1`; corrupt/unknown schema → discard.                                              |
| Auth `next`         | Path-only to `/fundraiser/:slug/checkout`.                                                                                    |
| Callback            | Campaign orders → `{WEB_APP_URL}/orders/:id/confirm`; catalogue → customer app base.                                          |
| Authorization hosts | Allowlist (`PAYSTACK_AUTHORIZATION_HOSTS`, default Paystack checkout hosts).                                                  |
| Confirm             | Query params display-only; poll `GET /orders/:id` until terminal.                                                             |
| Cart retention      | Clear only on SUCCEEDED or explicit discard; retain on pending/failed.                                                        |
| Drift               | Explicit checkbox acceptance of authoritative quote before create/initiate.                                                   |
| CSRF                | Web `apiClient` echoes `X-CSRF-Token` like `apps/app`.                                                                        |

**Verdict:** Proceed with slice 1 under interim policy (formal legal/T&S + independent dual review still required before production go-live claims).

## Implementation reviews

_Pending independent implementation + security review after commit._

## Verification evidence

```text
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter api typecheck
pnpm --filter api lint
node --experimental-strip-types --test apps/web/lib/campaign-cart.test.ts
  # 9 passed
pnpm --filter api exec jest --testPathPatterns='payments.service.spec|jwt.strategy.spec|auth.controller.spec' --coverage=false
  # 3 suites / 74 tests passed
node scripts/quality/check-diff-coverage.mjs --base origin/main --floor 80
  # 29/29 lines (100%) — pass
```

## Completion summary

_Slice 1 (this commit):_ web campaign cart, checkout + confirm routes, CSRF on web API client, `emailVerified` on `/auth/me`, campaign-aware Paystack callback via `WEB_APP_URL`, authorization-host allowlist. Playwright matrix, Google-auth polish, and funnel telemetry deferred.
