# TTW-053 — Browser UAT interim policy (slice 1)

**Version:** `playwright-uat/v2-comprehensive-2026-08-22`
**Ticket:** TTW-053  
**Status:** Engineering interim — slice 2 comprehensive UAT landed; product/design/operations formal sign-off deferred

This policy governs browser acceptance scope, execution tiers, accessibility exceptions and release thresholds until full TTW-053 acceptance criteria are met. The PRD-to-test manifest at `docs/playwright/prd-test-manifest.json` is the traceability source of truth.

## Supported browser matrix (v1 interim)

| Tier            | Browsers / profiles                                  | When                                                       | Where it runs                                                                                |
| --------------- | ---------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Smoke           | Desktop Chromium                                     | Every push to `main` or `develop`, and any PR to them      | CI: `ci.yml`, job `playwright-smoke`                                                         |
| Comprehensive   | Desktop Chromium × viewport matrix                   | Every push to `main`, nightly (cron 02:00 UTC), manually   | CI: `playwright-comprehensive.yml`                                                           |
| Full matrix     | Chromium, Firefox, WebKit (desktop web)              | Before a release, by hand; nightly once a CI run proves it | Workflow `playwright-matrix.yml` added (TTW-176), Implemented-unverified: no CI run seen yet |
| Mobile critical | Mobile Chromium (Pixel 5), mobile WebKit (iPhone 13) | Before a release, by hand                                  | Part of `test:e2e:matrix`, same workflow, Implemented-unverified                             |
| Accessibility   | Desktop Chromium + axe-core                          | With comprehensive                                         | CI: `playwright-comprehensive.yml` (`chromium-a11y` project)                                 |
| Visual          | Desktop Chromium + mobile Chromium (home)            | Before a release, by hand                                  | Part of `test:e2e:matrix`; no baselines committed yet (TTW-176)                              |
| Staging UAT     | Production builds on ephemeral validation            | Release candidate only                                     | Not started: slice 2 on the TTW-068 temporary environment                                    |

**Intentional capability differences:** Mobile WebKit (Safari) is required before release; the `mobile-webkit-web` project (iPhone 13 profile, public web specs) covers it as part of `test:e2e:matrix`, not yet seen running in CI (TTW-176). Admin MFA TOTP flows run on Chromium smoke only until cross-browser MFA fixtures are proven stable.

## Execution tiers

These tiers match the execution tiers in `docs/16-playwright-regression-strategy.md` (TTW-170). The project opens no pull requests: a ticket branch is merged locally into `main` and `main` is pushed, which starts CI.

1. **Smoke (`pnpm test:e2e:smoke`)** — Chromium, all three apps, health/auth/navigation, and the cross-surface journeys in `tests/e2e/journeys/`. Target under 10 minutes on CI. Runs on every push to `main`.
2. **Comprehensive (`pnpm test:e2e:comprehensive`)** — Every `@comprehensive` spec in the Chromium web, app, admin and accessibility projects, with the viewport matrix (1440 / 834 / 393) where a spec uses it; exercises navigation, forms, controls, and representative axe scans. It does not select the journeys project. Runs via `.github/workflows/playwright-comprehensive.yml` on every push to `main`, nightly, and on manual dispatch. It is not a merge blocker: it starts after the push, so a failure means `main` is already broken and is fixed straight away. A newer push to `main` cancels the run still in progress for the older commit (shown as "cancelled", neither pass nor failure); the newer run covers both commits, so after two quick pushes the first has no result of its own. A push can also cancel the nightly run or a manual run on `main`; a manual run on another branch is not affected.
3. **Matrix (`pnpm test:e2e:matrix`)** — Adds Firefox, WebKit, mobile Chromium, mobile WebKit, accessibility and visual projects. `.github/workflows/playwright-matrix.yml` (TTW-176) is written to run it nightly (cron 03:00 UTC) and on manual dispatch, failing on any flaky test; a manual dispatch with `update_snapshots` regenerates the visual baselines on Linux as an artefact for review. Status: Implemented-unverified, no CI run seen yet, so it is still run by hand before a release.
4. **Staging UAT (slice 2, not started)** — Immutable production-build identifiers on TTW-068 ephemeral environment; one controlled transaction lifecycle with reconciliation and cleanup.

## Manifest coverage rules

- Every in-scope PRD outcome row in the manifest must be `automated`, `manual`, or `blocked` with a named ticket.
- `automated` rows must reference at least one existing spec file under `tests/e2e/`.
- `blocked` rows must cite the owning domain ticket; they do not silently waive coverage.
- New UI-affecting tickets must update the manifest in the same change.

## Accessibility policy

- Automated scans use `@axe-core/playwright` with WCAG 2.0/2.1 A/AA tags.
- **Critical** and **serious** violations fail CI unless listed in `tests/e2e/accessibility/exceptions.json` with owner, rationale, expiry and follow-up ticket.
- Keyboard/focus and reduced-motion checks for core interactions remain manual UAT until slice 2 representative-page coverage ships.

## Visual regression policy

- Baselines are limited to stable marketing shells in slice 1 (public web home desktop + mobile).
- Dynamic regions (dates, IDs, user images, animated loaders) must be masked or excluded.
- Snapshot changes require explicit design review; never bulk-update to green CI.
- Visual tests run outside PR smoke to protect the 10-minute gate.

## Flake and quarantine policy

- Retries on CI: 1 (Playwright default). A test that passes only on retry is a flake.
- Quarantined release-critical tests still block release; quarantine requires owner + ticket + expiry.
- Three consecutive clean full-matrix runs are required before release (slice 2 evidence).

## Staging / temporary-environment UAT (deferred slice 2)

Controlled UAT on ephemeral validation infrastructure must prove:

- All-role smoke on production builds
- One end-to-end transaction lifecycle (order → payment → fulfilment or refund path)
- Telemetry correlation via TTW-051 dashboards
- Test-data cleanup and reconciliation
- Operator sign-off from product, design and operations

## Owners

| Area                     | Owner               |
| ------------------------ | ------------------- |
| Manifest and CI gates    | `platform-qa`       |
| Accessibility exceptions | `platform-frontend` |
| Visual baselines         | `product-design`    |
| Staging UAT execution    | `platform-ops`      |

## References

- `docs/16-playwright-regression-strategy.md`
- `docs/playwright/prd-test-manifest.json`
- `tests/e2e/README.md`
- `docs/tickets/ttw-053-complete-release-browser-uat.md`
