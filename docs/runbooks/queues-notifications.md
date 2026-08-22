# Runbook — Queues & notifications

| Field     | Value                                                             |
| --------- | ----------------------------------------------------------------- |
| Owner     | platform-ops                                                      |
| Severity  | warning                                                           |
| Alerts    | `TamiymQueueJobFailures`, `TamiymNotificationQueueStale`          |
| Dashboard | Grafana `Queues & Notifications` (`ttw-051-queues-notifications`) |

## User / business impact

Queue failures delay email, media processing, payout workers, and notification delivery. Stale notification outbox rows mean customers and organisers miss transactional messages.

## Triage — Prometheus

```promql
sum by (queue) (tamiym:queue_job_failure_rate:5m)
histogram_quantile(0.99, sum(rate(tamiym_notification_queue_oldest_pending_age_seconds_bucket[15m])) by (le))
sum by (channel, outcome) (rate(tamiym_notification_delivery_attempt_total[5m]))
sum by (outcome) (rate(tamiym_notification_dead_letter_replay_total[5m]))
```

## Triage — logs & Redis

- BullMQ failed job logs per queue name.
- Redis memory / connection errors.
- Mail provider transient errors in notification delivery logs.

## Containment

1. Identify failing queue(s) — do not bulk-retry all queues blindly.
2. Scale workers or restart stuck worker process if Redis connectivity is healthy.
3. Pause dead-letter replays if duplicates are suspected.

## Recovery

1. Fix job handler bug or external dependency.
2. Retry failed jobs through queue UI or approved replay tooling.
3. Drain notification outbox after worker recovery.

## Verification

- Queue failure rates below 0.05/s per queue for 15 minutes.
- Notification oldest-pending age p99 below 600s.
- Sample delivery attempts show `success` for critical categories.
- Alerts resolved in Prometheus.
