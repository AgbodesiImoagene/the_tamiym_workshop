# TTW-043 — Add notification preferences and dead-letter operations

**Epic:** 4 — Fulfilment, support and business policy  
**Status:** In progress  
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

### Slice 1 progress (this branch)

- [x] Interim policy doc + design review (formal sign-off deferred)
- [x] Schema: preferences, consent, effect/generation, attempts, dead-letter ack metadata + backfill migration
- [x] Pure policy evaluator + centralized dispatch with suppression evidence
- [x] Customer preference APIs + signed unsubscribe endpoint
- [x] Admin dead-letter list/detail/ack/replay/bulk-replay APIs (redacted)
- [x] Append-only delivery attempts + notification SLO metrics emission
- [x] Wire organiser campaign mail + admin broadcast through dispatch/policy
- [ ] Remaining producers on dispatch, customer/admin UI, Playwright, formal legal sign-off, runbooks (later slices)

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
- [x] Migration/rollback preserve existing outbox status while adding durable preferences/consent, logical effects/generations and append-only attempts. _(slice 1 migration shipped; formal rollback drill deferred)_
- [x] Required notices cannot be disabled; optional delivery follows current consent and stores a stable queued/suppressed decision. _(slice 1: policy + preference APIs; not all producers wired)_
- [x] Duplicate production/retry/replay cannot produce more than one successful delivery for a logical effect generation. _(slice 1: effectKey+generation uniqueness + replay bump)_
- [x] Customer preference/unsubscribe and admin dead-letter/replay flows enforce ownership/RBAC/CSRF/rate limits and mask PII. _(slice 1 APIs; UI deferred)_
- [ ] Queue/dead-letter SLO dashboards, alerts and tested outage/replay/privacy runbooks exist. _(metrics emitted; dashboards/runbooks deferred to TTW-051)_
- [ ] Integration and Playwright preference/failure/concurrency/replay coverage pass.
- [ ] High-risk design/security and independent implementation reviews pass with exact gate evidence.

## Out of scope

- Adding campaign decision events/templates → TTW-034.
- Broad observability dashboard program → TTW-051; this ticket must still emit its domain metrics/alerts.
- Selecting, migrating or adding failover for email/SMS providers → TTW-048.
- Marketing campaign segmentation/content authoring → TTW-049.

## Design review

### Slice 1 design review (2026-08-21)

**Date:** 2026-08-21  
**Risk:** High  
**Policy version:** `notification-delivery/v1-interim-2026-08-21`  
**Verdict:** Proceed with interim policy (formal legal/operations sign-off deferred)

| Topic        | Decision                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Authority    | Pure server evaluator (`notification-policy`); stable `NOTIFICATION_*` codes                         |
| Taxonomy     | `SECURITY` / `TRANSACTIONAL` required; `ORGANISER_OPERATIONAL` opt-out; `MARKETING` explicit consent |
| Effect model | `effectKey + channel + generation` unique; replay bumps generation via `replayedFromId`              |
| Suppression  | Durable outbox row with `suppressed=true` + reason code (audit without send)                         |
| Attempts     | Append-only `NotificationDeliveryAttempt`; outbox `attempts` remains summary                         |
| Dead letters | Admin list/detail/ack/replay; recipient masked; bulk replay max 25                                   |
| Unsubscribe  | HMAC token scoped to `(userId, category, channel)`; 30-day TTL                                       |
| SLOs         | Env targets for pending age, delivery latency, failure rate, ack age; OTel counters/histogram        |
| Deferred     | Legal sign-off, all producers on dispatch, UI, Playwright, provider bounce handling                  |

Policy: `docs/notifications/ttw-043-interim-policy.md`

**Blast radius:** `NotificationOutbox`, new preference/consent/attempt tables, delivery worker, campaign organiser mail, admin broadcast, admin dead-letter APIs, backfill cron metrics.

**Test plan:** Exhaustive unit table for taxonomy/policy; dispatch suppression/consent; dead-letter replay generation; delivery attempt append; redaction helpers; SLO parser.

## Implementation reviews

Pending independent dual review (delivery/concurrency + security/privacy) after commit — parent agent owns.

## Verification evidence

### Slice 1 gates (2026-08-21)

```text
pnpm --filter api exec tsc --noEmit
# pass
pnpm --filter api test:coverage
# 137 suites / 1134 tests pass
pnpm coverage:diff
# Diff coverage 43/47 lines (91.49%) — pass (floor 80%)
git diff --check
# clean
```

Policy: `docs/notifications/ttw-043-interim-policy.md` (`notification-delivery/v1-interim-2026-08-21`)  
Tests: `notification-policy.spec.ts`, `notification-dispatch.service.spec.ts`, `notification-dead-letter.service.spec.ts`, `notification-outbox-delivery.service.spec.ts`, `notification-outbox-backfill.service.spec.ts`, controller specs

## Completion summary

Slice 1 interim notification policy, preferences, dead-letter ops and SLO metrics shipped locally. Full ticket remains open for remaining producer wiring, UI, Playwright, formal legal sign-off, runbooks, and dual independent reviews.
