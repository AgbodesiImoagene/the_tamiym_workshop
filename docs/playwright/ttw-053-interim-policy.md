# TTW-053 — Browser UAT interim policy (slice 1)

**Version:** `playwright-uat/v1-interim-2026-08-22`  
**Ticket:** TTW-053  
**Status:** Engineering interim — product/design/operations formal sign-off deferred

This policy governs browser acceptance scope, execution tiers, accessibility exceptions and release thresholds until full TTW-053 acceptance criteria are met. The PRD-to-test manifest at `docs/playwright/prd-test-manifest.json` is the traceability source of truth.

## Supported browser matrix (v1 interim)

| Tier            | Browsers / profiles                       | When                        | CI job                  |
| --------------- | ----------------------------------------- | --------------------------- | ----------------------- |
| PR smoke        | Desktop Chromium                          | Every PR                    | `playwright-smoke`      |
| Full matrix     | Chromium, Firefox, WebKit (desktop web)   | Nightly / release candidate | Slice 2 workflow        |
| Mobile critical | Mobile Chromium (Pixel 5 profile)         | Nightly / release candidate | Slice 2 workflow        |
| Accessibility   | Desktop Chromium + axe-core               | Nightly / release candidate | Local `test:e2e:a11y`   |
| Visual          | Desktop Chromium + mobile Chromium (home) | Nightly / release candidate | Local `test:e2e:visual` |
| Staging UAT     | Production builds on ephemeral validation | Release candidate only      | Slice 2 — TTW-068       |

**Intentional capability differences:** Mobile WebKit (Safari) is required before release but not on every PR. Admin MFA TOTP flows run on Chromium smoke only until cross-browser MFA fixtures are proven stable.

## Execution tiers

Aligned with `docs/16-playwright-regression-strategy.md`:

1. **Smoke (`pnpm test:e2e:smoke`)** — Chromium, all three apps, health/auth/navigation, critical journeys. Target under 10 minutes on CI.
2. **Matrix (`pnpm test:e2e:matrix`)** — Adds Firefox, WebKit, mobile Chromium, accessibility and visual projects.
3. **Staging UAT (slice 2)** — Immutable production-build identifiers on TTW-068 ephemeral environment; one controlled transaction lifecycle with reconciliation and cleanup.

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
