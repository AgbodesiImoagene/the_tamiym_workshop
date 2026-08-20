# TTW-055 — Unify standard catalogue cart and checkout on the web

**Epic:** 3 — Complete customer and fundraiser revenue journeys\
**Status:** Deferred — post-v1 experience consolidation\
**Risk:** High\
**Blocked by:** TTW-012, TTW-020, TTW-023, TTW-032, TTW-053\
**Blocks:** None

## Background

Standard catalogue browsing/cart/checkout currently lives in `apps/app`, while TTW-032 places public fundraiser discovery, auth and checkout on `apps/web`. This leaves two commerce implementations and inconsistent recovery behaviour. The standard checkout currently generates a new order idempotency key per click and clears the cart immediately after payment initialization, before provider-confirmed settlement.

## Proposal

After the v1 journeys are stable, make `apps/web` the canonical pre-purchase commerce surface for both standard and fundraiser orders while `apps/app` remains the post-purchase account/workshop surface. Extract one versioned cart-intent model and shared checkout orchestration with explicit order kind (`STANDARD` or single `CAMPAIGN`), authoritative quotes, stable idempotency and pending-order recovery.

Migrate compatible local carts deliberately; never merge campaign and standard lines implicitly. Keep only identifiers/quantity locally, preserve safe same-origin auth return, and clear an intent only after backend-confirmed terminal settlement or explicit discard. Retire old app routes through measured redirects after feature-parity and rollback evidence.

## Invariants

- A cart intent is either standard or belongs to exactly one campaign; switching kind/campaign requires explicit replacement confirmation.
- Client cart state is not pricing, availability, tax, shipping or inventory authority.
- One cart revision/accepted quote creates at most one order and active payment attempt across clicks, tabs, auth and provider redirects.
- Pending/failed/unknown payment retains recoverable intent; a redirect query never marks an order paid.
- Auth returns are same-origin and contain no cart JSON, PII, tokens or arbitrary external destinations.
- Route consolidation cannot orphan an in-flight order or make ownership boundaries differ by frontend.

## Implementation plan

1. Approve canonical surface, cart kinds/expiry, migration, route retirement, analytics baseline and rollback thresholds.
2. Define shared cart-intent schema/utilities, stable revision/effect keys and corruption/version migration; extract reusable quote/recovery contracts without cross-app UI coupling.
3. Implement standard catalogue/cart on `apps/web` with parity for variant/design selections, quantities, accessibility and responsive behaviour.
4. Generalize TTW-032 checkout orchestration to standard and campaign quote/order endpoints while enforcing non-mixing and authoritative drift acceptance.
5. Implement stable pending order/payment recovery, cross-tab coordination and settlement-only clear for both kinds.
6. Preserve safe password/Google auth intent; link post-purchase account/order/workshop actions into `apps/app` through approved same-origin destinations.
7. Add measured redirects/deprecation for old app product/cart/checkout routes only after parity, telemetry and rollback rehearsal.
8. Update Swagger/shared contracts, navigation, SEO, analytics, support/docs and Playwright cross-surface fixtures.

## Test and observability plan

- Unit/component: schema migration/corruption/expiry, kind switching, stable keys, quote drift, route migration and accessible cart/checkout UI.
- Integration/e2e: standard/campaign non-mixing, auth/session/CSRF, quote/order ownership, one order/attempt and retired-route recovery.
- Failure, retry, and concurrency: two tabs, repeat submit, logout/user switch, provider timeout/failure/delayed webhook, price/stock change and rollback to old route.
- Playwright: browse standard product on web, customize/cart/auth/quote/pay/recover/confirm, fundraiser parity, old-route redirect and mobile/keyboard/a11y checks.
- Logs, metrics, traces, and alerts: funnel and recovery by safe cart kind, duplicate prevention, checkout error/pending age and redirect fallback without cart/address PII.

## References

- `apps/app/app/dashboard/cart/page.tsx:16-185` — standard cart is implemented only in the customer app.
- `apps/app/app/dashboard/checkout/page.tsx:132-145` — checkout generates an idempotency key per submit and clears before settlement.
- `apps/web/app/fundraiser/[slug]/page.tsx` — public fundraiser discovery already lives on the web surface.
- `docs/tickets/ttw-032-complete-web-fundraiser-checkout.md` — web fundraiser checkout intentionally defers standard catalogue unification.
- `docs/15-public-fundraiser-checkout-implementation-plan.md:223-261` — initial scope deliberately avoids prematurely merging carts.

## Acceptance criteria

- [ ] Product approves the canonical surface, cart kinds/expiry, migration, retirement telemetry and rollback policy.
- [ ] Standard catalogue-to-settlement runs on `apps/web` with feature/accessibility parity and post-purchase app handoff.
- [ ] Standard and fundraiser flows use one tested intent/idempotency/recovery model while preventing implicit line mixing.
- [ ] Duplicate tabs/clicks/auth/provider retries create one order and active payment attempt; cart clears only after settlement/explicit discard.
- [ ] Old routes preserve in-flight intent through measured redirects and can be restored by rehearsed rollback.
- [ ] Cross-surface Playwright, integration, accessibility and responsive regression suites pass.
- [ ] High-risk design, security and independent implementation reviews pass.

## Out of scope

- Native mobile application or cross-device server-side carts → future product tickets.
- Multi-seller/multi-campaign carts → future commerce architecture ticket.
- Payment/refund/inventory internals → TTW-010 through TTW-014.

## Design review

Pending. Include journey/route map, cart state model, auth/data-flow threat model, idempotency and recovery sequences, migration/rollback, analytics and full cross-surface matrix.

## Implementation reviews

Pending. Require independent implementation and security reviews.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
