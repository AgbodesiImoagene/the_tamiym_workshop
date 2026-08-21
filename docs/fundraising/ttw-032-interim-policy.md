# TTW-032 — Web fundraiser checkout (interim v1)

**Policy version:** `web-fundraiser-checkout/v1-interim-2026-08-21`  
**Status:** Engineering interim — approved for slice 1 implementation; full Playwright matrix and Google-auth-specific polish deferred.

This matrix is the working source of truth for the web-owned campaign cart, auth hand-off, checkout, Paystack callback, and confirmation recovery behaviour.

## Cart scope

| Rule               | Value                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Campaigns per cart | Exactly one. Switching campaigns requires an explicit replace confirmation.                                            |
| Lines              | One or more; each line is a TTW-031 offer selection.                                                                   |
| Stored fields      | `campaignId`, `campaignProductId`, `productId`, `variantId`, `designId`, `quantity` only (plus schema metadata below). |
| Never stored       | Prices, totals, PII, tokens, addresses, Paystack references.                                                           |
| Metadata           | `schemaVersion`, stable `idempotencyKey`, optional `pendingOrderId`, `updatedAt`.                                      |
| Storage            | `localStorage` key `ttw.web.campaign-cart.v1` (browser-scoped). Corrupt or unknown schema → discard.                   |
| Idempotency        | One stable key per cart revision (any line/campaign change regenerates the key and clears `pendingOrderId`).           |

## Auth hand-off

| Rule            | Value                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `next` query    | Path-only, same-origin sanitizer (`getSafeRedirectPath`).                                                     |
| Checkout return | `/fundraiser/:slug/checkout` when the cart has lines for that campaign.                                       |
| Never in URLs   | Cart JSON, prices, PII, tokens, or arbitrary external redirects.                                              |
| Session         | Cookie + CSRF double-submit (TTW-020); web mutates with `X-CSRF-Token`.                                       |
| Verification    | Verified email required before order create (TTW-023); unverified users are gated to verify with safe `next`. |

## Quote, order, payment

| Rule                | Value                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Quote authority     | Authenticated `POST /v1/campaigns/:id/orders/quote`.                                                                                             |
| Drift               | Client never trusts public display prices for settlement. User must review the authoritative quote and explicitly accept before create/initiate. |
| Order create        | `POST /v1/campaigns/:id/orders` with body `idempotencyKey` from the cart revision.                                                               |
| Payment             | `POST /v1/orders/:id/initiate-payment`; at most one active attempt (TTW-012).                                                                    |
| Callback            | Server builds `{WEB_APP_URL}/orders/{orderId}/confirm` for campaign orders.                                                                      |
| Authorization hosts | Reject Paystack `authorizationUrl` hosts outside the configured allowlist.                                                                       |

## Confirmation and cart retention

| Rule                 | Value                                                                   |
| -------------------- | ----------------------------------------------------------------------- |
| Return query params  | Display-only (`reference`, etc.). Never mark paid from redirect claims. |
| Status source        | Poll owned `GET /v1/orders/:id` until payment/order terminal.           |
| Terminal (stop poll) | `paymentStatus` `SUCCEEDED` or `FAILED`, or `orderStatus` `CANCELLED`.  |
| Clear cart           | Only after `SUCCEEDED` / settled paid, or explicit discard by the user. |
| Retain cart          | Pending, failed, unknown, abandoned redirect, or delayed webhook.       |

## Deferred

- Full Playwright supporter matrix (smoke optional)
- Google OAuth surface-specific polish beyond existing web auth
- Multi-line advanced cart UX polish
- Customer account order detail deep-link (TTW-033)
