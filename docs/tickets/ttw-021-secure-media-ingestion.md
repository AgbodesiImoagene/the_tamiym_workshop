# TTW-021 — Secure untrusted media ingestion

**Epic:** 2 — Security and trust boundaries
**Status:** Complete
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

## Implementation plan

1. Replace always-CLEAN stub with pluggable `VirusScanner` (ClamAV INSTREAM production adapter + deterministic test adapter); fail closed when production scanner is missing/unreachable.
2. Add `SafeRemoteMediaFetcher` (DNS resolve + IP pin, private-range deny, manual redirects, byte/time/MIME limits).
3. Re-identify bytes with bounded `sharp` before derivatives; ignore client Content-Type as authority.
4. Wire processor: load → scan(buffer) → identify → moderate → derivatives → READY; non-CLEAN → FAILED.
5. Add metrics for scan outcomes and denied fetches; extend env validation for production ClamAV.
6. Security regression suite (SSRF matrix + scanner outcomes).

## Test and observability plan

- Unit/component: scanner adapters; IP allow/deny; redirect hops; sharp reject wrong type.
- Integration/e2e: processor fixtures clean/infected/unavailable; safe fetcher mocked.
- Failure, retry, and concurrency: scanner timeout → FAILED; Bull retries preserve fail-closed.
- Logs, metrics, traces, and alerts: `media_virus_scan_total`, `media_fetch_denied_total`.

## References

- `apps/api/src/media/virus-scan.service.ts`
- `apps/api/src/media/media.processor.ts`
- `apps/api/src/media/safe-remote-fetch.ts`
- `apps/api/src/media/media.service.ts` — import URL normalization
- `.cursor/rules/media-security.mdc`

## Acceptance criteria

- [x] Production configuration fails closed when scanning is unavailable.
- [x] Every remote hop and resolved address is validated by one reviewed fetch component.
- [x] Quarantine, reprocess and moderation behaviour is documented and visible to operators/users.
- [x] Security regression suite covers bypass classes and resource limits.
- [x] High-risk security and independent implementation review pass.

## Out of scope

- Dependency-wide advisory remediation → TTW-022.
- New customer upload/import product flows.

## Design review

**Reviewer:** implementing agent (charter self-check; independent implementation + security reviews after code)
**Date:** 2026-08-20
**Evidence cited:** `virus-scan.service.ts` stub; `fetchAndStoreOriginal` unrestricted `fetch`; `normalizeSourceUrl` hostname-only; media-security rule; Prisma `FAILED` + `VirusScanStatus` (no QUARANTINE enum).

| Check                | Result                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Blast radius         | Media processor/service/scan only; product/design-asset callers unchanged                         |
| Callers              | `MediaProcessor`, `MediaService.createAssetFromUrl/Upload`; products + design-assets enqueue only |
| Duplication          | Single safe fetcher + single scanner orchestrator                                                 |
| Interfaces           | `VirusScanner.scan(buffer)`; `SafeRemoteMediaFetcher.fetch(url)`                                  |
| Invariants           | No READY without CLEAN scan; SSRF deny private/reserved; sharp re-ID                              |
| Edge / failure       | Scanner unavailable → FAILED; redirect/DNS rebind denied; oversize abort                          |
| Concurrency          | Existing Bull idempotent READY skip retained                                                      |
| Migration / rollback | Env `VIRUS_SCANNER` / ClamAV host; no schema migration                                            |
| Observability        | Scan + fetch-deny counters                                                                        |
| Test plan            | Unit SSRF/scan matrix + processor specs                                                           |
| Verdict              | **PASS** — proceed                                                                                |

## Implementation notes

- Pluggable `VirusScanner` (`VIRUS_SCANNER` token): ClamAV TCP INSTREAM in production; `DeterministicScanner` for test/dev (EICAR / `VIRUS_SCAN_FIXTURE` / magic marker). Never an always-CLEAN stub.
- `VirusScanService.scanBuffer(buffer)` fail-closes to `FAILED` on timeout/error; metrics via `recordMediaVirusScan`.
- `SafeRemoteMediaFetcher` pins DNS to public IPs, disables auto-redirects, revalidates hops, enforces byte/time limits; denials via `recordMediaFetchDenied`.
- Processor path: load → `scanBuffer(buffer)` → `identifyImageBuffer` (sharp, bounded) → moderate → derivatives → READY. Non-CLEAN → `MediaAssetStatus.FAILED` + `scanStatus` + operator-visible `errorMessage`. Sharp runs only after CLEAN.
- Production `validateEnv` requires `CLAMAV_HOST` and forbids `VIRUS_SCANNER=deterministic|unavailable`.
- Admin list/detail exposes `scanStatus` + `errorMessage` for operators.

### Operator behaviour (quarantine / reprocess)

- `INFECTED` or `FAILED` scan → asset stays `FAILED` (not READY); `errorMessage` distinguishes malware vs scanner failure.
- Admin list/detail already surfaces status / moderation; `errorMessage` and `scanStatus` are on the asset row for operators.
- Reprocess: existing Bull queue retries (3 attempts, exponential backoff) on thrown processor errors; for terminal scan failures (no throw), re-enqueue via the same `media` queue `process` job after fixing scanner/config (no new admin reprocess API in this ticket).

## Implementation reviews

### Security review

**Verdict:** PASS (re-review after quarantine-order fix)
**Date:** 2026-08-20
**Notes:** Initial review CHANGES_REQUIRED (sharp before scan). Fixed to scan → identify → derivatives. SSRF fetcher, fail-closed scanning, and production ClamAV gates confirmed.

### Independent implementation review

**Verdict:** PASS (including re-review after scan-order fix)
**Date:** 2026-08-20
**Cited tests:** `marks asset as FAILED when virus scan is INFECTED…`, `SafeRemoteMediaFetcher` oversize/redirect/DNS cases, `ClamAvTcpScanner` OK/FOUND/error, `createVirusScanner` production gates, `VirusScanService` timeout/unavailable.

## Verification evidence

```
pnpm --filter api test:coverage
# Test Suites: 78 passed; Tests: 725 passed
# statements 57.62% / branches 50.23% / functions 56.52% / lines 58.07%

pnpm coverage:ratchet  # PASS vs apps/api/coverage-ratchet.json
pnpm coverage:diff     # 280/324 (86.42%) >= 80% floor vs origin/main

pnpm --filter api exec jest --forceExit --runInBand src/media src/config/env-validation.spec.ts src/observability/observability.service.spec.ts
# Test Suites: 10 passed; Tests: 88 passed

pnpm --filter api exec tsc --noEmit -p tsconfig.build.json  # PASS (after prisma generate)
pnpm --filter api exec eslint src/media src/config/env-validation.ts  # PASS
```

## Completion summary

Fail-closed ClamAV scanning, SSRF-safe remote fetch, sharp re-identify after CLEAN, production env gates, metrics, and dual PASS reviews (security + implementation). Live ClamAV daemon wiring remains an ops deployment concern; unit adapters and fail-closed paths are covered.
