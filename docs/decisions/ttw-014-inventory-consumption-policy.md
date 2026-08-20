# ADR: Inventory reservation consumption (TTW-014)

**Status:** Accepted (agent + backlog owner default)  
**Date:** 2026-08-20  
**Ticket:** TTW-014

## Decision

1. **Consume on provider-confirmed payment settlement.** When `charge.success` wins a `ChargeSettlementClaim` and the order transitions `PENDING_PAYMENT → PAID`, each tracked line converts reservation to consumed stock in the same DB transaction (`reserved -= qty`, `stockOnHand -= qty`).
2. **Release on unpaid cancel/expiry only.** Admin cancel and order-expiry cron from `PENDING_PAYMENT` release reserved stock. Conditional `UPDATE` prevents negative `reserved`.
3. **No automatic restock on refund.** Confirmed refunds (TTW-013) do not restore inventory. Physical disposition (`RESTOCK` / scrap / rework) is TTW-041.
4. **Exactly-once effect keys.** Append-only `InventoryMovement` rows with unique `effectKey` of the form `inventory.{reserve|release|consume}:orderItem:{id}`. Each line follows exactly one terminal path after reserve: release **or** consume.
5. **`trackInventory = false`.** Skips counter mutations and movement writes for that variant.
6. **Historical drift.** Orders already `PAID` before this migration may still hold `reserved` without a `CONSUME` movement. Do not auto-mutate production counters in this ticket; TTW-015 reconciliation/repair owns backfill with evidence.

## Consequences

- Availability (`stockOnHand - reserved`) and low-stock notifications share the same counters after consume.
- Payment settle vs expiry races: only the winner of the order status `updateMany` applies inventory effects; the loser does not consume or double-release.
