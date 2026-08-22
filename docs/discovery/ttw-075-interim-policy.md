# TTW-075 — AI crawler governance interim policy (slice 1)

**Version:** `crawler-governance/v1-interim-2026-08-22`  
**Ticket:** TTW-075  
**Status:** Engineering interim — legal/product formal sign-off deferred

## Decision summary

| Category              | Public discovery             | Model training | Owner             |
| --------------------- | ---------------------------- | -------------- | ----------------- |
| `conventional_search` | Allowed (public paths only)  | Denied         | Product/Marketing |
| `ai_search`           | Allowed (same HTML as users) | Denied         | Product/Marketing |
| `ai_training`         | Denied (`Disallow: /`)       | Denied         | Legal             |
| `default` (`*`)       | Allowed (public paths only)  | Denied         | Engineering       |

Search inclusion and training permission are **independent**. Slice 1 denies all listed training crawlers until explicit content licensing approval.

## Public vs private paths

| Prefix                                                      | Crawl policy                                  |
| ----------------------------------------------------------- | --------------------------------------------- |
| `/`, `/about`, `/fundraiser`, `/solutions/bulk`, `/guides/` | May be crawled when category allows discovery |
| `/auth/`, `/orders/`, `/verify-email`, `/policies/`         | Disallowed for every agent                    |

No cloaking: allowed crawlers receive the same public HTML as human visitors. Authentication is never bypassed via robots rules.

## Documented agents (robots.txt)

Encoded in `apps/web/lib/crawler-policy/matrix.ts` with vendor source URLs and `sourceReviewedAt` dates.

Training block list (slice 1): `GPTBot`, `Google-Extended`, `CCBot`, `anthropic-ai`, `ClaudeBot`.

## Optional experiment: `/llms.txt`

Served from `apps/web/app/llms.txt/route.ts` as a measured experiment summarising public URLs and policy boundaries. Removal criteria: legal objection, measurable abuse, or maintenance cost without discovery benefit.

## Deferred (slice 2+)

- Edge rate limiting and verified bot IP allowlists
- Generative referral/citation sampling dashboard (TTW-077)
- Formal legal sign-off on training reuse
- IndexNow or feed submission protocols

## References

- `apps/web/lib/crawler-policy/matrix.ts`
- `apps/web/app/robots.ts`
- [OpenAI crawlers](https://platform.openai.com/docs/bots)
- [Google crawlers](https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers)
