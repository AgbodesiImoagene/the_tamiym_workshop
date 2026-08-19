# TTW-021 — Secure untrusted media ingestion

**Epic:** 2 — Security and trust boundaries  
**Status:** Not started  
**Risk:** High  
**Blocked by:** TTW-003  
**Blocks:** TTW-030, TTW-031, TTW-053

## Background

The virus scanner always returns CLEAN. Remote ingestion validates an initial URL textually, but the processor fetch follows redirects and runtime DNS without proving every hop resolves only to allowed public addresses. User content can therefore bypass the intended quarantine and network boundary.

## Proposal

Integrate a real scanner with fail-closed quarantine, timeouts, explicit unavailable/error states and reprocessing. Implement a safe fetcher that resolves and pins allowed public IPs, rejects private/reserved ranges for IPv4/IPv6, disables automatic redirects and validates every hop, limits bytes/time/content type, and re-identifies decoded images before publishing derivatives.

## Invariants

- No unscanned/failed/unknown asset becomes READY or publicly usable.
- Remote imports cannot access loopback, link-local, private, metadata or internal destinations through literals, DNS rebinding or redirects.
- Limits apply to compressed transfer and decoded image resource use.

## Test and observability plan

- Integration fixtures for clean/infected/unavailable scanner outcomes.
- SSRF matrix: IPv4/IPv6 forms, DNS change, redirect chains, missing/lying headers and oversized/decompression cases.
- Metrics/alerts for scan failures, quarantined assets and denied destinations.

## References

- `apps/api/src/media/virus-scan.service.ts:8-25`.
- `apps/api/src/media/media.processor.ts:322-365`.
- `apps/api/src/media/media.service.ts` — import URL normalization.

## Acceptance criteria

- [ ] Production configuration fails closed when scanning is unavailable.
- [ ] Every remote hop and resolved address is validated by one reviewed fetch component.
- [ ] Quarantine, reprocess and moderation behaviour is documented and visible to operators/users.
- [ ] Security regression suite covers bypass classes and resource limits.
- [ ] High-risk security and independent implementation review pass.

## Out of scope

- Dependency-wide advisory remediation → TTW-022.
