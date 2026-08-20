# ADR: Money and inventory reconciliation (TTW-015)

**Status:** Accepted (agent + backlog owner default for autonomous delivery)  
**Date:** 2026-08-20  
**Ticket:** TTW-015

## Reconciliation matrix

| Domain                           | Left                               | Right                                                   | Tolerance                    | Severity outside grace                 |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------- | ---------------------------- | -------------------------------------- |
| Payment                          | SUCCEEDED payment                  | settlement claim + order paid-like status               | exact                        | CRITICAL                               |
| Payment↔Paystack                 | local SUCCEEDED in window          | Paystack transaction by reference                       | amount/currency/status exact | CRITICAL / PENDING_GRACE (24h)         |
| Refund                           | SUCCEEDED refund                   | settlement claim; campaign ⇒ exactly one REFUND_APPLIED | exact                        | CRITICAL                               |
| Refund↔Paystack                  | local SUCCEEDED in window          | Paystack refund by id                                   | amount/currency/status exact | CRITICAL / PENDING_GRACE               |
| Payout SUCCEEDED                 | ledger net                         | `-amount`                                               | 0.0001                       | CRITICAL                               |
| Payout FAILED/REVERSED/CANCELLED | ledger net                         | `0`                                                     | 0.0001                       | CRITICAL                               |
| Payout in-flight                 | ledger net                         | `-amount` reserve for INITIATED/PROCESSING              | 0.0001                       | HIGH (no grace; QUEUED is pre-reserve) |
| Payout↔Paystack                  | local SUCCEEDED in window          | Paystack transfer by reference                          | amount/currency/status exact | CRITICAL / PENDING_GRACE               |
| Campaign                         | `currentAmount`                    | sum(PAYMENT_SETTLED+REFUND_APPLIED)                     | 0.01                         | CRITICAL                               |
| Inventory                        | `reserved`                         | sum(movement.reservedDelta) when RESERVE history exists | exact                        | CRITICAL                               |
| Inventory                        | available (`stockOnHand-reserved`) | ≥ 0                                                     | exact                        | CRITICAL                               |

**Cutoff:** internal uses run `cutoffAt`; provider compares the same 7-day `[cutoffAt-7d, cutoffAt]` window used for Paystack list APIs (bidirectional).  
**Access:** ADMIN role only; responses mask evidence to entity ids.  
**SLO:** P0 = open CRITICAL unacknowledged > 4h; missed schedule = expected window missing COMPLETED after 02:00 / 04:00 Lagos.  
**Retention:** 400 days.

## Decisions

1. Zero tolerance outside the 24h provider grace window.
2. Schedules Africa/Lagos: internal `15 1 * * *`, provider `30 3 * * *`.
3. Repair: two distinct admins; mutating campaign repair verifies before RESOLVED; document\_\* → WONT_FIX.
4. Session-pinned advisory locks via `withSessionAdvisoryLock`.
5. Incomplete/malformed Paystack pages ⇒ run `INCOMPLETE` (never COMPLETED).
6. Absolute `stockOnHand` vs opening balance is out of scope without an opening-balance movement kind; reserved + available checks cover TTW-014 counters.

## Rollback

See migration header (drop additive tables/types only).
