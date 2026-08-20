# TTW-026 — Secure the design-share lifecycle

**Epic:** 2 — Security and trust boundaries\
**Status:** In progress\
**Risk:** High\
**Blocked by:** TTW-003, TTW-004, TTW-021, TTW-025\
**Blocks:** TTW-053, TTW-054

## Background

An owner can generate one 12-character share token for a design, and the anonymous endpoint returns the design's structured content and moderation state. The schema can store an expiry, and public reads check it, but generation always sets expiry to null. Regeneration is the only implicit revocation mechanism; there is no revoke endpoint, link inventory, access evidence, approved moderation-state policy or user-facing expired/revoked state. The raw bearer token is stored in PostgreSQL, and the current URL is derived from the API request host rather than a validated public application origin.

## Proposal

Replace the single raw field with explicit `DesignShareLink` records containing a stable id, hashed high-entropy bearer token, owner/design, created/expiry/revoked timestamps, policy version and coarse access evidence. Owners can create, list and revoke links and choose only an approved bounded lifetime; regeneration does not reactivate an old token. Return the plaintext token once, build the URL from an allowlisted configured public origin, and expose one minimal, versioned read-only DTO.

Define which moderation states may be shared and what happens when a design is edited, re-moderated, deleted, transferred into a campaign or subject to privacy closure. Unknown, malformed, expired, revoked, disallowed and deleted links return the same non-enumerating public response. Apply public rate limits, cache/referrer/search-index controls and redacted abuse telemetry without logging tokens or design content.

## Invariants

- A share token has sufficient entropy, is stored only as a one-way digest and is never returned after creation or written to logs/analytics.
- Revocation, expiry, design deletion/privacy closure or a disallowed moderation state denies all subsequent reads, including from caches.
- Only the owner of a design can create/list/revoke its links; public reads expose only the approved DTO and no owner/internal moderation/object-storage metadata.
- Every link has a bounded approved lifetime; clock-boundary behavior is deterministic and old tokens never revive after regeneration or restore.
- Public failures do not reveal whether a design, link or owner exists.
- A shared design is read-only; the share capability cannot authorize mutation, duplication into another account or access to underlying private assets.

## Implementation plan

1. Record product/privacy/security approval for allowed content/moderation states, maximum/default lifetimes, edit/review invalidation, public fields, abuse response and customer copy.
2. Add the share-link model, digest/version fields, expiry/revocation/access indexes and migration. Revoke or migrate existing raw tokens with an explicit owner communication and rollback plan; do not retain plaintext fallback.
3. Implement cryptographically strong token creation, constant-time digest comparison where applicable, configured public-origin URL construction and owner-scoped create/list/revoke APIs with idempotent revocation.
4. Replace public lookup with a minimal explicit select plus policy checks. Apply uniform not-found responses, token-format rejection, rate limiting, cache-control, referrer policy and `noindex` behavior.
5. Connect design update/re-moderation/deletion, TTW-025 closure and campaign policy to the approved invalidate-or-hide behavior. Purge relevant CDN/application cache on revocation/state change.
6. Add accessible workshop share management and public expired/revoked/unavailable UI without leaking internal status. Prevent full token capture in client analytics/error reports.
7. Add abuse/runbook telemetry and alerts using link ids or safe hashes only. Update Swagger/shared contracts, workshop/privacy docs, environment validation and PRD-to-test traceability.

## Test and observability plan

- Unit/component: entropy/digest contract, origin allowlist, expiry boundaries, moderation policy, public DTO allowlist, uniform error mapping and accessible owner/public states.
- Integration/e2e: create/list/read/revoke, multiple links, ownership/RBAC, raw-token absence, edit/moderation/deletion invalidation, rate limits, cache headers and migration of existing tokens.
- Failure, retry, and concurrency: concurrent create/revoke/read, response loss after creation/revocation, expiry clock edge, cache race, privacy closure, design deletion and restored stale database/cache.
- Playwright: owner creates and revokes a link; anonymous reader sees only allowed content; expired/revoked/wrong-user/disallowed-state cases fail uniformly on desktop/mobile.
- Logs, metrics, traces, and alerts: link creates/revokes, allowed/denied reads by safe reason, rate-limit/abuse signals and cache-purge failure; tests assert tokens/content do not appear in server/browser telemetry.

## References

- `docs/17-backend-business-completeness-audit.md:31,73` — share expiry/revocation and moderation consequences need product decisions.
- `apps/api/prisma/schema.prisma:1100-1103` — one raw token and optional expiry are stored on the design.
- `apps/api/src/designs/designs.service.ts:562-580` — generation creates a 12-character token and always removes expiry.
- `apps/api/src/designs/designs.service.ts:583-617` — anonymous lookup returns structured design content and only checks optional expiry.
- `apps/api/src/designs/designs.controller.ts:193-223` — owner API creates a URL from the incoming request host and provides no list/revoke operations.
- `apps/api/src/designs/public-designs.controller.ts:15-49` — share lookup is an unauthenticated public endpoint.

## Acceptance criteria

- [ ] Product/privacy/security approve link lifetime, moderation/edit invalidation, public DTO, abuse and migration decisions.
- [ ] New links use reviewed high-entropy bearer tokens stored only as digests, returned once and built from a validated configured public origin.
- [ ] Owners can create, list and idempotently revoke links; old, expired and revoked tokens cannot revive or survive relevant cache/restore scenarios.
- [ ] Public reads expose only the approved allowlist and uniformly deny every invalid/disallowed/deleted/closed state without enumeration.
- [ ] Existing plaintext tokens are revoked or safely migrated under an approved, tested rollback and communication plan.
- [ ] Rate limits, headers, no-index behavior, cache purge and token-redaction controls are verified at the deployed boundary.
- [ ] Integration and Playwright cover ownership, lifecycle, concurrency, browser telemetry and desktop/mobile public states.
- [ ] Swagger/shared contracts, migration/rollback, environment/workshop/privacy docs, observability and PRD traceability are updated.
- [ ] High-risk security design and independent implementation reviews pass with exact evidence.

## Out of scope

- Collaborative editing, comments and recipient accounts; links remain anonymous read-only capabilities.
- General media-ingestion/object-access hardening → TTW-021.
- Account-wide privacy request execution → TTW-025.
- Public fundraiser campaign sharing → TTW-031 and TTW-032.

## Design review

### Slice 1 — interim digested share links (APPROVED for engineering interim)

**Reviewer:** implementing agent — 2026-08-20\
**Verdict:** APPROVED for interim v1 engineering policy pending product/privacy sign-off.

**Interim policy (`design-share-policy/v1-interim-2026-08-20`):**

| Decision                             | Choice                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Entropy                              | 32-byte `base64url` bearer; stored only as SHA-256 hex                                                                        |
| Lifetimes                            | Allowed `ttlDays` ∈ {1, 7, 30}; default 7                                                                                     |
| Shareable moderation                 | `APPROVED` only; other states → uniform public 404                                                                            |
| Public DTO                           | `id`, `name`, `designData`, `thumbnailUrl`, `createdAt`, `product`, `views` — no bearer, no owner, no moderation notes/status |
| URL origin                           | `DESIGN_SHARE_PUBLIC_ORIGIN` (required in production); never request Host                                                     |
| Legacy plaintext `Design.shareToken` | Cleared in migration; new links use `DesignShareLink` only                                                                    |
| Privacy closure                      | TTW-025 erasure revokes all active `DesignShareLink` rows for the owner                                                       |
| Public controls                      | Throttle 60/min; `Cache-Control: private, no-store`; `X-Robots-Tag: noindex`                                                  |

**Deferred:** Playwright workshop UI, CDN purge, edit/re-moderation auto-invalidate worker, multi-link analytics dashboards.

## Implementation reviews

Pending slice 1 dual review.

## Verification evidence

Pending slice 1 gates.

## Completion summary

TTW-025 merged (`06d5a22`). TTW-026 slice 1 in progress on `codex/ttw-026-secure-design-shares`.
