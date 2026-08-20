# TTW-070 — Establish the organic-discovery strategy and baseline

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** Not started\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** TTW-071–TTW-078

## Background

The public site has product, bulk-order and fundraising messages, but the repository has no approved target markets, query/entity map, competitor baseline, content inventory, search baseline or definition of SEO/AEO/GEO success. Implementing metadata or pages without those decisions risks keyword cannibalization, unsupported claims and metrics that cannot distinguish visibility from qualified business outcomes.

## Proposal

Create a dated organic-discovery brief covering priority audiences, geographic/language markets, search intents, query/topic clusters, brand and related entities, public conversion journeys, current indexed footprint, competitors and content gaps. Define SEO, AEO and GEO separately, including what can and cannot be reliably measured. Establish a versioned metric catalogue and prioritization model based on business value, evidence strength, effort and risk. Record content owners and approval requirements for pricing, fulfillment, fundraising, returns and business claims.

## Invariants

- Research does not turn estimated keyword volume, generated answers or third-party scores into product truth.
- Priority is based on qualified business intent and serviceability, not traffic volume alone.
- Market and language targeting follows actual fulfillment, currency, policy and support capability.

## Implementation plan

1. Inventory public URLs, messages, entities, claims, conversions and existing analytics/search accounts.
2. Approve primary audiences, service regions, languages, business goals and non-goals.
3. Research query clusters, SERP/answer patterns, competitors, citations and content gaps with dated sources.
4. Define baseline metrics, attribution caveats, targets, review cadence and named content/business owners.
5. Publish a prioritized roadmap mapping each cluster and technical gap to one canonical page and ticket.

## Test and observability plan

- Unit/component: Validate inventory uniqueness and metric/query-map schemas.
- Integration/e2e: Sample priority queries and verify mapped pages match real public journeys.
- Failure, retry, and concurrency: Record missing tools/data, volatile result sets and conflicting page ownership.
- Logs, metrics, traces, and alerts: Baseline impressions, clicks, qualified visits, conversions, indexation and referral coverage where available.

## References

- `apps/web/app/page.tsx:1` — root marketing page is a primary acquisition surface.
- `apps/web/app/fundraiser/page.tsx:18-62` — fundraising claims currently have no query/evidence map.
- `docs/project_requirements/chapters/03-scope-of-work.tex:92` — post-launch SEO/growth work was previously outside delivery scope.

## Acceptance criteria

- [ ] Product approves target audiences, markets/languages, business conversions and channel boundaries.
- [ ] A dated URL/content/entity/query inventory records owners, gaps, evidence and one preferred destination per priority intent.
- [ ] SEO, AEO and GEO metrics have definitions, baselines, known attribution limits and review cadence.
- [ ] Unsupported or conflicting public claims have owners and blocking correction tickets.
- [ ] Prioritized work maps completely to TTW-071–TTW-078 without promising rankings or citations.

## Out of scope

- Implementing pages, metadata or analytics → TTW-071–TTW-078.
- Paid acquisition or ongoing campaign management.

## Design review

Record reviewer, date, markets, intent model, evidence quality, privacy, measurement limitations, prioritization and verdict.

## Implementation reviews

Independently review research traceability, business alignment, claim accuracy and metric definitions; repeat until PASS.

## Verification evidence

Record inventories, source dates, sampled result evidence, baseline exports, approvals and mapping checks without committing private analytics data.

## Completion summary

Summarize target markets/audiences, priority clusters, baseline, content risks, measurement limitations and sequenced work.
