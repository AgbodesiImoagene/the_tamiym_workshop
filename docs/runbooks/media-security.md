# Runbook — Media security

| Field     | Value                                         |
| --------- | --------------------------------------------- |
| Owner     | security-platform                             |
| Severity  | critical                                      |
| Alerts    | `TamiymMediaVirusScanFailure`                 |
| Dashboard | Grafana `Media & Auth` (`ttw-051-media-auth`) |

## User / business impact

Infected or failed scans risk malware in user-uploaded assets. Failed scans may block legitimate uploads or leave assets in an unknown state.

## Triage — Prometheus

```promql
sum by (outcome) (rate(tamiym_media_virus_scan_total[5m]))
sum by (reason) (rate(tamiym_media_fetch_denied_total[5m]))
```

## Triage — logs

- Media processor job outcomes.
- Scanner availability vs infected detections (outcome `unavailable` vs `infected`).

## Containment

1. Quarantine assets with `infected` outcome — do not serve from CDN/public URLs.
2. If scanner is `unavailable`, block new remote fetches if policy requires live scanning.
3. Do not disable virus scanning in production.

## Recovery

1. Restore scanner service or switch to approved fallback per env policy.
2. Re-queue scan jobs for `failed` / `unavailable` assets.
3. Admin review infected assets per moderation policy (TTW-027).

## Verification

- `infected` and `failed` scan rates at zero for 15 minutes.
- Clean uploads complete end-to-end in staging.
- Alert `TamiymMediaVirusScanFailure` resolved.
