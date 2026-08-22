# TTW-074 — Answer-ready content interim policy (slice 1)

**Version:** `answer-content/v1-interim-2026-08-22`  
**Ticket:** TTW-074  
**Status:** Engineering interim — product/marketing formal sign-off deferred

## Priority question map (slice 1)

| Question cluster | Canonical page                                 | Owner             |
| ---------------- | ---------------------------------------------- | ----------------- |
| Q-FUND-HOW       | `/fundraiser`, `/guides/how-fundraising-works` | Fundraising PM    |
| Q-BULK           | `/solutions/bulk`                              | Product/Marketing |
| Q-DESIGN (bulk)  | `/solutions/bulk`                              | Product/Marketing |

## Answer brief requirements

Each `AnswerEntry` records:

- `directAnswer` — standalone lead sentence
- `details` — qualifying conditions / next steps
- `evidence` — owner, source id, reviewed date
- `nextReviewTrigger` — policy change that requires re-review

## Corrected claims (fundraiser landing)

Removed unsupported superlatives from `/fundraiser`:

- "risk-free"
- unqualified "no upfront costs"

Replaced with policy-aligned language on readiness, moderation, Paystack checkout, fulfilment, and payout/KYC requirements.

## FAQ markup

- Visible Q&A rendered via `AnswerSection` / `PageAnswers`
- Matching `FAQPage` JSON-LD emitted only when answers are on-page
- No doorway FAQ pages or keyword-stuffed duplicates

## Deferred (slice 2+)

- Returns/refund answer pages tied to TTW-041 publication
- Support deflection analytics (TTW-077)
- Editorial CMS workflow

## References

- `apps/web/lib/content/answers/` — governed answer registry
- `docs/discovery/ttw-070-organic-discovery-brief.md` — question priorities
