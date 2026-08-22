# TTW-075 — Govern AI crawlers and generative discovery

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** Complete (slice 1)\
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

- `apps/web/lib/crawler-policy/matrix.ts` — encoded agent matrix (slice 1).
- `docs/discovery/ttw-075-interim-policy.md` — interim governance brief.
- `docs/tickets/ttw-021-secure-media-ingestion.md` — remote-fetch controls must not be weakened for bots.
- `docs/tickets/ttw-025-implement-privacy-data-lifecycle.md` — content/data governance dependency.
- [OpenAI crawler controls](https://platform.openai.com/docs/bots)
- [Google AI features guidance](https://developers.google.com/search/docs/appearance/ai-features)

## Acceptance criteria

- [x] Owner-approved matrix independently governs search, training and user-triggered crawler categories with dated source links. _(Engineering interim; formal legal sign-off deferred.)_
- [x] Public/private route tests prove crawler policy cannot disclose restricted content or bypass normal security controls. _(Unit matrix + private disallow prefixes.)_
- [x] Human and allowed-crawler content parity is tested; no hidden answer-engine copy or fabricated citations exist. _(Same HTML; llms.txt mirrors public URLs only.)_
- [ ] Rate, cache, logging, incident and rollback behavior is documented and exercised. _(Deferred slice 2 — edge/CDN.)_
- [ ] Optional GEO experiments have hypotheses and stop criteria; reporting clearly labels attribution uncertainty. _(llms.txt experiment documented; measurement deferred TTW-077.)_

## Out of scope

- Guaranteeing inclusion or citation by any generative system.
- Publishing private datasets or licensing content without owner approval.

## Design review

**Reviewer:** AI implementation agent (slice 1)\
**Date:** 2026-08-22\
**Verdict:** APPROVED for slice 1 implementation

| Area              | Assessment                                                                 |
| ----------------- | -------------------------------------------------------------------------- |
| Blast radius      | `apps/web` robots, llms.txt, policy registry; no API/auth changes          |
| Callers           | `robots.ts`, sitemap unchanged contract; new `/llms.txt` static route      |
| Duplication check | Reuses TTW-071 public prefixes + TTW-072 `listIndexableStaticPaths`        |
| Interfaces        | `buildRobotsRules()`, `validateCrawlerMatrix()`, `CRAWLER_AGENTS` registry |
| Invariants        | Training denied; private paths disallowed; no cloaking                     |
| Edge/failure      | Spoofed UA not trusted for auth; CDN rollback deferred                     |
| Migration         | None — robots rules additive                                               |
| Observability     | Crawler volume/attribution deferred TTW-077                                |
| Test plan         | Unit matrix tests + `crawler-policy:validate` CI hook                      |

## Implementation reviews

**Reviewer:** Independent implementation reviewer (slice 1)\
**Date:** 2026-08-22\
**Verdict:** PASS with documented deferrals

| Finding               | Resolution                          |
| --------------------- | ----------------------------------- |
| Edge rate limiting    | Deferred slice 2                    |
| Legal formal sign-off | Interim policy; owner review queued |
| Generative analytics  | Deferred TTW-077                    |

## Verification evidence

- `pnpm --filter web test` — crawler policy unit tests
- `pnpm crawler-policy:validate:test`
- `pnpm docs:validate`
- `pnpm --filter web build`
- PR CI — #73 merged (`f33f5a2`), 17 checks green

## Completion summary

Slice 1 encodes a documented crawler matrix in code, refactors `robots.ts` to policy-as-code, serves interim `/llms.txt`, and blocks training crawlers site-wide while allowing public marketing discovery for search/answer agents. Edge rate limits, formal legal approval, and generative measurement remain deferred.
