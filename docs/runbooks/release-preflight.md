# Runbook — Release preflight (credential-free)

**Owner:** `platform-ops`  
**Ticket:** TTW-054  
**When:** Before assembling or promoting any release candidate

## Purpose

Verify the repository and candidate revision satisfy minimum release readiness without touching production credentials. Complements CI gates; does not replace human authorization.

## Automated check

```bash
pnpm release:preflight
```

## Manual checks

1. Confirm `git rev-parse HEAD` matches the manifest `commitSha`.
2. Confirm working tree is clean or document intentional deltas in the evidence pack.
3. Confirm Node major matches `.nvmrc` (`^24`).
4. Review open incidents and reconciliation alerts (TTW-051 dashboards).

## Abort criteria

- Preflight script exits non-zero
- Placeholder secrets would be used in non-test environment
- Migration directory missing or empty
- Required artefact files missing (OpenAPI, observability manifests, Playwright manifest)

## Recovery

Fix the failing check on a new commit; **do not** patch production in place to satisfy preflight.

## Related

- `infra/release/scripts/preflight-release.mjs`
- `docs/release/controlled-release-checklist.md`
