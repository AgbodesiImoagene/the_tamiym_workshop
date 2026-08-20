# TTW-073 — Publish truthful structured data and commerce signals

**Epic:** 7 — Organic discovery: SEO, AEO and GEO\
**Status:** Not started\
**Risk:** High\
**Blocked by:** TTW-071, TTW-072, TTW-024, TTW-031, TTW-040, TTW-041\
**Blocks:** TTW-078

## Background

The public site emits no structured data. Organization, navigation, fundraiser, offer, pricing, availability, shipping and return information exist across marketing and API surfaces, but some governing business policies remain incomplete. Adding markup directly from display copy could expose internal data or publish misleading prices, stock, reviews, locations or policies.

## Proposal

Create typed server-side JSON-LD builders sourced from the same approved public DTOs and policy configuration as visible content. Implement `Organization`/applicable business identity, `WebSite`, `BreadcrumbList` and eligible editorial types first. Add `Product`/variant, `Offer`, shipping and return-policy markup only when authoritative contracts are complete and the page visibly contains matching facts. Validate against Schema.org and search-engine feature requirements, while treating rich-result display as discretionary.

## Invariants

- JSON-LD matches visible content and authoritative public state at render time.
- No fabricated review/rating, price, availability, address, credential, social profile or policy is emitted.
- Internal IDs, SKUs where private, stock counts, margins, moderation data and customer-private fields never enter markup.
- Invalid or incomplete commerce data omits the affected markup instead of guessing.

## Implementation plan

1. Approve entity identifiers, public organization facts, logo/contact/social ownership and supported schema types.
2. Add typed builders, serialization/XSS protections and stable `@id` relationships for site/entity/breadcrumb content.
3. Map eligible product/variant/offer/policy public DTOs after owning business tickets are complete.
4. Render JSON-LD server-side with visible-content parity and lifecycle/cache invalidation.
5. Add schema and rich-result validation fixtures plus production monitoring for template drift.

## Test and observability plan

- Unit/component: Type/property validation, escaping, required-field omission and public-field allowlists.
- Integration/e2e: Render and validate organization, breadcrumb, content and eligible commerce pages against real DTOs.
- Failure, retry, and concurrency: Price/stock/policy changes during render, missing image, unsafe text and stale cache.
- Logs, metrics, traces, and alerts: Structured-data validation errors by template/version without customer payloads.

## References

- `apps/web/app/layout.tsx:5-13` — no site/entity structured data.
- `apps/web/app/fundraiser/[slug]/page.tsx:12-24` — dynamic public data requires safe mapping.
- `docs/tickets/ttw-024-enforce-pricing-discount-and-tax-policy.md` — authoritative pricing dependency.
- `docs/tickets/ttw-031-render-real-fundraiser-offers.md` — public offer DTO dependency.
- [Google structured-data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Google product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)

## Acceptance criteria

- [ ] Approved public templates emit valid typed JSON-LD with stable entity relationships and safe serialization.
- [ ] Visible content and authoritative DTOs exactly support emitted names, images, prices, availability and policies.
- [ ] Negative fixtures prove private/internal fields and unsupported ratings/claims cannot be serialized.
- [ ] Schema.org validation and applicable rich-result tests pass; unsupported eligibility is documented without promises.
- [ ] Data changes invalidate markup consistently with visible content and canonical/index lifecycle.

## Out of scope

- Inventing reviews, ratings or business credentials.
- Product markup before owning pricing/offer/policy tickets pass.

## Design review

Record reviewer, date, entity model, source fields, public allowlists, eligibility rules, escaping, cache lifecycle and verdict.

## Implementation reviews

Require independent business-data and security/privacy reviews; repeat validation and leakage tests until PASS.

## Verification evidence

Record schema fixtures, validator outputs, rendered parity checks, source-field mapping and negative leakage tests.

## Completion summary

Summarize emitted types, source contracts, eligibility, validation, omitted unsupported data and monitoring.
