# TTW-074 — Publish answer-ready authoritative content

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** Not started\
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

- [ ] Initial priority questions have concise, useful, visible answers on unique canonical pages.
- [ ] Each answer records owner, evidence, qualifying conditions, publish/review dates and next review trigger.
- [ ] Policy-sensitive answers agree with approved pricing, fulfillment, refund/return and fundraising behavior.
- [ ] Semantic structure, accessibility, crawlability, links and any FAQ markup pass automated and editorial review.
- [ ] Measurement distinguishes engagement and qualified journeys from unverified answer-engine attribution.

## Out of scope

- High-volume generated content or doorway FAQ pages.
- Legal advice or unsupported delivery/pricing guarantees.

## Design review

Record reviewer, date, question selection, direct-answer quality, evidence, business approval, accessibility, duplication and verdict.

## Implementation reviews

Independently review factual/business accuracy and content/technical quality; repeat until PASS.

## Verification evidence

Record briefs, approvals, rendered pages, link/schema/accessibility checks and baseline outcome metrics.

## Completion summary

Summarize answered clusters, published pages, reviewers/evidence, measurement and refresh backlog.
