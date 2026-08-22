# TTW-053 — Complete browser regression and release-environment UAT

**Epic:** 5 — Contracts, observability and release proof  
**Status:** In progress (slice 2 — comprehensive UAT)
**Risk:** High  
**Blocked by:** TTW-004, TTW-020–TTW-027, TTW-030–TTW-036, TTW-040–TTW-043, TTW-050, TTW-051, TTW-063, TTW-066\
**Blocks:** TTW-054, TTW-068

## Background

TTW-004 establishes Playwright infrastructure and smoke coverage, but release proof still requires the full feature inventory, browser/device matrix, accessibility checks, stable visual baselines and a controlled temporary-environment acceptance run. Today no browser suite proves that `web`, `app`, `admin` and the API compose into the PRD actor journeys, and no PRD-to-test manifest records what is covered, deliberately manual or blocked.

## Proposal

Complete the strategy in `docs/16-playwright-regression-strategy.md` as a release-facing acceptance layer. Build a traceable manifest from PRD outcomes and approved business policies to named Playwright tests; fill all remaining anonymous, customer, organiser and admin journeys; add Firefox, WebKit and mobile projects; add automated accessibility scans and a deliberately small reviewed visual baseline. Execute the same production builds against an isolated temporary DigitalOcean validation environment using namespaced release-candidate data, read-only checks plus one controlled transaction lifecycle, with cleanup, teardown and operator sign-off.

## Invariants

- Tests assert user-visible outcomes and durable business state, not framework internals or arbitrary delays.
- Each worker/test owns mutable identities and records; authentication state and provider credentials are never committed or shared across roles.
- Browser tests use real first-party APIs and production builds; only external providers are simulated locally, while temporary validation uses approved sandbox/controlled integrations.
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
7. Define and execute temporary-environment UAT against immutable production-build identifiers: environment health, all-role smoke, controlled order/payment/refund or cancellation, campaign/order/admin visibility, telemetry correlation and test-data cleanup/reconciliation.
8. Obtain product/design/operations sign-off on the manifest, visual diffs, accessibility report, known limitations and temporary-environment transaction evidence.

## Test and observability plan

- Unit/component: Keep calculation/state-machine checks in their owning packages; add tests for manifest validation, fixture/data factories and accessibility/visual masking helpers.
- Integration/e2e: Run Chromium on every PR; run Firefox, WebKit, mobile, accessibility and visual suites nightly and for release candidates; execute controlled temporary-environment UAT from production builds.
- Failure, retry, and concurrency: Cover provider delay/decline/duplicate delivery, expired sessions, role denial, API/queue error states and concurrent inventory/payment paths where visible; require three consecutive clean full-matrix runs and disclose every retry.
- Logs, metrics, traces, and alerts: Retain HTML report and traces on first retry, screenshots/video on failure, flake history and temporary-environment request/trace/business references; verify TTW-051 dashboards/alerts observe the controlled journey without sensitive data.

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
- [ ] Controlled temporary-environment UAT proves all role boundaries and one end-to-end transaction lifecycle, telemetry correlation, reconciliation, cleanup and infrastructure teardown on immutable production builds.
- [ ] Product, design, operations, high-risk security and independent implementation reviews sign off with exact evidence recorded below.

## Out of scope

- Playwright infrastructure and initial smoke fixtures → TTW-004.
- Fixing behaviour discovered by UAT; create/reopen the owning domain ticket and add the reproducing test there.
- Load, soak and provider certification testing beyond user-facing acceptance; record separate tickets where required.

## Design review

**Reviewer:** AI implementation agent (slice 1)\
**Date:** 2026-08-22\
**Verdict:** APPROVED for slice 1 implementation

| Area                 | Assessment                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Blast radius         | Manifest, validator, a11y/visual scaffolds; smoke CI unchanged                               |
| Manifest coverage    | All PRD strategy inventory rows mapped as automated, manual or blocked with ticket refs      |
| Browser matrix       | Chromium smoke on PR; Firefox/WebKit/mobile/a11y/visual on matrix script; nightly in slice 2 |
| Fixture isolation    | Reuses TTW-004 per-worker auth; no shared mutable accounts                                   |
| Accessibility        | axe-core with governed exceptions file; critical/serious block unless approved               |
| Visual baselines     | Limited to stable web home desktop/mobile; excluded from PR smoke                            |
| Staging UAT          | Slice 2 — TTW-068 ephemeral environment + controlled transaction                             |
| Security / privacy   | No credentials in manifest; traces/reports remain CI artefacts                               |
| Migration / rollback | Additive; remove manifest validator from docs CI to disable gate                             |

## Design review (slice 2)

**Reviewer:** AI implementation agent (slice 2)\
**Date:** 2026-08-22\
**Verdict:** APPROVED for slice 2 comprehensive UAT implementation

| Area               | Assessment                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Blast radius       | Additive Playwright specs, fixtures, nightly workflow; PR smoke unchanged                                          |
| Viewport matrix    | Desktop 1440, tablet 834, mobile 393 via `describeViewportMatrix()`                                                |
| Surface coverage   | Web marketing/auth/fundraiser; app nav/products/orders/settings/authoring; admin sidebar/orders/moderation/catalog |
| Fixture isolation  | Reuses TTW-004 per-role storage states; seed-data constants synced with `seed-e2e-dummy-data.ts`                   |
| Interaction policy | `assertVisibleControlsEnabled` skips destructive actions; conditional paths for empty states                       |
| Accessibility      | Representative axe scans on 4 web routes × 3 viewports; governed exceptions unchanged                              |
| Deferred           | Full checkout, design workshop save/share, visual baselines, staging UAT (TTW-068), Firefox/WebKit matrix evidence |

## Implementation reviews (slice 2)

**Reviewer:** Bugbot independent reviewer\
**Date:** 2026-08-22\
**Verdict:** PASS after responsive nav fix (`615c5fb`)

| Finding                                       | Resolution                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| Customer sidebar hidden on tablet/mobile      | `navigateCustomerSidebarLink` uses `goto` when `aside nav` is not visible |
| Loose `/dashboard` URL assertion              | `pathUrlMatcher()` anchors home/admin overview paths                      |
| Mobile hamburger non-functional (product gap) | Documented; comprehensive tests use direct navigation on small viewports  |

## Implementation reviews

**Reviewer:** Independent implementation reviewer (slice 1)\
**Date:** 2026-08-22\
**Verdict:** PASS with documented deferrals

| Finding                               | Resolution                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Visual baselines not yet committed    | Expected — generated on first `test:e2e:visual` run; excluded from PR smoke |
| Nightly matrix workflow absent        | Deferred to slice 2 per interim policy                                      |
| Staging UAT not executed              | Deferred to slice 2 (TTW-068 environment)                                   |
| Keyboard/reduced-motion manual checks | Deferred to slice 2                                                         |
| Security review charter               | PASS — no secrets in manifest; axe exceptions governed                      |

## Verification evidence

### Slice 1

- `pnpm playwright:validate` — pass
- `pnpm playwright:validate:test` — 4/4 pass
- `pnpm docs:validate` — pass
- `pnpm docs:validate:test` — 11/11 pass
- `pnpm typecheck` — pass
- `pnpm lint` — pass (pre-existing warnings only)
- `git diff --check` — clean
- PR smoke (`pnpm test:e2e:smoke`) — CI evidence on merge (#60)

### Slice 2 (PR #63)

- `pnpm playwright:validate` / `playwright:validate:test` — pass (local)
- `pnpm typecheck` / `pnpm lint` — pass (local)
- PR CI run `32584895866` — all 16 checks pass including Playwright Smoke
- Comprehensive suite — 111 tests listed; nightly workflow ships on merge; first run pending post-merge
- Bugbot review — PASS after `615c5fb` responsive nav fix

## Completion summary

Summarize automated/manual coverage, supported matrix, approved exceptions, UAT transaction, sign-offs, residual risks and follow-up defects.
