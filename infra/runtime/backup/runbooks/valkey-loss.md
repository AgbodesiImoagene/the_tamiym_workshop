# Runbook: Valkey / queue loss

**Ticket:** TTW-067 · **Alert cues:** `valkey_pressure`, `queue_backlog`

## Detection

- Valkey OOM / `noeviction` write failures, data wipe, or host-local volume loss.
- Workers idle while PostgreSQL shows in-flight work needing jobs.

## Principle

Valkey is **reconstructable operational state**. PostgreSQL remains
authoritative for money, inventory, orders, refunds, and payouts. Never treat
a Valkey dump as financial truth.

## Recovery

1. Redeploy Valkey with `requirepass` from `/etc/tamiym/secrets.env`
   (TTW-063/065). Confirm bind is not public.
2. Restart worker / scheduler roles so they reconnect cleanly.
3. **Reconcile from PostgreSQL** using existing domain jobs / admin tools
   (TTW-015 reconcile where available):
   - payments / `charge_settlement_claims` — no duplicate settlement
   - refunds / payout claims — at-most-once provider effects
   - inventory reservations — release or consume exactly once
4. Safe requeue only for jobs whose business keys are not already claimed.
5. Sessions: users re-authenticate; do not restore session cookies from Valkey.

## Forbidden

- Replaying Paystack charge/refund/payout provider calls solely because a queue
  job was lost.
- Disabling idempotency checks to “drain faster”.

## Validation

- Queue depth returns to normal without duplicate ledger rows.
- Spot-check recent paid orders: one settlement claim per provider reference.
- Record incident timeline; RTO target ≤ 4 hours for recoverable host/queue loss.
