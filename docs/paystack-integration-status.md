# Paystack integration status

Summary of what’s implemented vs. what’s left for payments, refunds, and payouts (per [Paystack docs](https://paystack.com/docs/) and `docs/06-payments-and-payouts-paystack.md`).

---

## Done

### Customer payments (Paystack)

- **Initiate payment** (`PaymentsService.initiatePayment`): creates `Payment` row, calls `POST https://api.paystack.co/transaction/initialize`, stores `providerRef` (Paystack reference), sets `order.paymentReference`, returns `authorization_url` for redirect.
- **Webhook** (`PaystackWebhookService`): verifies `x-paystack-signature` (HMAC SHA512), handles `charge.success` idempotently, updates `Payment` to `SUCCEEDED` and `Order` to `PAID` / `paymentStatus: SUCCEEDED`.
- **Schema**: `Payment` (provider, providerRef, idempotencyKey, status), `Order.paymentReference`; enums `PaymentStatus`, `PaymentProvider.PAYSTACK`.

### Pricing & order flows

- Pricing service and order creation (e.g. `PENDING_PAYMENT`) are in place; checkout can create an order and then call initiate-payment.

---

## Not done (remaining work)

### 1. Refunds — Paystack API + webhook

**Current:** `RefundsService.initiateRefund` only creates a `Refund` row with `RefundStatus.INITIATED`; it does **not** call Paystack.

**Remaining:**

1. **Call Paystack Refund API**  
   After creating the `Refund` row, call:
   - `POST https://api.paystack.co/refund`
   - Body: `{ "transaction": "<payment_reference>", "amount": <kobo>, "customer_note": "...", "merchant_note": "..." }`  
     Use the order’s `paymentReference` (Paystack transaction reference). Store Paystack refund reference in `Refund` if the API returns one (for idempotency/webhook correlation).

2. **Refund webhook (optional but recommended)**  
   If Paystack sends refund lifecycle events (e.g. `refund.processed` / `refund.failed`), handle them in `PaystackWebhookService` and update `Refund.status` to `SUCCEEDED` or `FAILED` so the system stays in sync.

3. **Tests**  
   Unit/integration tests for: create Refund → call Paystack refund → (if applicable) webhook updates status.

Ref: [Paystack Refund API](https://paystack.com/docs/api/refund/) (or support/docs); amount in kobo; full refund if `amount` omitted.

---

### 2. Payouts (Paystack Transfers) — full flow missing

**Current:** No payout/transfer service. Schema is ready: `UserPayoutProfile` (bank details for NGN), `Payout` (campaignId, recipientUserId, provider, providerRef, status, amount, currency).

**Remaining:**

1. **Transfer recipient (and optional validation)**
   - When saving or using organizer bank details, create a Paystack transfer recipient:  
     `POST https://api.paystack.co/transferrecipient`  
     Body (NGN nuban): `type: "nuban", name, account_number, bank_code, currency: "NGN"`.
   - Store `recipient_code` (e.g. on `UserPayoutProfile` or a dedicated field) so you can reuse it for multiple payouts.
   - Optionally validate account before creating recipient: use [Resolve Account Number](https://paystack.com/docs/identity-verification/verify-account-number/#resolve-account-number) (NGN).

2. **List banks**  
   For UI (bank selector): `GET https://api.paystack.co/bank?currency=NGN` (see [Creating Transfer Recipients](https://paystack.com/docs/transfers/creating-transfer-recipients/)).

3. **Initiate transfer**
   - Create a `Payout` row (status `INITIATED`).
   - Generate a unique transfer reference (e.g. UUID, 16–50 chars, [a-z0-9_-]).
   - Call `POST https://api.paystack.co/transfer` with:
     - `source: "balance"`
     - `amount` (kobo)
     - `recipient` (recipient_code)
     - `reference` (your idempotency/reference)
     - `reason` (e.g. “Campaign payout for &lt;campaignId&gt;”)
   - Store Paystack’s transfer reference/code in `Payout.providerRef`.

4. **Transfer webhooks**  
   In `PaystackWebhookService`, handle:
   - `transfer.success` → set `Payout.status = SUCCEEDED`, emit `PayoutSucceeded` (and any notifications).
   - `transfer.failed` / `transfer.reversed` → set `Payout.status = FAILED` (and/or handle reversed), emit `PayoutFailed`.

5. **Admin trigger (v1)**  
   Per docs, payouts are “triggered by admin” for v1: an admin endpoint that computes payout amount (e.g. from campaign/organizer logic), selects recipient (from `UserPayoutProfile` or campaign payout profile), creates recipient if needed, then initiates transfer and creates/updates `Payout`.

6. **Tests & observability**  
   Tests for: create recipient, initiate transfer, webhook updates; metrics e.g. `payouts_failed_total` as in `docs/09-observability-otel.md`.

Refs:

- [Transfers overview](https://paystack.com/docs/transfers/)
- [Creating transfer recipients](https://paystack.com/docs/transfers/creating-transfer-recipients/)
- [Single transfers](https://paystack.com/docs/transfers/single-transfers/) (initiate, verify, webhooks: `transfer.success`, `transfer.failed`, `transfer.reversed`).

---

### 3. Payment provider interface (optional for v1)

`docs/06-payments-and-payouts-paystack.md` says all payment logic should go through an interface (`PaymentProvider.createCheckout`, `verifyWebhook`, `refund`, `payout`). Currently the code uses Paystack directly in `PaymentsService`, `PaystackWebhookService`, and `RefundsService`. Introducing a `PaymentProvider` interface and a `PaystackPaymentProvider` implementation is optional for v1 but improves testability and future multi-provider support.

---

## Checklist (concise)

| Area             | Done | Left                                                                                               |
| ---------------- | ---- | -------------------------------------------------------------------------------------------------- |
| Initiate payment | Yes  | —                                                                                                  |
| Payment webhook  | Yes  | —                                                                                                  |
| Refund (DB row)  | Yes  | Call Paystack refund API; optional refund webhook; tests                                           |
| Payout (schema)  | Yes  | Create recipient; list banks; initiate transfer; transfer webhooks; admin trigger; tests & metrics |

---

## Suggested implementation order

1. **Refunds:** Add Paystack refund API call in `RefundsService` (using order `paymentReference`), then add refund webhook handling if Paystack supports it.
2. **Payouts:** Implement transfer-recipient creation (and optional account resolve), list banks endpoint for UI, then payout service (initiate transfer + create/update `Payout`), then `transfer.success` / `transfer.failed` (and `transfer.reversed`) in webhook, then admin endpoint and tests.

After that, Paystack integrations for payments, refunds, and payouts are complete for the current scope; the provider interface can be added when you want to abstract multiple providers.
