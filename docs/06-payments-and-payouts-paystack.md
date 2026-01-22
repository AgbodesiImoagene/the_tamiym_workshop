# Payments & Payouts — Paystack (Nigeria-only v1)

## Principles

- Only Paystack is implemented now.
- All payment logic goes through an interface:
  - `PaymentProvider.createCheckout(...)`
  - `PaymentProvider.verifyWebhook(...)`
  - `PaymentProvider.refund(...)`
  - `PaymentProvider.payout(...)` (for fundraiser organizers)

## Customer payments

- Checkout creates an `Order` in `PENDING_PAYMENT`.
- Create Paystack transaction (initiate payment).
- Redirect customer to Paystack or embedded checkout (based on design).
- Webhook confirms:
  - Mark payment `SUCCEEDED`
  - Transition order to `PAID`
  - Emit `PaymentConfirmed` domain event

## Refunds (admin-triggered, policy-driven)

- Admin triggers refund request.
- Call Paystack refund (if supported for that payment type).
- Track refund status via webhook.
- Emit events and notify business owners.

## Fundraiser organizer payouts (Nigeria-only)

- Organizers must provide payout bank details (validated).
- Payouts are triggered by admin (recommended for v1), to avoid fraud.
- Use Paystack Transfers:
  - Create transfer recipient
  - Initiate transfer
  - Track status via webhook
- Emit `PayoutSucceeded` / `PayoutFailed`

## Security rules

- Verify Paystack webhook signatures.
- Never trust client-side payment success.
- Idempotency: webhook handlers must be idempotent (safe to re-run).
