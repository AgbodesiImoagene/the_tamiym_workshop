# TTW-043 — Add notification preferences and dead-letter operations

**Epic:** 4 — Fulfilment, support and business policy  
**Status:** Not started  
**Risk:** High  
**Blocked by:** TTW-003, TTW-004  
**Blocks:** TTW-051, TTW-053, TTW-054

## Background

The outbox retries pending notifications and permanently marks a row `FAILED` after a configurable attempt count. Admin tooling configures operational routes and sends broadcasts, but cannot inspect/replay failed delivery, see per-attempt evidence or measure delivery SLO. Users have no notification preferences or unsubscribe/consent record. As event coverage expands, the business cannot distinguish required transactional notices from optional communications or safely recover a dead letter.

## Proposal

Create a versioned notification taxonomy separating `SECURITY`, `TRANSACTIONAL`, `ORGANISER_OPERATIONAL` and `MARKETING` categories. Required security/transactional notices cannot be disabled; optional categories/channels use explicit, auditable user consent. Evaluate preference before creating an outbox row and record the decision/policy version on suppressed or queued events.

Add append-only `NotificationDeliveryAttempt` evidence and admin dead-letter APIs/UI to filter, inspect, replay and annotate failures. Replay creates a new delivery generation/effect key linked to the original; it never edits a `SENT` row or discards prior attempts. Add queue-lag/delivery/failure SLOs, bounded bulk operations and runbooks.

## Owner policy decisions

- Approve every event's category, required/optional status, supported channels, default and customer-facing copy; legal/privacy must approve marketing consent/unsubscribe.
- Approve recommended explicit opt-in for marketing and always-on security/transactional messages, subject to legal requirements.
- Define channel fallback/escalation, quiet hours, frequency caps and whether organiser operational alerts are mandatory while a campaign is active.
- Define delivery SLOs by category/channel, retry/backoff/max-attempt policy, dead-letter acknowledgement and replay authority.
- Define consent, payload, attempt and failure retention; approve PII access/masking and deletion behaviour.
- Define provider suppression/bounce/complaint handling before any marketing launch.

## Invariants

- Security and legally required transactional events cannot be disabled through an optional preference or unsubscribe token.
- Marketing/optional delivery requires valid consent for that category/channel and records when/source/policy version.
- One logical event-recipient-channel effect produces at most one successful delivery; retry/replay preserves history and cannot resend an already-sent effect accidentally.
- A permanently failed row remains immutable evidence; replay is a linked generation with actor, reason and idempotency key.
- Preference checks, outbox creation/suppression record and originating business mutation are atomic where notification guarantee is required.
- Admin APIs, logs and metrics mask recipient/payload secrets; unsubscribe tokens are signed, scoped, expiring and not stored in plaintext.

## Implementation plan

1. Record owner/legal/operations approval for the event taxonomy, defaults/consent, channel policy, SLO, retries, retention and replay roles. Map every existing outbox event and admin route.
2. Add notification preference/consent, logical effect/generation and append-only attempt models with database uniqueness. Migrate existing outbox rows to a documented taxonomy without changing delivery state.
3. Implement a centralized notification policy service that classifies events, evaluates required/optional preference, stores consent evidence and returns stable queued/suppressed reasons. Remove feature-specific ad hoc preference decisions.
4. Add authenticated preference read/update APIs and safe signed unsubscribe flow for optional categories. Protect against user enumeration, CSRF and cross-user token reuse; do not expose disabling controls for required notices.
5. Capture every delivery attempt with provider-safe response code/id, timing and redacted error classification. Keep outbox summary status/attempt count consistent transactionally.
6. Add admin dead-letter list/detail/attempt history, acknowledge and single/bounded-batch replay APIs. Enforce reason, RBAC, idempotency, rate limits and immutable links to original effects.
7. Add admin UI for queue health, failure filters, redacted evidence, safe replay confirmation and preference/taxonomy visibility. Add customer preference UI with accessible explanations.
8. Implement metrics/alerts for oldest pending age, delivery latency, failure/suppression rate, stale processing, dead-letter age/count, replay outcome and provider bounce/complaint where available.
9. Add runbooks for backlog, provider outage, bad template, invalid recipient, replay, suppression/bounce and privacy requests. Update Swagger, shared contracts and notification documentation.

## Test and observability plan

- Unit/component: event classification, mandatory/optional policy, consent history, unsubscribe signature/scope/expiry, effect key/generation and redaction; customer/admin UI states.
- Integration/e2e: originating transaction plus outbox decision, one-success uniqueness, retry attempts, terminal failure, replay RBAC/idempotency/rate limit, preference ownership and migration taxonomy.
- Failure, retry, and concurrency: duplicate producer events, two workers, stale claim reset, provider 429/4xx/5xx/timeout, two admin replays, preference change racing production and template correction after failure.
- Playwright: customer changes optional preference/unsubscribes while required notice remains enabled; admin finds a failed delivery, sees redacted attempts, replays once and observes success.
- Logs, metrics, traces, and alerts: category/channel result and latency, queue/dead-letter age, suppression reason, replay result and SLO burn; hash or mask recipient and exclude payload/secrets.

## References

- `apps/api/prisma/schema.prisma:205-218` — channel/status enums have no category, suppression or replay state.
- `apps/api/prisma/schema.prisma:1786-1807` — outbox stores aggregate attempts/last error but no logical effect, consent decision or attempt history.
- `apps/api/src/mail/notification-outbox-delivery.service.ts:28-113` — delivery claim/retry permanently marks `FAILED` with no recovery operation.
- `apps/api/src/mail/notification-outbox-backfill.service.ts:12-93` — maintenance resets stale work and requeues pending rows only.
- `apps/api/src/admin/admin-notifications.controller.ts:33-54` — admin notification API provides broadcast only.
- `apps/api/src/admin-notifications/admin-notification-routes.controller.ts:34-88` — admin tooling manages operational routes but not delivery attempts/dead letters.
- `docs/07-notifications.md:1-30` — event/channel requirements do not define user consent, SLO or dead-letter policy.

## Acceptance criteria

- [ ] Owner/legal/operations approve a complete event taxonomy, consent/defaults, channels, SLO/retry, replay roles and retention policy.
- [ ] Migration/rollback preserve existing outbox status while adding durable preferences/consent, logical effects/generations and append-only attempts.
- [ ] Required notices cannot be disabled; optional delivery follows current consent and stores a stable queued/suppressed decision.
- [ ] Duplicate production/retry/replay cannot produce more than one successful delivery for a logical effect generation.
- [ ] Customer preference/unsubscribe and admin dead-letter/replay flows enforce ownership/RBAC/CSRF/rate limits and mask PII.
- [ ] Queue/dead-letter SLO dashboards, alerts and tested outage/replay/privacy runbooks exist.
- [ ] Integration and Playwright preference/failure/concurrency/replay coverage pass.
- [ ] High-risk design/security and independent implementation reviews pass with exact gate evidence.

## Out of scope

- Adding campaign decision events/templates → TTW-034.
- Broad observability dashboard program → TTW-051; this ticket must still emit its domain metrics/alerts.
- Selecting or migrating email/SMS providers → follow-up ticket.
- Marketing campaign segmentation/content authoring → follow-up after consent policy is approved.

## Design review

Pending. Include taxonomy/consent sign-off, queue/effect/replay state model, authorization/threat model, PII/retention, database constraints, concurrent producer/worker/replay cases, migration and SLO tests.

## Implementation reviews

Pending. Require independent implementation and security/privacy reviews.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
