# Runbook — Webhooks & money

| Field     | Value                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner     | payments                                                                                                                                         |
| Severity  | critical                                                                                                                                         |
| Alerts    | `TamiymWebhookFailureSpike`, `TamiymWebhookDeniedSpike`, `TamiymChargeSettlementRejected`, `TamiymRefundSettlementFailed`, `TamiymPayoutFailure` |
| Dashboard | Grafana `Money & Webhooks` (`ttw-051-money-webhooks`)                                                                                            |

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

## Verification

- Settlement counters show expected `settled` / `duplicate` outcomes; `rejected` and `failed` at zero rate.
- Webhook failure/denied recording rules below alert thresholds for 15 minutes.
- Spot-check ledger rows vs provider dashboard for sample references.
- All money-family alerts resolved in Prometheus.
