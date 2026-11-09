# Runbook — Webhooks & money

| Field     | Value                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner     | payments                                                                                                                                                                      |
| Severity  | critical                                                                                                                                                                      |
| Alerts    | `TamiymWebhookFailureSpike`, `TamiymWebhookDeniedSpike`, `TamiymChargeSettlementRejected`, `TamiymExtraPaymentCapture`, `TamiymRefundSettlementFailed`, `TamiymPayoutFailure` |
| Dashboard | Grafana `Money & Webhooks` (`ttw-051-money-webhooks`)                                                                                                                         |

## User / business impact

Webhook failures delay charge settlement and refund reconciliation. Rejected settlements or failed payouts can block organiser payouts and customer refunds. Denied webhooks may indicate signature misconfiguration or abuse.

## Triage — Prometheus

```promql
tamiym:webhook_failure_rate:5m
tamiym:webhook_denied_rate:5m
sum by (outcome) (rate(tamiym_charge_settlement_total[5m]))
sum by (outcome) (rate(tamiym_refund_settlement_total[5m]))
sum by (outcome) (rate(tamiym_payouts_total[5m]))
sum by (outcome) (rate(tamiym_payout_runs_total[5m]))
sum by (outcome) (rate(tamiym_payout_transfer_event_total[5m]))
```

## Triage — logs & traces

- Paystack webhook handler spans (`recordWebhook` outcomes).
- Audit entries for settlement, refund, payout state transitions.
- Provider response codes in structured logs (no raw secrets).

## Containment

1. **Do not** manually duplicate Paystack transfers or refunds.
2. If signature validation fails broadly, verify Paystack webhook secret env (production change control).
3. Pause `AUTO_EXECUTE` payout runs if payout failures are active (site setting + env gate).
4. Quarantine replay of suspicious denied webhook bursts at edge/WAF if abuse is confirmed.

## Recovery

1. Fix root cause (payload mapping, idempotency key, provider outage).
2. Run approved reconciliation jobs / admin repair flows (TTW-015 scope).
3. Re-execute payout runs only through `PayoutRunsService` idempotent paths.

## Extra or late payment captures (`TamiymExtraPaymentCapture`)

A customer paid for an order that cannot use the money: a second payment on an order that is already paid (`extra_capture`, TTW-189) or a payment after cancellation (`late_captured`, TTW-088).

1. Find the order and reference in the error log (`charge.success captured again…` / `charge.success received for CANCELLED order…`) or in the open reconciliation findings (payment domain, entity key `payment:<id>:extra_capture`).
2. Refund the customer. A late payment on a cancelled order with one captured payment can be refunded with reason `LATE_PAYMENT_AFTER_CANCELLATION`; an extra capture is refunded from the Paystack dashboard until TTW-191 exists.
3. The admin notification is sent after the database commit and can be lost if the notification step fails; this alert and the reconciliation finding are the safety net.
4. Acknowledge the reconciliation finding once the refund is done.

## Verification

- Settlement counters show expected `settled` / `duplicate` outcomes; `rejected` and `failed` at zero rate.
- Webhook failure/denied recording rules below alert thresholds for 15 minutes.
- Spot-check ledger rows vs provider dashboard for sample references.
- All money-family alerts resolved in Prometheus.
