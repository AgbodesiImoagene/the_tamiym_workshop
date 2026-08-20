# TTW-072 — Build the public information architecture and content system

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** Not started\
**Risk:** Standard\
**Blocked by:** TTW-070\
**Blocks:** TTW-073–TTW-075

## Background

The public site has a home page, about page, fundraising landing page and dynamic fundraiser detail. It lacks durable service/category landing pages, guides, policy/help content, breadcrumbs and a governed editorial model. Several pages repeat broad claims while offering little evidence or task-specific depth, which limits both user decision-making and machine interpretation.

## Proposal

Design a user-first information architecture mapped to TTW-070 intent clusters and real business journeys. Define page types, URL conventions, navigation, breadcrumbs, related-content links, editorial fields, evidence/source records, authors/reviewers, publish/update dates and lifecycle states. Prioritize durable pages for actual services and customer questions; avoid thin programmatic combinations, doorway pages and location pages where Tamiym lacks genuine local service evidence.

## Invariants

- Each intent has one primary page; multiple pages do not compete with materially duplicated content.
- Claims about experience, delivery, savings, risk, outcomes or locations require an approved evidence owner.
- User-generated fundraiser stories remain distinct from Tamiym editorial claims and moderation policy.

## Implementation plan

1. Approve the page-type and URL map for services, fundraising, products/categories, guides, policies and organization facts.
2. Define typed editorial fields, workflow, authorship/review, evidence, freshness and archive/redirect rules.
3. Implement navigation, breadcrumbs, contextual internal links and accessible page templates.
4. Create or consolidate priority pages from approved briefs; remove or redirect duplicative/thin destinations.
5. Add content inventory/freshness reporting and owner review cadence.

## Test and observability plan

- Unit/component: Content schema, required evidence/freshness fields and link-component behavior.
- Integration/e2e: Navigation/breadcrumb journeys, archive/redirect lifecycle and accessible rendered content.
- Failure, retry, and concurrency: Conflicting slugs, unpublished references, stale evidence and simultaneous editorial updates.
- Logs, metrics, traces, and alerts: Broken/orphan links, stale priority content, landing engagement and qualified journey completion.

## References

- `apps/web/app/page.tsx:1` — broad home-page acquisition content.
- `apps/web/app/about/page.tsx:63-129` — public statistics and quality/value claims require evidence ownership.
- `apps/web/app/fundraiser/page.tsx:32-72` — one fundraising landing page serves multiple intents.

## Acceptance criteria

- [ ] Approved information architecture maps priority intents to unique canonical destinations and real conversion/support journeys.
- [ ] Editorial content has typed ownership, evidence, publish/update/review dates and archive/redirect lifecycle.
- [ ] Navigation, breadcrumbs and contextual links make every priority page reachable through crawlable anchors.
- [ ] Duplicate/thin/unsupported pages and claims are consolidated, corrected, deferred or explicitly noindexed.
- [ ] Templates meet semantic-heading, accessibility, responsive and content-rendering requirements.

## Out of scope

- Ongoing editorial production beyond the approved initial set.
- Standard catalogue/cart implementation → TTW-055.

## Design review

Record reviewer, date, audience journeys, taxonomy, content model, claims/evidence, accessibility, lifecycle and verdict.

## Implementation reviews

Independently review content accuracy, information architecture, duplication, accessibility and implementation; repeat until PASS.

## Verification evidence

Record approved map/briefs, schema tests, link crawl, content review decisions, accessibility results and redirect evidence.

## Completion summary

Summarize published architecture, page types, initial content, evidence controls, consolidated URLs and remaining briefs.
