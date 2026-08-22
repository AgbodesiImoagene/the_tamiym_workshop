# TTW-043 — Notification delivery, preferences & dead letters (interim v1)

**Policy version:** `notification-delivery/v1-interim-2026-08-21`\
**Status:** Engineering interim — approved for slice 1 implementation; formal legal/operations sign-off still required before production marketing claims.

This matrix is the working source of truth for event taxonomy, preference/consent evaluation, dead-letter operations and delivery SLO targets. Server evaluation is authoritative; clients must not invent consent or replay authority.

## Authority

| Rule             | Value                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Evaluator        | Pure server module (`notification-policy`) with stable decision codes                        |
| Policy stamp     | Every outbox row stores `policyVersion`, `category`, and queued/suppressed decision metadata |
| Effect key       | `effectKey + channel + generation` is unique; replay bumps `generation`, never edits `SENT`  |
| Required notices | `SECURITY` and `TRANSACTIONAL` categories cannot be disabled via preference or unsubscribe   |
| Marketing        | `MARKETING` requires explicit `NotificationConsent.granted=true` for the channel             |
| Organiser ops    | `ORGANISER_OPERATIONAL` is optional; default enabled until user opts out via preference      |
| Attempt history  | Append-only `NotificationDeliveryAttempt` rows; outbox `attempts` remains summary counter    |
| Replay           | Admin-only, reason required, idempotent per target generation, max 25 per bulk request       |

## Event taxonomy (slice 1)

| Event / family                                                                                            | Category                | Required | Channels (v1)   | Notes                                 |
| --------------------------------------------------------------------------------------------------------- | ----------------------- | -------- | --------------- | ------------------------------------- |
| `OrderPlaced`, `PaymentConfirmed`, order lifecycle, refunds, design moderation, organiser payout outcomes | `TRANSACTIONAL`         | Yes      | EMAIL           | Customer/organiser transactional mail |
| `organiser.application.*`, `organiser.campaign.*`                                                         | `ORGANISER_OPERATIONAL` | No       | EMAIL           | Organiser may opt out (slice 1)       |
| `AdminBroadcast`                                                                                          | `MARKETING`             | No       | EMAIL           | Requires marketing consent            |
| `admin.operational` (+ admin route fan-out)                                                               | `ORGANISER_OPERATIONAL` | Yes      | EMAIL/SMS/SLACK | Ops/on-call; no user preference gate  |
| Unmapped `eventName`                                                                                      | —                       | —        | —               | Suppress with `TAXONOMY_UNMAPPED`     |

Security-specific events (password reset, MFA) are not yet on the outbox; when added they map to `SECURITY` and are always required.

## Preference & consent

| Category                | Preference applies | Consent required      | Default                |
| ----------------------- | ------------------ | --------------------- | ---------------------- |
| `SECURITY`              | No                 | No                    | Always deliver         |
| `TRANSACTIONAL`         | No                 | No                    | Always deliver         |
| `ORGANISER_OPERATIONAL` | Yes (EMAIL/SMS)    | No                    | Enabled                |
| `MARKETING`             | Yes                | Yes (explicit opt-in) | Disabled until consent |

Preference updates are auditable via `NotificationConsent` append rows. Unsubscribe links are HMAC-signed, scoped to `(userId, category, channel)`, and expire after 30 days.

## Dead-letter operations (slice 1)

| Operation                 | RBAC    | Constraints                                                           |
| ------------------------- | ------- | --------------------------------------------------------------------- |
| List/filter `FAILED` rows | `ADMIN` | Recipient masked; payload omitted from list                           |
| Detail + attempt history  | `ADMIN` | Redacted recipient; safe error classification only                    |
| Acknowledge               | `ADMIN` | Sets `deadLetterAckStatus=ACKNOWLEDGED` + note                        |
| Replay single             | `ADMIN` | Reason required; creates new `generation` linked via `replayedFromId` |
| Replay bulk               | `ADMIN` | Max 25 ids; same reason applied                                       |

Replay never mutates the original `FAILED` row or a prior `SENT` generation for the same effect.

## Delivery SLO targets (interim)

| Signal                          | Env default                                     | Alert intent                  |
| ------------------------------- | ----------------------------------------------- | ----------------------------- |
| Oldest pending age              | `NOTIFICATION_SLO_PENDING_MAX_AGE_MINUTES=30`   | Queue backlog / worker outage |
| Delivery latency (create→sent)  | `NOTIFICATION_SLO_DELIVERY_MAX_MINUTES=15`      | Provider/template regression  |
| Failure rate                    | `NOTIFICATION_SLO_FAILURE_RATE_PERCENT=5`       | Dead-letter burn              |
| Dead-letter acknowledgement age | `NOTIFICATION_SLO_DEAD_LETTER_ACK_MAX_HOURS=24` | Ops hygiene                   |

Metrics emitted: `notification_dispatch_total`, `notification_delivery_attempt_total`, `notification_dead_letter_replay_total`, `notification_queue_oldest_pending_age_seconds`.

## Customer / admin safe messaging

| Audience                | Content                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| Customer preference API | Category labels + whether required; no internal codes for required blocks    |
| Admin dead-letter API   | Masked recipient (`a***@example.com`, `+234***1234`); no raw webhook secrets |
| Logs/metrics            | Event, category, channel, outcome codes — never full recipient or payload    |

## Rollback

- Forward: add preference/consent/attempt tables + outbox metadata columns; backfill `effectKey` without changing `status`.
- Rollback: stop writers using new columns; drop tables/indexes after deploy rollback (coordinate with notification freeze).

## Deferred

- Legal sign-off on marketing copy/consent UX and organiser mandatory alerts while campaign active
- Customer/admin UI surfaces (slice 2+)
- Signed unsubscribe landing page in `apps/app`
- Provider bounce/complaint suppression (TTW-048)
- Playwright preference/replay journeys
- Quiet hours, frequency caps, channel fallback
