# TTW-027 — Add moderation appeals and evidence retention

**Epic:** 2 — Security and trust boundaries\
**Status:** In progress\
**Risk:** High\
**Blocked by:** TTW-003, TTW-004, TTW-021, TTW-023, TTW-025\
**Blocks:** TTW-034, TTW-053, TTW-054

## Background

Designs, media and campaigns carry mutable moderation status/notes fields. AI screening can approve, flag or reject; admins directly replace current state, and campaigns store one customer-visible rejection reason. There is no immutable decision history, policy/model version, standardized reason taxonomy, appeal window, evidence model, appeal reviewer separation or owner status workflow. Internal AI/admin notes can therefore become the only evidence for a consequential decision, while users cannot challenge mistakes and operators cannot prove consistent policy application or retention/deletion.

## Proposal

Approve a versioned content and appeals policy, then introduce a shared moderation case/decision/appeal lifecycle for designs, media assets and campaign content. Preserve the current status fields only as transactional projections of an immutable transition record. Each automated or human decision records subject revision/hash, policy/model version, actor kind/id where permitted, stable reason codes, separately access-controlled internal evidence and approved customer-safe explanation.

Allow an authenticated owner to appeal an eligible latest decision once within the approved window, add a safe statement/evidence references, withdraw before review and follow status. Route appeals to an authorized reviewer who did not make the challenged human decision when required. Appeal resolution creates a new decision; it never edits history. Define content availability during review, resubmission-versus-appeal rules, deadlines/escalations, evidence retention/deletion and emergency safety/legal takedown behavior.

## Owner policy decisions

- Approve prohibited-content taxonomy, severity, automated decision authority, confidence thresholds, customer-safe reason/copy and policy/model versioning.
- Define which design/media/campaign decisions are appealable, appeal/resubmission limits and windows, content availability, evidence formats and abuse controls.
- Define reviewer roles, independence/escalation, SLA, exceptional reversal authority, emergency/legal hold and finality.
- Approve subject revision behavior: edit invalidation, re-screening, campaign/design dependency and whether an appeal follows or closes after new content.
- Approve internal/customer evidence separation, access, encryption, retention/deletion and treatment under TTW-025 privacy requests.

## Invariants

- Every current moderation status is derivable from one latest immutable decision for a specific subject revision and policy version.
- An appeal never mutates or deletes the challenged decision; resolution appends a new authorized transition with a stable reason.
- Only the subject owner can appeal, and an owner cannot use an appeal to alter the moderated content or access internal notes/evidence.
- At most one active appeal exists for an eligible decision; duplicate/retried submissions and resolutions have one effect.
- Disallowed content cannot become public/sellable merely because an appeal is pending or a moderation provider is unavailable.
- Customer-facing responses/notifications never expose internal model scores, reviewer notes, reporter identity or sensitive evidence.
- Evidence is retained, held, anonymised and deleted according to the approved versioned policy without breaking the decision audit chain.

## Implementation plan

1. Record product/legal/privacy/trust-and-safety approval for the content taxonomy, decision authority, appeals matrix, SLAs, roles, availability and evidence-retention policy. _(Slice 1: engineering interim policy approved — formal legal/T&S sign-off deferred.)_
2. Add subject-typed moderation case, immutable revision/decision/transition, reason, evidence-reference and appeal models with database transition/uniqueness constraints. Backfill current statuses as explicit legacy decisions and document rollback. _(Slice 1 done.)_
3. Refactor AI design/media/campaign screening and admin decisions through one transactional moderation workflow. Snapshot subject hash/revision and policy/model/config version; separate internal evidence from customer explanation. _(Slice 1 done.)_
4. Add owner-scoped eligibility, create, withdraw, list/detail APIs and rate limits. Accept only TTW-021-safe evidence references, immutable after submission, with content/size/count limits. _(Slice 1: statement-only; evidence uploads deferred.)_
5. Add least-privilege admin appeal queue/detail/resolve/escalate APIs with independence/segregation controls, deadlines, reason codes and atomic projection/audit/outbox updates. _(Slice 1: resolve UPHELD/OVERTURNED; ESCALATED deferred.)_
6. Integrate decisions with design sharing, campaign readiness/activation and media availability. Editing creates a new revision under the approved resubmit/appeal behavior and cannot overwrite the appealed evidence. _(Slice 1: share remains APPROVED-only; pending appeal does not unlock.)_
7. Build accessible customer/organiser and admin timelines, deadlines, explanations, evidence and decision states. Send idempotent receipt, information-needed, resolved and expiry notifications through TTW-043 without internal details. _(Deferred.)_
8. Add SLA/consistency/retention jobs, dashboards and runbooks for provider outage, queue backlog, emergency takedown, evidence access, appeal breach and projection repair. Update Swagger/shared types, moderation/privacy docs and PRD traceability. _(Partial docs in slice 1.)_

## Test and observability plan

- Unit/component: decision/appeal transition table, eligibility/window boundaries, revision hashing, reason/copy mapping, reviewer independence, evidence access/retention and accessible timelines.
- Integration/e2e: AI/human decisions for design/media/campaign, legacy backfill, ownership/RBAC, one-active-appeal constraint, resolution projection, sharing/campaign readiness gates and notification/audit atomicity.
- Failure, retry, and concurrency: duplicate appeal, two reviewers, edit versus appeal, revoke/delete versus review, provider outage, expired window during submit, evidence deletion/hold and projection update failure.
- Playwright: customer/organiser receives a safe rejection, appeals with evidence, tracks status and sees resolution; admin reviews/escalates/resolves; unauthorized/internal-note and concurrent-state negatives. _(Deferred.)_
- Logs, metrics, traces, and alerts: decisions/appeals by safe code/state/age/policy version, queue/SLA breach, disagreement/reversal rate, rejected transitions, projection mismatch and evidence lifecycle failures; no content, notes, identities or evidence URLs in labels.

## References

- `docs/17-backend-business-completeness-audit.md:31,38,73` — moderation consequences, organiser recovery, appeals and retention require product decisions.
- `apps/api/prisma/schema.prisma` — designs/media/campaigns mutable moderation projections; `ModerationDecision` / `ModerationAppeal` models.
- `docs/moderation/ttw-027-interim-policy.md` — interim appeals matrix.
- `apps/api/src/moderation/moderation-decision.service.ts` — immutable decision + appeal workflow.
- `apps/api/src/designs/designs.service.ts` — AI/admin writers record decisions.
- `apps/api/src/fundraising/campaigns.service.ts` — submission and admin reject/activate record decisions.
- `apps/api/src/media/media.service.ts` / `media.processor.ts` — media moderation decisions.

## Acceptance criteria

- [ ] Product/legal/privacy/trust-and-safety approve the versioned content, automation, appeal, SLA, reviewer and retention matrices. _(Engineering interim approved; formal sign-off deferred.)_
- [x] Every new AI/human moderation outcome appends an immutable revision-bound decision and atomically updates a derivable current projection. _(Slice 1 writers wired.)_
- [x] Eligible owners can create at most one active appeal per decision, withdraw where allowed and receive only approved safe reasons/statuses. _(Statement-only; no evidence uploads.)_
- [x] Authorized independent reviewers can resolve/escalate appeals with stable reason codes; duplicate/concurrent actions produce one transition and notification effect. _(Resolve UPHELD/OVERTURNED; escalate deferred.)_
- [x] Pending/resolved appeals enforce approved design-share, media-availability and campaign-readiness behavior without bypass during provider failure. _(Share remains APPROVED-only.)_
- [x] Legacy states are backfilled truthfully, and evidence/decision retention, legal hold and privacy deletion preserve the approved audit chain. _(Backfill + privacy withdraw PENDING appeals; full retention jobs deferred.)_
- [ ] Queue/SLA, projection mismatch and evidence-lifecycle dashboards/alerts have tested owner runbooks.
- [ ] Integration and Playwright cover all subject types, boundaries, authorization, concurrency, safe copy and internal-evidence non-disclosure. _(API e2e for design appeals in slice 1; Playwright deferred.)_
- [x] Swagger/shared contracts, migrations/rollback, moderation/privacy/support docs, notifications, observability and PRD traceability are updated. _(Swagger + interim policy docs; notifications deferred.)_
- [ ] High-risk design, security/privacy and independent implementation reviews pass with exact evidence.

## Out of scope

- Malware scanning, safe remote ingestion and evidence upload processing → TTW-021.
- General privacy request and cross-system retention execution → TTW-025.
- Campaign business-readiness state machine beyond moderation consequences → TTW-034.
- Law-enforcement/reporting portal or community user-reporting workflow → future trust-and-safety ticket.

## Design review

**Verdict: APPROVED for engineering interim** (2026-08-20). Formal legal / trust-and-safety / privacy sign-off still required before production go-live claims.

**Policy version:** `content-moderation-policy/v1-interim-2026-08-20` — see `docs/moderation/ttw-027-interim-policy.md`.

### Interim matrix (summary)

| Topic                          | Choice                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Appealable outcomes            | Latest decision `REJECTED` or `FLAGGED` only                                                                                    |
| Window                         | 14 days from `decision.createdAt`                                                                                               |
| Active appeals                 | At most one `PENDING` per decision (partial unique index)                                                                       |
| Owner / statement              | Owner only; max 2000 chars; no binary evidence in slice 1                                                                       |
| Withdraw                       | Allowed while `PENDING`                                                                                                         |
| Content edit / new AI decision | Auto-`WITHDRAW` all `PENDING` appeals for subject                                                                               |
| Availability while pending     | Does **not** make content public/sellable; share still APPROVED-only                                                            |
| Resolve                        | `UPHELD` → new decision same outcome; `OVERTURNED` → new decision `APPROVED` default (or DTO status); never mutate old decision |
| Reviewer independence          | If challenged `actorKind===ADMIN` and `actorUserId` set, resolver ≠ that user (403)                                             |
| Customer copy                  | Never include AI scores/notes; map via helper                                                                                   |
| AI modelVersion                | `omni-moderation-latest`                                                                                                        |
| Backfill                       | `LEGACY_BACKFILL` decisions for existing Design/Media/Campaign rows                                                             |

### Blast radius / callers

- Writers: `DesignsService` create/update/updateModeration, `MediaService.adminUpdateModeration`, `MediaProcessor` AI paths, `CampaignsService` submit/activate/reject.
- Readers: owner + admin appeal controllers; privacy erasure withdraws PENDING appeals.
- Projection fields on Design/MediaAsset/Campaign remain the current-status source for share/readiness gates.

### Deferred from slice 1

- Playwright UI journeys
- SLA / escalation jobs (`ESCALATED` workflow)
- Evidence binary uploads
- Formal legal / T&S sign-off
- Notification receipts (TTW-043)

## Implementation reviews

Pending. Require independent implementation and security/privacy review, including evidence authorization, internal-note disclosure and projection consistency.

### Remediation (dual-review CHANGES_REQUIRED) — 2026-08-20

Addressed concurrent appeal resolve races (`FOR UPDATE` + conditional `updateMany`), sanitized `customerExplanation` overrides that look like internal scores/notes, stripped `moderationNotes` from owner/organizer design and campaign APIs (admin paths retain notes), and made design create/update/duplicate, campaign submit/activate/reject, and media AI decision+projection writers share one transaction so `applyProjection` is the sole moderation field writer.

## Verification evidence

- `pnpm --filter api lint` — 0 errors (pre-existing warnings only)
- `pnpm --filter api test -- --testPathPatterns='moderation-decision|designs.service|media.processor|media.service|campaigns.service|privacy.service'` — 6 suites / 108 tests passed
- `pnpm --filter api test:e2e -- moderation-appeals` — PASS (`appeals, withdraws, overturns, and rejects a second appeal`)
- Migration applied on test DB: `20260820220000_ttw027_moderation_decisions`

## Completion summary

Slice 1 in progress: immutable decisions, owner appeals, admin resolve, writer wiring, privacy withdraw, interim policy docs. Formal legal sign-off, Playwright UI, SLA/`ESCALATED`, and evidence uploads remain deferred.
