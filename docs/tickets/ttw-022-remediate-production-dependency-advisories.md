# TTW-022 — Remediate production dependency advisories

**Epic:** 2 — Security and trust boundaries  
**Status:** Not started  
**Risk:** High  
**Blocked by:** TTW-001, TTW-002  
**Blocks:** TTW-053, TTW-054

## Background

The 2026-08-18 review found 165 production advisory instances: 3 critical, 72 high, 79 moderate, and 11 low. Direct runtime roots include Next 16.1.4 on all three frontends, Fabric 5.5.2 in the workshop, and API dependencies such as `sanitize-html`, Sharp, Nodemailer, and OpenTelemetry. CI installs the frozen lockfile but does not audit it, so a known-vulnerable runtime graph can remain green or regress unnoticed.

## Proposal

Capture a reproducible production-only audit report, map every critical/high advisory to its direct root and reachable Tamiym feature, then upgrade or replace those roots in small compatible groups. Do not use broad `overrides`, `--force`, or removal of required security behaviour to make the report green. Add a blocking production audit to pull requests and a scheduled full-graph audit with an owned alert.

The release policy is zero known critical or high production advisories. Moderate/low findings may be separately ticketed only with an owner, reachability analysis, mitigation, and expiry date. The checked-in lockfile and audit-policy configuration—not a prose count—become the repeatable evidence.

## Invariants

- All three production builds, the workshop editor, API boot, mail, media processing, and telemetry continue to work after upgrades.
- A dependency exception never suppresses a critical/high production vulnerability.
- CI evaluates the frozen dependency graph that is shipped, not a separately resolved graph.
- Development-only findings are reported separately and cannot obscure production findings.

## Implementation plan

1. On the TTW-001 runtime, save `pnpm audit --prod --json` as a CI artifact and create an advisory/root/reachability/remediation table in this ticket.
2. Upgrade direct roots first; group Next/React, Fabric/workshop, media/mail, and observability changes into reviewable commits with the relevant smoke tests after each group.
3. Where no safe compatible release exists, replace the package or remove the reachable feature only after design/security review; record migration and rollback instructions.
4. Add a pull-request production audit gate and a scheduled full audit. Configure GitHub dependency update automation with grouped, reviewable updates and an owner.
5. Regenerate the lockfile only through pnpm, rerun the full quality gates, and attach before/after audit JSON and resolved-version evidence.

## Test and observability plan

- Unit/component: run all existing API and workshop suites; add focused regression tests for any changed library adapter.
- Integration/e2e: API integration boot plus Playwright smoke for `web`, `app`, and `admin`; exercise artwork editing/upload, sanitized email broadcast, media derivative generation, and telemetry startup.
- Failure, retry, and concurrency: verify provider/mail/media failure handling is unchanged; test any replacement adapter's timeout and retry paths.
- Logs, metrics, traces, and alerts: scheduled audit failure opens an owned alert; build artifacts retain audit JSON and dependency-review output without secrets.

## References

- `apps/web/package.json:17-18` — Next/React runtime roots.
- `apps/app/package.json:18-23` — Fabric and Next/React workshop runtime roots.
- `apps/admin/package.json:17-21` — admin runtime roots.
- `apps/api/package.json:28-73` — API runtime dependency roots.
- `pnpm-lock.yaml` — exact shipped transitive graph.
- `.github/workflows/ci.yml:9-57` — current CI has no dependency audit gate.

## Acceptance criteria

- [ ] A fresh frozen install reports zero critical and zero high production advisories.
- [ ] Every critical/high baseline advisory has a documented root, reachability decision, and remediation version/replacement.
- [ ] PR CI blocks new critical/high production findings; a scheduled full audit has an owner and retained report.
- [ ] Production builds, API integration tests, relevant workshop/media/mail checks, and three-app Playwright smoke pass.
- [ ] No unreviewed force upgrade, blanket suppression, or unrelated lockfile churn is present.
- [ ] Dependency policy, update automation, lockfile, evidence, and rollback notes are updated.
- [ ] High-risk security and independent implementation review pass.

## Out of scope

- Supported Node/pnpm alignment → TTW-001.
- General lint, format, and coverage ratchet → TTW-002.
- Application media-ingestion controls independent of library versions → TTW-021.

## Design review

Record reviewer, date, advisory attribution, compatibility blast radius, replacement decisions, runtime reachability, rollback plan, test matrix, and verdict before implementation.

## Implementation reviews

Record independent security and implementation findings, fixes, exact resolved versions, dimension verdicts, and overall verdict.

## Verification evidence

Record frozen-install command, before/after production audit reports, builds, tests, Playwright projects, and any separately ticketed moderate/low findings.

## Completion summary

Summarize upgraded/replaced roots, residual non-production findings, policy/automation added, compatibility deviations, operational notes, PR, and follow-ups.
