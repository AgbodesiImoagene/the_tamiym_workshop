# TTW-048 — Productionize notification providers and failover

**Epic:** 4 — Fulfilment, support and business policy\
**Status:** Deferred — post-v1 provider hardening\
**Risk:** High\
**Blocked by:** TTW-003, TTW-043, TTW-051, TTW-054\
**Blocks:** TTW-049

## Background

TTW-043 adds notification policy, attempts and dead-letter recovery, but provider selection/migration remains deferred. Current delivery calls concrete mail/SMS services and stores limited provider evidence. Production readiness requires selected providers, authenticated callbacks, suppression/bounce handling, rate/cost controls, health-based routing and a tested outage mode.

## Proposal

Select production email and, if launch policy requires it, SMS providers through an owner/security/privacy review. Introduce channel-provider adapters returning normalized receipt ids and error classes. Route each logical effect deterministically through a configured primary provider and a policy-controlled fallback; never fail over on ambiguous acceptance without status lookup or a stable provider idempotency key.

Ingest signed delivery/bounce/complaint/suppression callbacks into append-only attempts and recipient suppression state. Separate provider outage failover from permanent recipient suppression, and require deliberate recovery for complaints or hard bounces. Keep transactional and marketing streams isolated by credentials/domain/pools where supported.

## Invariants

- Provider retry/failover cannot produce more than one successful delivery for a logical effect.
- A hard bounce, complaint or legal suppression blocks prohibited future delivery before provider dispatch.
- Required transactional delivery failure remains visible/actionable; it is never silently reclassified as marketing suppression.
- Provider callbacks are authenticated, deduplicated and cannot overwrite prior attempt evidence.
- Secrets, message bodies and recipient PII never appear in logs, metrics or unrestricted admin responses.
- Provider configuration changes are validated, audited and reversible without dropping queued work.

## Implementation plan

1. Approve providers, regions/DPA, sender domains/numbers, channel scope, quotas/costs, warm-up, fallback and data retention; document portability decision.
2. Define email/SMS adapter interfaces and normalized accepted/delivered/deferred/bounced/complained/suppressed/error results; implement configured adapters and simulators.
3. Extend TTW-043 attempts with provider/receipt/routing generation and add suppression/callback receipt models with uniqueness and retention.
4. Implement deterministic routing, credential/domain isolation, bounded rate/concurrency, circuit breakers and ambiguity-safe retry/failover.
5. Add signed callback endpoints with raw-body verification, replay protection, bounded payloads and safe mapping to delivery/suppression evidence.
6. Add admin provider health, queue/routing, suppression and cost visibility; restrict unsuppression and configuration changes with reason/audit.
7. Add synthetic probes, SLO dashboards/alerts and runbooks for outage, degraded provider, credential rotation, domain reputation, quota and rollback.
8. Update environment validation, IaC secrets, Swagger/contracts, privacy inventory and launch checklist.

## Test and observability plan

- Unit/component: error mapping, routing/fallback decision, suppression policy, callback verification and admin redaction.
- Integration/e2e: provider simulators, accepted/delivered/bounce/complaint callbacks, configuration switch, secret rotation and queued-work continuity.
- Failure, retry, and concurrency: ambiguous timeout, primary outage, two workers, duplicate callbacks, fallback race, quota/429 and stale circuit state.
- Playwright: admin observes provider degradation and a dead letter/fallback outcome; suppressed recipient cannot be sent prohibited mail.
- Logs, metrics, traces, and alerts: provider/channel acceptance/delivery latency, error class, bounce/complaint/suppression, routing/failover, quota/cost and queue SLO without PII.

## References

- `apps/api/src/mail/notification-outbox-delivery.service.ts:28-113` — outbox delivery claims/retries rows but has no normalized provider routing or callback evidence.
- `apps/api/src/mail/notification-outbox-delivery.service.ts:116-178` — channel dispatch calls concrete services and treats send completion as success.
- `apps/api/prisma/schema.prisma:1787-1807` — outbox has no provider receipt, routing generation or suppression state.
- `docs/tickets/ttw-043-operationalize-notification-delivery.md` — provider selection and migration are deliberately deferred.

## Acceptance criteria

- [ ] Owner/security/privacy approve production providers, DPA/region, identities, quotas/costs, fallback and retention.
- [ ] Adapter/simulator coverage proves deterministic routing and ambiguity-safe retry/failover without duplicate successful effects.
- [ ] Signed, deduplicated callbacks maintain immutable delivery and suppression evidence.
- [ ] Bounce/complaint/legal suppression is enforced before dispatch with restricted, audited recovery.
- [ ] Provider health/SLO/cost dashboards, alerts, synthetic probes and tested outage/rotation/rollback runbooks exist.
- [ ] Environment/IaC validation prevents production startup with incomplete or unsafe provider configuration.
- [ ] High-risk design, security/privacy and independent implementation reviews pass.

## Out of scope

- Event taxonomy, preferences and dead-letter operations → TTW-043.
- Marketing audiences/content → TTW-049.
- Adding channels beyond approved email/SMS/operational Slack → future channel ticket.

## Design review

Pending. Include vendor/DPA decision, routing state machine, ambiguity/idempotency analysis, callback threat model, suppression law/policy, secrets, SLO/cost and rollback.

## Implementation reviews

Pending. Require independent implementation and security/privacy reviews.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
