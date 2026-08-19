# TTW-053 — Complete browser regression and staging UAT

**Epic:** 5 — Contracts, observability and release proof  
**Status:** Not started  
**Risk:** High  
**Blocked by:** TTW-004, TTW-020, TTW-021, TTW-030, TTW-031, TTW-032, TTW-033, TTW-034, TTW-040, TTW-041, TTW-042, TTW-043, TTW-050, TTW-051  
**Blocks:** TTW-054

## Background

TTW-004 establishes Playwright infrastructure and smoke coverage, but release proof still requires the full feature inventory, browser/device matrix, accessibility checks, stable visual baselines and a controlled staging acceptance run. Today no browser suite proves that `web`, `app`, `admin` and the API compose into the PRD actor journeys, and no PRD-to-test manifest records what is covered, deliberately manual or blocked.

## Proposal

Complete the strategy in `docs/16-playwright-regression-strategy.md` as a release-facing acceptance layer. Build a traceable manifest from PRD outcomes and approved business policies to named Playwright tests; fill all remaining anonymous, customer, organiser and admin journeys; add Firefox, WebKit and mobile projects; add automated accessibility scans and a deliberately small reviewed visual baseline. Execute the same production builds against staging using namespaced release-candidate data, read-only checks plus one controlled transaction lifecycle, with cleanup and operator sign-off.

## Invariants

- Tests assert user-visible outcomes and durable business state, not framework internals or arbitrary delays.
- Each worker/test owns mutable identities and records; authentication state and provider credentials are never committed or shared across roles.
- Browser tests use real first-party APIs and production builds; only external providers are simulated locally, while staging uses approved sandbox/controlled integrations.
- Visual snapshots exclude unstable data and change only through explicit design review.
- Accessibility exceptions have an owner, rationale, expiry and follow-up ticket; critical/serious violations cannot be silently baselined.
- Staging UAT cannot alter non-test customer, campaign, inventory, payment or payout data, and controlled financial activity is reconciled and cleaned up.

## Implementation plan

1. Convert the feature inventory into a PRD/policy-to-test manifest with test ID, role, app, browser tier, data needs, expected state and automation/manual status.
2. Complete critical anonymous/customer/organiser/admin and cross-application journey specs, including negative authorization, validation, empty/error, retry and persisted-state assertions. Require each owning feature ticket to close its manifest rows.
3. Add stable desktop Firefox/WebKit and mobile Chromium/WebKit projects; document intentional capability differences and prohibit unconditional browser skips.
4. Integrate automated accessibility scanning at representative pages and interactive states, keyboard/focus journeys, reduced-motion checks and a governed exception file.
5. Create reviewed desktop/mobile visual baselines for the limited stable surfaces named in the strategy; mask approved dynamic regions and test theme/responsive boundaries where required.
6. Add nightly sharding, retry/flakiness reporting, trace/video/screenshot retention and quarantine rules. Repair or ticket every flaky test; quarantined release-critical tests still block release.
7. Define and execute staging UAT against immutable production-build identifiers: environment health, all-role smoke, controlled order/payment/refund or cancellation, campaign/order/admin visibility, telemetry correlation and test-data cleanup/reconciliation.
8. Obtain product/design/operations sign-off on the manifest, visual diffs, accessibility report, known limitations and staging transaction evidence.

## Test and observability plan

- Unit/component: Keep calculation/state-machine checks in their owning packages; add tests for manifest validation, fixture/data factories and accessibility/visual masking helpers.
- Integration/e2e: Run Chromium on every PR; run Firefox, WebKit, mobile, accessibility and visual suites nightly and for release candidates; execute controlled staging UAT from production builds.
- Failure, retry, and concurrency: Cover provider delay/decline/duplicate delivery, expired sessions, role denial, API/queue error states and concurrent inventory/payment paths where visible; require three consecutive clean full-matrix runs and disclose every retry.
- Logs, metrics, traces, and alerts: Retain HTML report and traces on first retry, screenshots/video on failure, flake history and staging request/trace/business references; verify TTW-051 dashboards/alerts observe the controlled journey without sensitive data.

## References

- `docs/16-playwright-regression-strategy.md:7-98` — required roles, applications, feature inventory, visual policy and CI execution tiers.
- `docs/16-playwright-regression-strategy.md:100-118` — reliability policy and adoption sequence.
- `docs/99-prd-traceability.md` — PRD actor/outcome inventory to map to tests.
- `apps/web/app/`, `apps/app/app/`, `apps/admin/app/` — three browser surfaces under acceptance.
- `docs/tickets/ttw-004-establish-playwright-foundation.md` — foundational configuration, fixtures and smoke scope.
- `docs/17-backend-business-completeness-audit.md:80-83` — release proof requires full browser regression and UAT.

## Acceptance criteria

- [ ] The reviewed PRD/policy-to-test manifest accounts for every in-scope user outcome as automated, explicitly manual or blocked by a named ticket.
- [ ] Critical journeys pass on supported desktop Chromium, Firefox and WebKit and the approved mobile Chromium/WebKit profiles.
- [ ] Automated scans report zero unapproved critical/serious accessibility violations, and keyboard/focus/reduced-motion checks pass for core interactions.
- [ ] Reviewed visual baselines cover the strategy's stable desktop/mobile surfaces and CI fails on unapproved changes.
- [ ] Three consecutive full-matrix release-candidate runs pass without undisclosed retry, shared-state leak or quarantined critical test.
- [ ] Controlled staging UAT proves all role boundaries and one end-to-end transaction lifecycle, telemetry correlation, reconciliation and cleanup on immutable production builds.
- [ ] Product, design, operations, high-risk security and independent implementation reviews sign off with exact evidence recorded below.

## Out of scope

- Playwright infrastructure and initial smoke fixtures → TTW-004.
- Fixing behaviour discovered by UAT; create/reopen the owning domain ticket and add the reproducing test there.
- Load, soak and provider certification testing beyond user-facing acceptance; record separate tickets where required.

## Design review

Record reviewer, date, supported-browser policy, manifest coverage, fixture/isolation design, accessibility exceptions, visual surfaces, staging-data and provider plan, security/privacy risks, release thresholds and verdict before implementation.

## Implementation reviews

Record each independent review iteration, coverage gaps, flakes, accessibility/visual findings, fixes, security verdict, product/design/operations sign-off and overall verdict.

## Verification evidence

Record exact PR/nightly/release commands, immutable build IDs, report/trace locations, browser versions, manifest coverage, accessibility and visual results, three-run flake evidence, controlled transaction references, reconciliation and cleanup confirmation.

## Completion summary

Summarize automated/manual coverage, supported matrix, approved exceptions, UAT transaction, sign-offs, residual risks and follow-up defects.
