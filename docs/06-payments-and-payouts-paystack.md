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
  - TTW-012: reserve a `PENDING` payment row **before** calling Paystack (`providerRef` = attempt reference + `Idempotency-Key`). A partial unique index allows at most one `PENDING`/`INITIATED` attempt per order. **Only the DB-reserve winner** calls Paystack initialize (single-flight). Concurrent losers poll until `INITIATED` and reuse the same `authorizationUrl`, or receive `409` while the winner is still in flight. Expired or stale-`PENDING` attempts become `FAILED` so a new attempt can start. Metrics: `payment_initiation_total{outcome=created|reused|blocked|failure}`.
- Redirect customer to Paystack or embedded checkout (based on design).
- Webhook confirms:
  - Mark payment `SUCCEEDED`
  - Transition order to `PAID`
  - TTW-014: consume reserved inventory for tracked lines in the same settlement transaction (`InventoryMovement` effect keys `inventory.consume:orderItem:{id}`)
  - Emit `PaymentConfirmed` domain event

## Inventory lifecycle (TTW-014)

- Order create reserves stock with effect key `inventory.reserve:orderItem:{id}` after line rows exist.
- Unpaid cancel/expiry releases with `inventory.release:orderItem:{id}` (guarded counters; no-op if already released or consumed).
- Payment settlement consumes (`reserved` and `stockOnHand` decrement together). Refunds do not restock (→ TTW-041).
- Policy ADR: `docs/decisions/ttw-014-inventory-consumption-policy.md`.
- Metrics: `inventory_movement_total{kind,outcome}`.

## Refunds (admin-triggered, policy-driven)

- Admin triggers refund request (optional `idempotencyKey`).
- TTW-013: reserve an `INITIATED` refund row under a cumulative captured-value cap **before** calling Paystack. Provider acceptance moves the row to `PROCESSING` / `NEEDS_ATTENTION`; order/campaign/ledger values do **not** change yet.
- Webhooks: `refund.pending|processing|needs-attention` update local status only; `refund.failed` releases the in-flight reservation; `refund.processed` takes an exactly-once `RefundSettlementClaim` (`provider` + `businessKey = refund.processed:{providerRef}`) and applies financial effects once.
- On confirmed success: order becomes `PARTIALLY_REFUNDED` or `REFUNDED` from cumulative succeeded amounts; campaign `currentAmount` decrements; one `REFUND_APPLIED` ledger row per refund (partial unique index); customer/admin notifications use `dedupeKey = RefundCompleted:{refundId}`.
- Metrics: `refund_settlement_total{outcome}`.

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
