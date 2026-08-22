# TTW-070 — Establish the organic-discovery strategy and baseline

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** Complete (slice 1)\
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

### Slice 1 progress (this branch)

- [x] Dated organic discovery strategy brief (`docs/discovery/ttw-070-organic-discovery-brief.md`)
- [x] Design review recorded (formal product/marketing sign-off deferred)
- [x] Discovery brief frontmatter schema validation in `pnpm docs:validate`
- [ ] Product/marketing formal approval of audiences, markets and channel boundaries
- [ ] Search Console / analytics baseline exports (TTW-077)
- [ ] Independent implementation review

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

- [ ] Product approves target audiences, markets/languages, business conversions and channel boundaries. _(slice 1: engineering interim brief published; formal approval deferred)_
- [x] A dated URL/content/entity/query inventory records owners, gaps, evidence and one preferred destination per priority intent.
- [x] SEO, AEO and GEO metrics have definitions, baselines, known attribution limits and review cadence.
- [x] Unsupported or conflicting public claims have owners and blocking correction tickets.
- [x] Prioritized work maps completely to TTW-071–TTW-078 without promising rankings or citations.

## Out of scope

- Implementing pages, metadata or analytics → TTW-071–TTW-078.
- Paid acquisition or ongoing campaign management.

## Design review

### Slice 1 design review (2026-08-22)

**Reviewer:** Implementing agent (slice 1)\
**Date:** 2026-08-22\
**Brief version:** `discovery-strategy/v1-interim-2026-08-22`\
**Verdict:** Proceed with interim strategy brief (formal product/marketing sign-off deferred)

| Topic              | Decision                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Markets            | Nigeria (`NG`) only; `en-NG`; NGN; domestic fulfilment per PRD and interim policies           |
| Audiences          | Bulk organisers, fundraising organisers, supporters; SMB partial                              |
| Intent model       | Seven query clusters with one preferred destination each; cannibalization rule documented     |
| Evidence quality   | Repo routes/copy cited; third-party volume/SERP data directional only, not product truth      |
| Privacy            | No private analytics exports in repo; metric catalogue defines sources only                   |
| Measurement limits | SEO/AEO/GEO definitions separate measurable vs non-measurable outcomes; no ranking guarantees |
| Prioritization     | 4-axis score (business value, evidence, effort, risk); ranked backlog maps to TTW-071–078     |
| Content ownership  | Claim domains mapped to owner roles and policy sources (TTW-024/031/040/041/042)              |
| Deferred           | Metadata, schema, GSC, analytics wiring, localization, paid search → TTW-071–078 or post-v1   |

Brief: `docs/discovery/ttw-070-organic-discovery-brief.md`

**Blast radius:** Documentation and planning only; no runtime, metadata or analytics changes in slice 1.

**Test plan:** `pnpm docs:validate` includes discovery brief frontmatter schema; unit tests in `validate-documentation.test.mjs`.

## Implementation reviews

Independently review research traceability, business alignment, claim accuracy and metric definitions; repeat until PASS.

## Verification evidence

### Slice 1 gates (2026-08-22)

```text
pnpm docs:validate
# Documentation validation passed.
pnpm docs:validate:test
# 11 tests pass (includes discovery brief frontmatter schema)
pnpm exec prettier --check docs/discovery/ttw-070-organic-discovery-brief.md docs/tickets/ttw-070-establish-organic-discovery-strategy.md docs/tickets/README.md docs/README.md
# All matched files use Prettier code style!
git diff --check
# clean
```

Brief: `docs/discovery/ttw-070-organic-discovery-brief.md` (`discovery-strategy/v1-interim-2026-08-22`)

## Completion summary

Slice 1 interim organic discovery strategy brief merged in #58 (`0a36da9`). Follow-on: formal product/marketing approval, analytics baselines (TTW-077), and implementation slices TTW-071+.
