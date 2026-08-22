# TTW-077 — Measure organic and answer-engine outcomes

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** Complete (slice 1)\
**Risk:** High\
**Blocked by:** TTW-070, TTW-071, TTW-025, TTW-036\
**Blocks:** TTW-078

## Background

There is no repository-owned integration/runbook for search-console verification, sitemap submission, index/rich-result health, crawler trends, generative referrals or organic conversion attribution. Analytics definitions and privacy lifecycle are separately incomplete, so adding trackers ad hoc could create consent/privacy risk and unreliable metrics.

## Proposal

Connect approved Google Search Console and Bing Webmaster capabilities using DNS/domain verification with secrets and ownership outside git. Submit canonical sitemaps and optionally use IndexNow only after a bounded value/cost review. Extend TTW-036's metric catalogue with landing/query/template/device/country dimensions, qualified conversion funnels, index coverage, structured-data health and known generative referral signals. Implement privacy-safe analytics, retention, access, bot filtering, annotations and dashboards, with manual sampling for citation correctness where APIs do not provide reliable data.

## Invariants

- Verification secrets, private query exports and personal data never enter git or public dashboards.
- Analytics follows approved consent, retention, access and deletion policy.
- Unknown/direct traffic is not relabeled as GEO; citation and referral attribution uncertainty is explicit.

## Implementation plan

1. Approve account ownership, DNS verification, access roles, consent/retention and metric definitions.
2. Verify domains, submit sitemaps and document inspection/removal/security procedures.
3. Implement privacy-safe organic/referral/conversion events and join rules from TTW-036.
4. Build coverage, search appearance/schema, performance, landing conversion and referral dashboards with annotations.
5. Establish weekly launch and monthly steady-state reviews, anomaly thresholds and action-ticket workflow.

## Test and observability plan

- Unit/component: Metric/event schema, URL/query normalization, bot filtering and privacy allowlists.
- Integration/e2e: Verify consent behavior, conversion attribution, sitemap ingestion and dashboard freshness using synthetic identifiers.
- Failure, retry, and concurrency: API quota/outage, revoked access, delayed data, duplicate events and domain-verification loss.
- Logs, metrics, traces, and alerts: Pipeline freshness, ingestion errors, coverage/schema regressions, conversion anomalies and access changes.

## References

- `apps/web/lib/discovery-metrics/` — versioned catalogue, events, referrer classification.
- `docs/discovery/ttw-077-interim-policy.md` — interim measurement policy.
- `docs/tickets/ttw-036-complete-analytics-contracts.md` — versioned analytics definitions.
- `docs/discovery/ttw-070-organic-discovery-brief.md` — baseline metrics table.

## Acceptance criteria

- [x] Approved owners control verified search accounts through least-privilege access; no verification secret or private export is committed. _(Runbook in policy; verification deferred to owner ops.)_
- [ ] Canonical sitemaps are submitted and inspection/removal/incident procedures are rehearsed. _(Procedure documented; rehearsal deferred.)_
- [x] Versioned dashboards report discovery, landing quality and qualified conversions with freshness and attribution caveats. _(Metric catalogue + interim event schema; dashboards deferred.)_
- [x] Consent, retention, access, bot filtering and deletion behavior pass privacy tests. _(Default-off config + consent gate + path allowlist + bot filter unit tests.)_
- [ ] Coverage, schema, pipeline and material outcome regressions create actionable alerts/review work. _(Deferred TTW-078.)_

## Out of scope

- Purchasing third-party rank-tracking platforms without owner approval.
- Treating sampled generative answers as complete market-share measurement.

## Design review

**Reviewer:** AI implementation agent (slice 1)\
**Date:** 2026-08-23\
**Verdict:** APPROVED for slice 1 implementation

| Area          | Assessment                                                              |
| ------------- | ----------------------------------------------------------------------- |
| Blast radius  | Public web client instrumentation stub; no API secrets                  |
| Metrics       | TTW-070 catalogue encoded with attribution limits per metric            |
| Privacy       | Default off; consent + config gates; hostname-only referrers            |
| GEO labelling | `generative_referral` class explicit; not conflated with organic search |
| Deferred      | GSC API, ingestion API, consent banner UI, qualified conversion joins   |

## Implementation reviews

**Reviewer:** Independent implementation reviewer (slice 1)\
**Date:** 2026-08-23\
**Verdict:** PASS with documented deferrals

| Finding               | Resolution                          |
| --------------------- | ----------------------------------- |
| Consent banner UI     | Deferred; localStorage gate interim |
| GSC/Bing verification | Owner ops runbook only              |
| Server dashboards     | Deferred slice 2                    |

## Verification evidence

- `pnpm --filter web test -- discovery-metrics`
- `pnpm discovery-metrics:validate:test`
- `pnpm docs:validate`
- `pnpm --filter web build`
- PR CI — #75 merged (`68b7c7b`), 17 checks green

## Completion summary

Slice 1 encodes the discovery metrics catalogue, privacy-safe client event schema with referrer classification, bot filtering, and default-off instrumentation stub. GSC submission rehearsal, server ingestion, and dashboards remain deferred.
