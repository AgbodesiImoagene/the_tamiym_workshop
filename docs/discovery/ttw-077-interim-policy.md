# TTW-077 — Discovery measurement interim policy (slice 1)

**Version:** `discovery-metrics/v1-interim-2026-08-22`  
**Ticket:** TTW-077  
**Status:** Engineering interim — GSC/Bing account verification deferred to owner ops

## Metric catalogue

The versioned catalogue in `apps/web/lib/discovery-metrics/catalogue.ts` implements the TTW-070 baseline table. Each metric records:

- Definition and target data source
- Attribution limits (explicit uncertainty for GEO/generative referrals)
- Dashboard owner
- Baseline status (`not_instrumented`, `interim`, `active`)

**Timezone:** `Africa/Lagos` (aligned with TTW-036 analytics windows).

## Privacy-safe web events (slice 1)

| Control          | Slice 1 behaviour                                                                 |
| ---------------- | --------------------------------------------------------------------------------- |
| Default state    | **Disabled** — no collection without config + consent                             |
| Config gate      | `NEXT_PUBLIC_DISCOVERY_ANALYTICS_ENABLED=true`                                    |
| Consent          | `localStorage` key `ttw_discovery_analytics_consent=granted` (banner UI deferred) |
| Bot filter       | Client UA heuristics; never trust UA for auth                                     |
| Path allowlist   | Public marketing paths only; `/auth/`, `/orders/`, `/verify-email` blocked        |
| Referrer storage | Hostname only — no path, query, or PII                                            |
| Transport        | Optional `NEXT_PUBLIC_DISCOVERY_ANALYTICS_ENDPOINT` via `sendBeacon`              |

Generative referrals (`chatgpt.com`, `perplexity.ai`, etc.) are labelled `generative_referral` and must **not** be relabelled as organic search or guaranteed GEO attribution.

## Search Console / Bing (owner procedures — no secrets in git)

1. Verify `WEB_PUBLIC_ORIGIN` domain via DNS TXT (owner: Product/Marketing).
2. Submit canonical `https://<origin>/sitemap.xml` after TTW-071 deploy.
3. Record verification date and property URL in ticket evidence only.
4. Rehearse URL inspection and temporary removal for staging misconfiguration.

Verification tokens, API keys, and private query exports **never** enter the repository.

## Review cadence

| Cadence          | Activity                                                              |
| ---------------- | --------------------------------------------------------------------- |
| Weekly (rollout) | Check GSC coverage, organic_sessions interim events, schema CI health |
| Monthly          | Metric catalogue review with product + engineering                    |
| Quarterly        | TTW-070 brief alignment                                               |

## Deferred (slice 2+)

- Consent banner UI and TTW-025 alignment
- Server-side ingestion API + dashboards
- GSC/Bing API automation
- IndexNow experiment
- Qualified conversion joins (`organic_register`, `organic_supporter_order`)
- Generative citation sampling workflow

## References

- `apps/web/lib/discovery-metrics/`
- `docs/discovery/ttw-070-organic-discovery-brief.md` — baseline metrics table
- `docs/tickets/ttw-036-complete-analytics-contracts.md` — business analytics contracts
