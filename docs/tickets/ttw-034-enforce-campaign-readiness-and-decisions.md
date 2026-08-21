# TTW-034 — Enforce campaign readiness and notify organisers

**Epic:** 3 — Complete customer and fundraiser revenue journeys  
**Status:** In progress (slice 1)  
**Risk:** High  
**Blocked by:** TTW-003, TTW-004, TTW-031, TTW-035, TTW-042, TTW-043  
**Blocks:** TTW-053, TTW-054

## Background

Submission requires only a title. Activation checks that any attached designs are approved, but an empty campaign passes, null designs are ignored, and product status, campaign price/floor, variants, stock, dates, organiser eligibility, terms, and payout readiness are not checked. Public lookup does not honor a future `startDate`. Campaign-product creation writes the join row before validating/creating its optional price, so an error can leave an unpriced offer. General admin status update accepts broad transitions; paused campaigns are mutable but have no reviewed resume path. Decisions emit admin operational alerts, not organiser transactional messages.

## Proposal

Create one structured campaign-readiness evaluator with stable blocker/warning codes, consumed by organiser status UI, submission, admin review, activation/resume, and TTW-031 public sellability. Submission requires approved organiser eligibility/current terms, complete campaign copy and valid dates, at least one owned attached design/product, and a valid campaign price; designs may still await moderation. Activation additionally requires every design APPROVED, every product ACTIVE, at least one available variant per offer, price at or above the current organiser-cost floor, a future end date, and TTW-042 payout eligibility.

Future starts are allowed: approval records ACTIVE but the offer is “scheduled” and remains absent from public lookup/quote until `startDate`; no new SCHEDULED enum is introduced. Add content/configuration revision and approved revision. Pausing preserves the approved revision; an edit while paused moves the campaign to DRAFT and requires resubmission. Legal transitions are DRAFT→REVIEW, REVIEW→ACTIVE or DRAFT, ACTIVE→PAUSED/DISABLED/ENDED, PAUSED→ACTIVE only when revision/readiness still match, and ACTIVE→ENDED on expiry. ENDED is terminal; restoring DISABLED requires a documented admin recovery back to DRAFT and full review.

Persist each transition with actor, reason, revision, readiness snapshot/policy version, and unique effect key. Transition, campaign update, audit, and required organiser outbox are atomic. Add organiser templates for submission acknowledgment, AI/admin rejection, approved-live/approved-scheduled, paused, disabled, resumed, and ended; use TTW-043 preference/effect/delivery infrastructure and never include internal moderation notes.

## Invariants

- No public/quote/order path exposes or accepts a campaign outside its ACTIVE date window or with an unsellable offer.
- Activation/resume succeeds only from a legal prior state, for the same approved revision, with zero readiness blockers evaluated in the transition transaction.
- Every campaign product and required price is created/updated atomically; partial invalid offers are not persisted.
- Attached designs belong to the organiser and product; only approved, safely published design media reaches an active public offer.
- Each status decision creates one immutable transition/audit/business effect and at most one required organiser delivery effect, even under concurrent/replayed requests.
- Rejection copy shown to the organiser excludes internal notes; payout/KYC and moderation details remain access-controlled.

## Implementation plan

1. Record product/operations/moderation/finance approval of field/readiness requirements, future-start semantics, transition matrix, pause/edit/resume, disable recovery, decision reasons, and notification copy.
2. Add transition/revision/readiness snapshot schema and constraints. Backfill current campaigns/revisions, report invalid ACTIVE rows, and define quarantine/rollback rather than silently grandfathering them.
3. Implement one readiness evaluator over TTW-031 offers and TTW-042 payout eligibility, returning typed blocker/warning codes and no sensitive evidence to organiser clients.
4. Make campaign product/design/price mutations ownership-safe and transactional; add/update/remove API support needed to repair blockers and increment revision.
5. Replace generic status assignment with conditional legal transitions, transactional readiness recheck, immutable transition/audit record, and unique organiser notification effect.
6. Add organiser transactional templates/outbox production and admin/organiser readiness/transition-history UI. Separate customer-visible rejection reason from internal moderation notes.
7. Enforce start/end window in public lookup, quote, and order creation; make expiry/resume/concurrent admin decisions idempotent.
8. Update Swagger/shared contracts, moderation/operations runbooks, PRD traceability, seed scenarios, metrics/alerts, and cross-surface Playwright lifecycle.

## Test and observability plan

- Unit/component: every readiness code, transition matrix, revision invalidation, date boundaries, safe reason projection, readiness checklists, and decision email rendering.
- Integration/e2e: empty/unpriced/below-floor/inactive-product/no-variant/out-of-stock/foreign-or-unapproved-design/unverified-organiser/payout-ineligible cases; transactional offer mutation; scheduled visibility; transition/outbox/audit atomicity.
- Failure, retry, and concurrency: two activate/reject/resume requests, edit racing approval, stock/price/KYC change during activation, duplicate expiry job, outbox enqueue failure, and transaction rollback at each effect.
- Logs, metrics, traces, and alerts: readiness denials by safe code, review age, active-with-zero-offers invariant, transition outcomes, scheduled starts, expiry lag, and decision delivery effect; no story/reason/KYC/moderation free text in labels.

## References

- `apps/api/src/fundraising/campaigns.service.ts:309-379` — campaign product is persisted before price validation/creation.
- `apps/api/src/fundraising/campaigns.service.ts:394-430` — public lookup checks ACTIVE/end but not future start or offer readiness.
- `apps/api/src/fundraising/campaigns.service.ts:476-500` — submission requires DRAFT and title only.
- `apps/api/src/fundraising/campaigns.service.ts:589-651` — activation only blocks attached non-approved designs and permits empty/null-design campaigns.
- `apps/api/src/fundraising/campaigns.service.ts:712-748` — general status assignment lacks a legal source→target matrix.
- `apps/api/src/fundraising/campaigns.service.ts:33-37` — PAUSED campaigns are mutable despite no reviewed resume flow.
- `apps/api/src/mail/mail-outbox-templates.ts:3-19` — no organiser campaign-decision transactional events exist.
- `apps/admin/app/admin/moderation/campaigns/[id]/page.tsx:283-339` — admin actions show no readiness checklist beyond API errors.

## Acceptance criteria

- [ ] Owners approve and record readiness fields/codes, date scheduling, transition/revision, pause/edit/resume, recovery, and decision-copy policies.
- [ ] Migration reports/remediates invalid existing ACTIVE campaigns and preserves rollback/quarantine evidence.
- [ ] Submission/activation/resume use one evaluator; zero-product, invalid-price/floor, inactive/unavailable product, unsafe/foreign design, dates, organiser, and payout failures are blocked with actionable safe codes.
- [ ] Offer mutation is atomic and ownership-safe; paused edits invalidate approval and require DRAFT resubmission.
- [ ] Conditional transition/revision constraints prevent illegal, duplicate, stale, and concurrent decisions.
- [ ] Future-approved campaigns remain non-public/non-orderable until start and automatically end once at expiry.
- [ ] Transition, audit, and organiser notification effect are atomic and exactly one; templates cover submit/reject/approve/pause/disable/resume/end without internal notes.
- [ ] Admin/organiser UI and Playwright show blocker repair, reject/resubmit, scheduled approval, public go-live, pause/resume, and expiry journeys.
- [ ] Swagger/shared contracts, runbooks, metrics/alerts, and PRD traceability are updated.
- [ ] High-risk security and independent implementation review pass.

## Out of scope

- Organiser application and initial DRAFT entry → TTW-030.
- Full DRAFT campaign builder and mutation UX → TTW-035.
- Offer option/read-model implementation → TTW-031.
- Payout eligibility/KYC policy → TTW-042.
- Notification preferences/dead-letter/replay machinery → TTW-043.

## Design review

### Slice 1 design review (2026-08-21)

**Date:** 2026-08-21  
**Risk:** High  
**Policy version:** `campaign-readiness/v1-interim-2026-08-21`  
**Verdict:** Proceed with interim policy (formal product/ops/moderation/finance sign-off deferred)

| Topic           | Decision                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------- |
| Authority       | One server readiness evaluator; clients never invent readiness                               |
| Revision        | TTW-035 `draftRevision` stamped to `approvedRevision` on activate; resume requires equality  |
| Submit blockers | Copy, dates, offers/price/floor, organiser ACTIVE + current terms; designs may be pending    |
| Activate gates  | + designs APPROVED, products ACTIVE, ≥1 sellable variant, future endDate                     |
| Scheduled start | Future `startDate` allowed; status ACTIVE; warning `CAMPAIGN_READINESS_SCHEDULED_START`      |
| Payout          | Warning-only deferred (`CAMPAIGN_READINESS_PAYOUT_DEFERRED`) until TTW-042                   |
| Notifications   | Organiser outbox: approved (live/scheduled), rejected (admin/AI), resumed; no internal notes |
| Ownership       | Missing/foreign campaigns share `404 Campaign not found`                                     |
| Playwright      | Full lifecycle matrix deferred                                                               |

Policy: `docs/fundraising/ttw-034-interim-policy.md`

## Implementation reviews

_Pending independent security + implementation review after commit._

## Verification evidence

```text
pnpm --filter api typecheck            # pass
pnpm --filter api lint                 # 0 errors (pre-existing warnings only)
pnpm --filter api exec jest --testPathPatterns='campaign-readiness|campaigns.service.spec|campaigns.controller.spec|mail-outbox-templates.spec'
  # suites green
node scripts/quality/check-diff-coverage.mjs --base origin/main --floor 80
  # 154/174 lines (88.51%) — pass
```

Migration: `apps/api/prisma/migrations/20260821090000_ttw034_campaign_approved_revision`
Policy: `docs/fundraising/ttw-034-interim-policy.md`
Playwright: deferred (full matrix)

## Completion summary

Slice 1: readiness evaluator as submit/activate/resume authority; `approvedRevision`; organiser decision emails for approve/reject/resume; stable `CAMPAIGN_READINESS_*` codes. Later slices: transition/snapshot schema, pause-edit invalidation, invalid ACTIVE quarantine, Playwright lifecycle, hard payout gate.
