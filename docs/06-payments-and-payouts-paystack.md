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
  - `charge.success` takes an exactly-once `ChargeSettlementClaim` (`provider` + `businessKey = charge.success:{providerRef}`) inside one DB transaction with payment/order/campaign/ledger/audit/outbox mutations (TTW-010). Losing duplicates are successful no-ops; metrics use `charge_settlement_total{outcome}`.
  - Customer `PaymentConfirmed` outbox rows use `dedupeKey = PaymentConfirmed:{orderId}`.
  - At most one `PAYMENT_SETTLED` ledger credit per order (partial unique index).
  - Transfer webhooks (`transfer.success|failed|reversed`) apply conditional payout transitions atomically with at most one reserve, one success marker, and one release per payout (TTW-011); stale/out-of-order events are acknowledged without changing balances. Admin retry of a failed run payout creates a **new** payout row (same uniqueness constraints cannot re-reserve the failed id). The original is `CANCELLED` under a row lock so duplicate retries cannot double-initiate.
