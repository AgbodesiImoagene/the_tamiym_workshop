# TTW-075 — Govern AI crawlers and generative discovery

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** Not started\
**Risk:** High\
**Blocked by:** TTW-071, TTW-072\
**Blocks:** TTW-078

## Background

The repository has no explicit policy for search-oriented AI crawlers, model-training crawlers, user-triggered fetchers or generative referrals. Search and training controls can be independent, and indiscriminate allow/block rules could either remove Tamiym from answer search or expose content the business did not intend to license. GEO results are also difficult to attribute and should not invite bot-specific cloaking or fabricated citations.

## Proposal

Approve and encode a crawler matrix covering conventional search, OAI-SearchBot/GPTBot and other evidenced agents relevant to TTW-070. Separate discoverability choices from training choices and document legal/content-owner approval. Serve the same truthful public HTML to humans and allowed crawlers, with explicit robots policy, rate protections and verified bot identification only where operationally necessary. Strengthen entity consistency, source citations and public fact pages. Treat `llms.txt`, feeds or IndexNow as optional measured experiments after standard foundations, with removal criteria and no implied industry-standard status.

## Invariants

- Crawler policy never substitutes for authentication or makes private/tokenized content public.
- Search inclusion and model-training permission are separate owner decisions.
- Allowed crawlers receive no hidden or materially different claims from users.
- Bot identity is not trusted from user-agent text alone for privileged/rate-limit bypass.

## Implementation plan

1. Inventory relevant agents, documented controls, content rights, business value and operational risks with dated primary sources.
2. Obtain owner/legal/content approval for search, training, user-triggered access and rate policy.
3. Encode/test robots directives and edge behavior; document change propagation and emergency rollback.
4. Create consistent public entity/fact/source surfaces and monitor generative referral/citation samples from a versioned prompt/query set.
5. Run bounded experiments for optional discovery files/submission protocols only with hypothesis, baseline, cost and removal criteria.

## Test and observability plan

- Unit/component: Robots matrix, parser fixtures and policy-as-code tests.
- Integration/e2e: Fetch representative public/private routes with declared agents and confirm identical public content plus correct denial behavior.
- Failure, retry, and concurrency: Spoofed agents, excessive crawl, policy rollback, stale CDN robots and provider IP-list change.
- Logs, metrics, traces, and alerts: Privacy-limited crawler volume/status, rate events, generative referrals and sampled citation accuracy.

## References

- `apps/web` — no robots or AI-crawler policy currently exists.
- `docs/tickets/ttw-021-secure-media-ingestion.md` — remote-fetch controls must not be weakened for bots.
- `docs/tickets/ttw-025-implement-privacy-data-lifecycle.md` — content/data governance dependency.
- [OpenAI crawler controls](https://developers.openai.com/api/docs/bots)
- [Google AI features guidance](https://developers.google.com/search/docs/appearance/ai-features)

## Acceptance criteria

- [ ] Owner-approved matrix independently governs search, training and user-triggered crawler categories with dated source links.
- [ ] Public/private route tests prove crawler policy cannot disclose restricted content or bypass normal security controls.
- [ ] Human and allowed-crawler content parity is tested; no hidden answer-engine copy or fabricated citations exist.
- [ ] Rate, cache, logging, incident and rollback behavior is documented and exercised.
- [ ] Optional GEO experiments have hypotheses and stop criteria; reporting clearly labels attribution uncertainty.

## Out of scope

- Guaranteeing inclusion or citation by any generative system.
- Publishing private datasets or licensing content without owner approval.

## Design review

Record reviewer, date, crawler/source matrix, content rights, security boundaries, parity, rate/cost controls, measurement and verdict.

## Implementation reviews

Require independent security/privacy and content-policy review; repeat spoofing, disclosure and parity tests until PASS.

## Verification evidence

Record policy sources/dates, approvals, robots outputs, route matrix results, rate/rollback exercises and experiment baselines.

## Completion summary

Summarize allowed/disallowed categories, content rights, technical enforcement, entity/source improvements, experiments and limitations.
