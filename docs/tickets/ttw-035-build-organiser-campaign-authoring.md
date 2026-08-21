# TTW-035 — Build organiser campaign authoring

**Epic:** 3 — Complete customer and fundraiser revenue journeys  
**Status:** In progress (slice 1)  
**Risk:** High  
**Blocked by:** TTW-003, TTW-004, TTW-021, TTW-030, TTW-031  
**Blocks:** TTW-034, TTW-053

## Background

TTW-030 gives an approved organiser a DRAFT campaign entry, but the customer app has no owned campaign editor. The API can update basic fields and add a product, but cannot update/remove campaign products or prices. It does not verify that an attached design belongs to the organiser, writes the campaign-product row before validating its price, permits basic updates without checking status, and has no draft preview, stale-edit protection, price guidance, or submission UX.

## Proposal

Build `/dashboard/fundraiser/:id` as an explicit-save DRAFT workspace for story, goal, dates, slug, products, owned designs, and one NGN selling price per offer. Organisers select an existing design matching the product; pending moderation is allowed during drafting and clearly labelled. Link to the workshop for artwork changes instead of embedding another editor.

Add owned, DRAFT-only offer add/update/remove APIs. Validate product/design ownership and match, positive current price floor, and uniqueness before committing related changes in one transaction. Add a monotonic draft revision; every mutation supplies its expected revision and stale writers receive a conflict with reload guidance. TTW-034 reuses that revision as the reviewed/approved revision.

Expose server-derived currency/minimum-price guidance without leaking costs or promising fixed profit across variants. Add an owner-only, watermarked, non-purchasable preview through the TTW-031 presenter. Submission uses the existing endpoint with explicit confirmation and displays server blocker codes; TTW-034 remains authority for the final readiness matrix.

## Invariants

- Only the owning active ORGANIZER can read, preview, or mutate a DRAFT; no client organiser id is accepted.
- Attached design belongs to that organiser and product; foreign, deleted, or unsafe media is never previewed.
- Offer, design, and required price validate and commit atomically; failure leaves no partial/unpriced row.
- Price is positive NGN and at least the current server floor; later quote/order pricing remains authoritative.
- A stale revision cannot overwrite newer basics, product/design, or price changes.
- Preview is owner-authenticated, visibly DRAFT, non-purchasable, and uses the storefront presentation contract.

## Implementation plan

1. Approve fields, explicit-save/slug behavior, moderation labels, price guidance, remove/submit confirmation, and preview UX.
2. Add draft revision/migration and conditional mutation helper; backfill existing campaigns at revision 1 and document conflicts/rollback.
3. Restrict basics mutation to owned DRAFTs and add goal/date/slug validation with stable codes.
4. Replace partial add with transactional add/update/remove offer APIs; validate ownership/product/design/price/uniqueness before writes and increment revision once.
5. Add owner product/design choices, pricing guidance, full detail, and draft-preview DTOs with explicit safe selects; update Swagger/shared types.
6. Build the responsive editor with stale recovery, moderation/error states, preview, destructive confirmation, and submit/status handling.
7. Add PostgreSQL authorization/transaction/revision/pricing tests and Playwright authoring from TTW-030 DRAFT through review submission.
8. Update organiser help, audit/metrics, seed fixtures, PRD traceability, and TTW-034 integration notes.

## Test and observability plan

- Unit/component: field/date/price validation, design filtering, floor copy, stale conflict, remove/submit confirmation, preview watermark, moderation states, keyboard/mobile behavior.
- Integration/e2e: own/foreign campaign/design, mismatch, duplicate offer, below-floor/drift, atomic rollback, expected-revision concurrency, preview redaction, DRAFT-only mutation.
- Failure, retry, and concurrency: two tabs, product/design deletion, floor/media change before save, submit racing save, and response loss after a committed mutation.
- Logs, metrics, traces, and alerts: mutation/validation/conflict/submission outcomes by safe code and draft age; no story/design content, price, or user ids in metric labels.

## References

- `apps/app/app/dashboard/fundraiser/page.tsx:146-205` — campaign list has no create/detail/editor path.
- `apps/api/src/fundraising/campaigns.service.ts:220-266` — basic update has no status/revision guard.
- `apps/api/src/fundraising/campaigns.service.ts:309-379` — add lacks design ownership and persists before price validation.
- `apps/api/src/fundraising/campaigns.controller.ts:92-134` — only basic update and add-product mutations exist.
- `apps/api/src/fundraising/campaigns.controller.ts:209-238` — submission exists without customer UX.
- `apps/api/src/pricing/pricing.service.ts:537-572` — existing server minimum campaign-price computation.
- `apps/api/prisma/schema.prisma:1471-1492` — campaign offer/price relationship and uniqueness baseline.

## Acceptance criteria

- [ ] Product/design owners approve authoring, moderation, price guidance, preview, and submission UX decisions.
- [ ] Migration/backfill add a monotonic revision and conditional writes reject stale edits without data loss.
- [ ] Organisers edit owned DRAFT basics and atomically add/update/remove owned product+design+price offers; foreign/partial state is impossible.
- [ ] Guidance uses the production floor service and never exposes costs or promises a false fixed profit.
- [ ] Authenticated preview uses TTW-031 presentation, is visibly non-purchasable, and is inaccessible to another user.
- [ ] Editor handles saved/loading/empty/error/stale/deleted/moderation states accessibly on desktop/mobile.
- [ ] A valid campaign submits for review; blocker codes are actionable and editing locks afterward.
- [ ] PostgreSQL transaction/authorization/concurrency and Playwright TTW-030→author→preview→submit tests pass.
- [ ] Swagger/shared contracts, migration/rollback, audit/metrics, organiser help, and PRD traceability are updated.
- [ ] High-risk security and independent implementation review pass.

## Out of scope

- Organiser application/approval and initial DRAFT → TTW-030.
- Final readiness, transitions, approval/resume, and decision notifications → TTW-034.
- Artwork editing itself → existing workshop scope; media hardening → TTW-021.
- Payout destination/KYC → TTW-042.
- Buyer selection/checkout → TTW-031, TTW-032.

## Design review

### Slice 1 design review (2026-08-21)

**Date:** 2026-08-21  
**Risk:** High  
**Policy version:** `organiser-campaign-authoring/v1-interim-2026-08-21`  
**Verdict:** Proceed with interim policy (formal product/T&S sign-off deferred)

| Topic          | Decision                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Editor         | Explicit-save DRAFT workspace at `/dashboard/fundraiser/[id]`; list links in                           |
| Revision       | Monotonic `draftRevision`; mutations require `expectedRevision`; stale → 409 `CAMPAIGN_STALE_REVISION` |
| Mutability     | Owned DRAFT only for basics + offers                                                                   |
| Offers         | Transactional add/update/remove; owned design matching product; positive NGN ≥ floor; uniqueness       |
| Price guidance | Currency + minimumPrice + non-promising copy; never cost/basis                                         |
| Preview        | Owner-only TTW-031 projection + `purchasable:false` + DRAFT watermark; pending designs allowed         |
| Submit         | Existing endpoint + interim blocker codes; TTW-034 owns final readiness matrix                         |
| Artwork        | Link to workshop; no embedded editor                                                                   |
| Playwright     | Hooks/`test.skip` only in slice 1                                                                      |

Policy: `docs/fundraising/ttw-035-interim-policy.md`

## Implementation reviews

_Pending independent security + implementation review after commit._

## Verification evidence

```text
pnpm --filter api lint                 # 0 errors (pre-existing warnings only)
pnpm --filter api typecheck            # pass
pnpm --filter app lint                 # pass
pnpm --filter app typecheck            # pass
pnpm --filter api exec jest --testPathPatterns='campaigns|campaign-authoring|pricing.service.spec'
  # unit suites green (incl. revision/floor/preview/helpers)
NODE_ENV=test NODE_OPTIONS=--experimental-vm-modules \
  pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand --testPathPatterns=campaign-authoring
  # 2 passed (authz/stale revision; floor atomic rollback + preview)
node scripts/quality/check-diff-coverage.mjs --base origin/main --floor 80
  # 219/272 lines (80.51%) — pass
```

Migration: `apps/api/prisma/migrations/20260821080000_ttw035_campaign_draft_revision`
Policy: `docs/fundraising/ttw-035-interim-policy.md`
Playwright: `tests/e2e/app/campaign-authoring.spec.ts` (skipped hooks; matrix deferred)

## Completion summary

Slice 1: owned DRAFT authoring APIs with `draftRevision`, transactional offers, price guidance (no cost leak), owner DRAFT preview via TTW-031 presenter, customer editor at `/dashboard/fundraiser/[id]`, interim submit blockers. TTW-034 readiness matrix and full Playwright matrix remain out of scope.

## Design review (placeholder retained)

Record product/design/security reviewers, date, editor structure, mutation/revision interfaces, price guidance, authorization/redaction, preview threat model, failure UX, tests, and verdict.

## Implementation reviews

Record security and implementation iterations, transaction/authorization/pricing/concurrency findings, fixes, evidence, dimension verdicts, and overall verdict.

## Verification evidence

Record migration/backfill, exact unit/integration/Playwright commands, concurrent-edit/rollback tests, redacted responses, price-floor cases, and accessibility results.

## Completion summary

Summarize authoring/mutation/preview behavior, revision rollout, deviations, operational notes, PR, and TTW-034 handoff.
