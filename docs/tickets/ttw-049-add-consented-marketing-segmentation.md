# TTW-049 — Add consented marketing segmentation and campaigns

**Epic:** 4 — Fulfilment, support and business policy\
**Status:** Deferred — post-v1 growth capability\
**Risk:** High\
**Blocked by:** TTW-023, TTW-043, TTW-048\
**Blocks:** None

## Background

The admin broadcast service can target broad role-based audiences of active verified users, but it does not require marketing consent, provide reusable segment definitions, enforce frequency caps or manage campaign approval/scheduling. TTW-043 establishes consent and unsubscribe policy but deliberately excludes marketing segmentation and content authoring.

## Proposal

Build marketing sends as versioned `MarketingCampaign` records with approved content, channel, purpose/legal basis, audience definition, exclusion rules, schedule and immutable recipient snapshot. Segment evaluation must start from valid TTW-043 consent and always exclude suppression, deletion, channel ineligibility and frequency-cap violations. Preview counts/samples are estimates; send time re-evaluates mandatory exclusions and records the final decision per recipient.

Require review/approval before scheduling, bound batch size/rate/cost, and support pause/cancel without editing already-produced evidence. Start with a small allowlisted segment vocabulary rather than arbitrary admin SQL or user-provided expressions.

## Invariants

- No marketing effect is queued without valid consent/legal basis for that user, purpose, channel and policy version at send time.
- Unsubscribe, complaint, suppression or deletion wins over a stale audience snapshot before dispatch.
- A campaign-recipient-channel combination is produced at most once per approved campaign generation.
- Segment definitions cannot expose one user's attributes to another or permit arbitrary query execution.
- Approval, content, audience, exclusions and send generation are immutable once sending begins.
- Logs/analytics avoid message content and direct identifiers; exports are restricted, watermarked/audited and formula-safe.

## Implementation plan

1. Obtain legal/product/growth approval for purposes, consent/legal basis, eligible attributes, sensitive-data exclusions, frequency caps, approval roles, retention and metrics.
2. Add versioned campaign/content/segment, approval, recipient-decision and send-generation models with stable effect uniqueness.
3. Implement an allowlisted segment evaluator with deterministic predicates, audience estimates and mandatory consent/suppression/frequency exclusions.
4. Add admin draft/preview/test-send/review/approve/schedule/pause/cancel APIs with RBAC, self-approval rules, bounded queries and audit.
5. Queue final recipients in bounded resumable batches through TTW-043/048, rechecking mandatory exclusions immediately before production.
6. Add accessible admin UI for content, segment explanation, estimated/final counts, exclusions, approval and delivery outcomes; prevent deceptive unsubscribe handling.
7. Add aggregate campaign analytics with privacy thresholds, export controls and no cross-purpose profile enrichment.
8. Update privacy notice, consent records, Swagger/contracts and campaign pause, complaint spike, wrong-audience and deletion runbooks.

## Test and observability plan

- Unit/component: segment predicates, consent/purpose scope, exclusions, caps, approval transitions and accessible admin forms.
- Integration/e2e: consent change between preview/send, suppression/deletion, batch resume, unique effects, RBAC/self-approval and audited export.
- Failure, retry, and concurrency: two schedulers, pause during batch, duplicate job, provider degradation, complaint spike and policy version change.
- Playwright: consenting user is included; opted-out user is excluded; admin previews/approves/sends once and can pause remaining batches.
- Logs, metrics, traces, and alerts: eligible/excluded/queued/delivered by safe reason, send progress, complaint/unsubscribe spike, cap/rate/cost without recipient PII.

## References

- `apps/api/src/admin/admin-email-broadcast.service.ts:151-201` — current audience selection uses broad roles/status/verification only.
- `apps/api/prisma/schema.prisma:1787-1807` — current outbox has no campaign generation or per-recipient eligibility decision.
- `docs/tickets/ttw-043-operationalize-notification-delivery.md` — consent policy is prerequisite and marketing segmentation/content is deferred.

## Acceptance criteria

- [ ] Legal/product/growth approve purposes, consent basis, allowed attributes, caps, roles, retention and privacy-safe analytics.
- [ ] Every recipient has an immutable, explainable consent/segment/exclusion decision and stable campaign effect key.
- [ ] Send-time unsubscribe/suppression/deletion/cap checks prevent prohibited dispatch despite stale previews/snapshots.
- [ ] Admin draft/review/approval/schedule/pause/cancel and export flows enforce RBAC, audit and required separation.
- [ ] Batching is resumable and duplicate/concurrent jobs cannot resend a campaign generation.
- [ ] Integration and Playwright consent/race/failure coverage pass; complaint/unsubscribe alerts and response runbooks are tested.
- [ ] High-risk design, security/privacy and independent implementation reviews pass.

## Out of scope

- Consent/preferences, transactional taxonomy and dead letters → TTW-043.
- Provider routing, callbacks and suppression ingestion → TTW-048.
- Automated behavioural profiling, recommendations or third-party ad audiences → future privacy-reviewed epic.

## Design review

Pending. Include legal approval, data inventory, segment grammar/threat model, consent race, approval state machine, batching/idempotency, privacy analytics and incident rollback.

## Implementation reviews

Pending. Require independent implementation and security/privacy reviews.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
