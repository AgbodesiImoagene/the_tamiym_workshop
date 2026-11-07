# TTW-176 — Run the Playwright browser matrix in CI

**Epic:** 0 — Trustworthy delivery system  
**Status:** Not started  
**Risk:** Standard  
**Blocked by:** Owner answer on mobile Safari (see "Decision")  
**Blocks:** None

## Background

Found while doing TTW-170. The written strategy requires a browser matrix before any release (`docs/16-playwright-regression-strategy.md`, Execution tiers, "Browser matrix"), but no workflow runs it. TTW-170 made both documents say so plainly; this ticket is about actually running it.

What the matrix is: `pnpm test:e2e:matrix` (`package.json:55`) runs the suite in Firefox, WebKit (the Safari engine), a mobile Chromium profile (Pixel 5), the accessibility project and the visual projects (`playwright.config.ts:119-152`). CI today only uses desktop Chromium: smoke in `ci.yml` and `@comprehensive` in `playwright-comprehensive.yml`. A page that breaks only in Safari or Firefox, or only on a phone-sized screen with touch, is not caught by any automated check.

Why it is more than adding a line to a workflow:

- **No visual baselines exist.** `tests/e2e/visual/` holds two specs (`web-home.visual.spec.ts`, `web-home-mobile.visual.spec.ts`) and no `*-snapshots` folder. A first run fails because there is nothing to compare against. Baselines must be generated on Linux, as in CI, because fonts render differently per OS, and the strategy says snapshot changes need an intentional design review.
- **The matrix has never run in CI.** Firefox, WebKit and mobile may reveal real failures or flaky tests at the first run. Those need fixing or quarantining with an owner (strategy, "Retries expose flakes").
- **Extra browsers cost time.** `playwright install --with-deps` for Firefox and WebKit adds download and install time on each run.
- **The PRD-to-test manifest promises matrix coverage.** 25 rows of `docs/playwright/prd-test-manifest.json` list `"matrix"` in `browser_tiers`. Until the matrix runs, that coverage is claimed but never checked.
- **Mobile Safari is required but has no project.** The interim policy requires mobile WebKit before release (`docs/playwright/ttw-053-interim-policy.md`, "Intentional capability differences"), and `playwright.config.ts` has no mobile WebKit project.

## Decision

**Option A (nightly) chosen by the project owner on 2026-11-07.** The question was when the matrix should run. Nobody waits on a PR in this project, so the cost is CI minutes and how fast a failure shows up.

- **A. Nightly (chosen).** A scheduled workflow, like `playwright-comprehensive.yml`, plus manual dispatch. It matches the strategy ("nightly") and finds a browser-specific break within a day, without slowing each push.
- **B. Before a release only.** Manual dispatch, run as part of the release checklist. Fewest minutes, but a break can sit unnoticed for weeks.
- **C. On every push to `main`.** Fastest feedback, most minutes, and the longest run per push.

Still open: should a mobile WebKit project (for example the `iPhone 13` device profile) be added in this ticket, or left for later? Do not implement before the owner answers.

## Proposal

To be confirmed at design review once the decision is made:

1. A workflow (new, or a job in an existing one) that installs Chromium, Firefox and WebKit and runs `pnpm test:e2e:matrix` nightly and on manual dispatch, with a step timeout, a concurrency group and the report uploaded on failure, as in TTW-170.
2. Visual baselines generated on Linux (for example with the official Playwright Docker image, or a one-off `--update-snapshots` CI run whose artefact is reviewed), reviewed on purpose, and committed.
3. A first full run; every failure is either fixed in its own ticket or quarantined with an owner and a ticket.
4. The strategy, the interim policy and the manifest updated to say what runs and when.

## Invariants

- Smoke and comprehensive gates keep running unchanged.
- No snapshot is updated in bulk to make a run green.
- No document describes the matrix as running before a CI run proves it.

## Implementation plan

1. Owner decision recorded; design review.
2. Generate and review the visual baselines.
3. Add the workflow and run it by manual dispatch on a throwaway branch until it is green or every failure is ticketed.
4. Update the documents.

## Test and observability plan

- Unit/component: none.
- Integration/e2e: real CI runs of the matrix, including one that fails on a deliberately broken spec.
- Failure, retry, and concurrency: a second trigger while a run is in progress must not leave two competing runs; retries must not hide a flake.
- Logs, metrics, traces, and alerts: HTML report and traces uploaded on failure.

## References

- `package.json:55`: the `test:e2e:matrix` script.
- `playwright.config.ts:119-152`: the Firefox, WebKit, mobile, accessibility and visual projects.
- `tests/e2e/visual/`: the visual specs, no baselines.
- `docs/16-playwright-regression-strategy.md`: Execution tiers, "Accessibility and visual regression".
- `docs/playwright/ttw-053-interim-policy.md`: supported browser matrix.
- `docs/playwright/prd-test-manifest.json`: rows with `"matrix"` in `browser_tiers`.
- `docs/tickets/ttw-170-align-playwright-gates-with-strategy.md`: where the gap was documented.

## Acceptance criteria

- [ ] The owner's decisions are recorded. → schedule: nightly (2026-11-07); mobile Safari: open.
- [ ] The matrix is seen running in CI on its nightly schedule and by manual dispatch, failing on a broken spec and passing on a good one.
- [ ] Visual baselines are committed after an intentional review.
- [ ] Every failure from the first run is fixed or quarantined with an owner and a ticket.
- [ ] The strategy, the interim policy and the manifest match what runs.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Fixing browser-specific bugs found by the first run: each gets its own ticket.
- Staging release UAT on the TTW-068 temporary environment (TTW-053 residual).

## Design review

Required before implementation.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not started.
