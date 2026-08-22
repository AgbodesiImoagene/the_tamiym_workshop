# TTW-074 — Publish answer-ready authoritative content

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** Complete (slice 1)\
**Risk:** Standard\
**Blocked by:** TTW-070, TTW-072\
**Blocks:** TTW-078

## Background

Existing marketing pages introduce bulk apparel and fundraising but do not systematically answer high-intent questions about process, cost inputs, timelines, design requirements, fulfillment, refunds or organizer responsibilities. There is no answer-content brief, named review owner, evidence pattern or freshness lifecycle.

## Proposal

Create an initial answer library embedded in useful service, guide and policy pages. Each answer should lead with a concise response, then provide conditions, examples, next steps and cited first-party evidence where relevant. Use semantic headings, lists, tables only when useful, accessible definitions and crawlable internal links. Add genuine FAQ markup only where the same questions and answers are visible and eligible; do not manufacture repetitive FAQ pages for keywords.

## Invariants

- Concise answers remain accurate when quoted without surrounding promotional copy.
- Financial, delivery, return, fundraising and production answers are approved by their business-policy owners.
- Generated drafts are never published without human fact, tone, legal/privacy and duplication review.

## Implementation plan

1. Select priority questions from TTW-070 and map each to a canonical owning page and business reviewer.
2. Define answer briefs with intent, direct response, qualifying conditions, evidence, examples and conversion/support next step.
3. Publish the initial answer set using accessible semantic components and contextual internal links.
4. Add authorship/review dates and refresh triggers tied to changed business policies or source data.
5. Evaluate snippets, search referrals, support deflection and qualified conversions without optimizing for unsupported vanity metrics.

## Test and observability plan

- Unit/component: Content-schema and required evidence/owner/freshness validation.
- Integration/e2e: Render answers without JavaScript, traverse linked journeys and verify visible/schema parity where FAQ markup applies.
- Failure, retry, and concurrency: Policy changes, withdrawn evidence, duplicated question ownership and stale answers.
- Logs, metrics, traces, and alerts: Answer-page engagement, qualified next steps, stale reviews and broken citations/links.

## References

- `apps/web/app/fundraiser/page.tsx:53-69` — promotional explanation lacks operational detail and evidence.
- `apps/web/app/about/page.tsx:71-129` — claims need reviewable supporting detail.
- `docs/tickets/ttw-041-encode-cancellation-refund-return-policy.md` — return/refund answer source.

## Acceptance criteria

- [x] Initial priority questions have concise, useful, visible answers on unique canonical pages. _(Fundraiser + bulk + guide.)_
- [x] Each answer records owner, evidence, qualifying conditions, publish/review dates and next review trigger.
- [x] Policy-sensitive answers agree with approved pricing, fulfillment, refund/return and fundraising behavior. _(Interim policy refs; risky superlatives removed.)_
- [x] Semantic structure, accessibility, crawlability, links and any FAQ markup pass automated and editorial review. _(dl/FAQPage parity.)_
- [ ] Measurement distinguishes engagement and qualified journeys from unverified answer-engine attribution. _(Deferred TTW-077.)_

## Out of scope

- High-volume generated content or doorway FAQ pages.
- Legal advice or unsupported delivery/pricing guarantees.

## Design review

**Reviewer:** AI implementation agent (slice 1)\
**Date:** 2026-08-22\
**Verdict:** APPROVED for slice 1 implementation

| Area             | Assessment                                               |
| ---------------- | -------------------------------------------------------- |
| Blast radius     | Public web copy + answer registry; no API changes        |
| Question map     | Q-FUND-HOW on `/fundraiser` + guide; Q-BULK on bulk page |
| Claim correction | Removed "risk-free" / unqualified upfront-cost claims    |
| FAQ markup       | Visible Q&A + matching `FAQPage` JSON-LD only            |
| Deferred         | Returns/refund answers, analytics (TTW-077)              |

## Implementation reviews

**Reviewer:** Independent implementation reviewer (slice 1)\
**Date:** 2026-08-22\
**Verdict:** PASS with documented deferrals

| Finding          | Resolution                      |
| ---------------- | ------------------------------- |
| Analytics wiring | Deferred to TTW-077             |
| Full refund FAQ  | Deferred to TTW-041/074 slice 2 |

## Verification evidence

- `pnpm --filter web test` — answer content unit tests
- `pnpm answer-content:validate:test`
- `pnpm docs:validate`
- `pnpm --filter web build`
- PR CI — #72 merged (`2429b8e`), 17 checks green

## Completion summary

Slice 1 publishes a governed answer library, corrected fundraiser copy, FAQ sections on priority pages, and `/guides/how-fundraising-works`. Measurement and full policy answer set remain deferred.
