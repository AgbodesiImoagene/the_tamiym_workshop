# Runbook — Auth abuse

| Field     | Value                                                     |
| --------- | --------------------------------------------------------- |
| Owner     | security-platform                                         |
| Severity  | warning                                                   |
| Alerts    | `TamiymAuthThrottleLimited`, `TamiymAuthLoginDeniedSpike` |
| Dashboard | Grafana `Media & Auth` (`ttw-051-media-auth`)             |

## User / business impact

Credential stuffing or brute-force attempts increase auth denials and throttle limits. Legitimate users may be rate-limited during shared-IP scenarios.

## Triage — Prometheus

```promql
sum by (surface, bucket, outcome) (rate(tamiym_auth_throttle_total[5m]))
sum by (outcome) (rate(tamiym_auth_login_total[5m]))
```

## Triage — logs & audit

- Denied login audit rows (no password fields).
- Shared IP / user-agent patterns in request logs.
- Correlation with `auth_throttle_total` bucket labels (bounded buckets only).

## Containment

1. Confirm attack vs misconfigured client (retry loop).
2. Escalate to edge/WAF IP blocking for sustained abuse.
3. Do not permanently raise throttle limits without security review.

## Recovery

1. Block abusive sources at edge.
2. Notify affected legitimate users if widespread false positives.
3. Monitor throttle `limited` rate returning to baseline.

## Verification

- `auth_throttle_total{outcome="limited"}` below 5/s for 15 minutes.
- `auth_login_total{outcome="denied"}` below 2/s for 15 minutes.
- Alerts resolved in Prometheus.
