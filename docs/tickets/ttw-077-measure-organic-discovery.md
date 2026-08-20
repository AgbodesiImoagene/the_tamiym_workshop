# TTW-077 — Measure organic and answer-engine outcomes

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** Not started\
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

- `docs/tickets/ttw-036-complete-analytics-contracts.md` — versioned analytics definitions and privacy-safe dimensions.
- `docs/tickets/ttw-025-implement-privacy-data-lifecycle.md` — consent/retention/deletion ownership.
- `docs/tickets/ttw-062-provision-network-dns-edge.md` — Namecheap/Route 53 domain control.
- [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [IndexNow protocol](https://www.indexnow.org/documentation)

## Acceptance criteria

- [ ] Approved owners control verified search accounts through least-privilege access; no verification secret or private export is committed.
- [ ] Canonical sitemaps are submitted and inspection/removal/incident procedures are rehearsed.
- [ ] Versioned dashboards report discovery, landing quality and qualified conversions with freshness and attribution caveats.
- [ ] Consent, retention, access, bot filtering and deletion behavior pass privacy tests.
- [ ] Coverage, schema, pipeline and material outcome regressions create actionable alerts/review work.

## Out of scope

- Purchasing third-party rank-tracking platforms without owner approval.
- Treating sampled generative answers as complete market-share measurement.

## Design review

Record reviewer, date, account/access model, metrics/attribution, consent/privacy, data flows, alert thresholds, costs and verdict.

## Implementation reviews

Require independent analytics-correctness and security/privacy review; repeat integration/access tests until PASS.

## Verification evidence

Record ownership approvals, verification/submission evidence, schema/event tests, dashboard freshness and privacy/access results without secrets.

## Completion summary

Summarize connected systems, metrics, privacy controls, dashboards, review cadence, known blind spots and costs.
