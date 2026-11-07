# TTW-176 — Run the Playwright browser matrix in CI

**Epic:** 0 — Trustworthy delivery system  
**Status:** In progress (Partial: workflow and mobile WebKit project committed locally on the ticket branch, no CI run yet)  
**Risk:** Standard  
**Blocked by:** None  
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

Second question: should a mobile WebKit project be added in this ticket, or left for later? **Added in this ticket, owner decision on 2026-11-07.** A mobile WebKit project (an iPhone device profile, for example `iPhone 13`) joins `playwright.config.ts` and `test:e2e:matrix`.

## Proposal

To be confirmed at design review once the decision is made:

1. A mobile WebKit project (iPhone device profile) in `playwright.config.ts`, selected by `test:e2e:matrix`, and named in the interim policy's browser matrix.
2. A workflow (new, or a job in an existing one) that installs Chromium, Firefox and WebKit and runs `pnpm test:e2e:matrix` nightly and on manual dispatch, with a step timeout, a concurrency group and the report uploaded on failure, as in TTW-170.
3. Visual baselines generated on Linux (for example with the official Playwright Docker image, or a one-off `--update-snapshots` CI run whose artefact is reviewed), reviewed on purpose, and committed.
4. A first full run; every failure is either fixed in its own ticket or quarantined with an owner and a ticket.
5. The strategy, the interim policy and the manifest updated to say what runs and when.

## Invariants

- Smoke and comprehensive gates keep running unchanged.
- No snapshot is updated in bulk to make a run green.
- No document describes the matrix as running before a CI run proves it.

## Implementation plan

1. Owner decision recorded; design review.
2. Generate and review the visual baselines.
3. Add the mobile WebKit project and the workflow, and run it by manual dispatch on a throwaway branch until it is green or every failure is ticketed.
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

- [x] The owner's decisions are recorded. → schedule: nightly; mobile Safari: added in this ticket (both 2026-11-07).
- [ ] A mobile WebKit project runs as part of the matrix. → Partial: `mobile-webkit-web` is selected by `test:e2e:matrix` (41 tests listed); not yet seen running in CI.
- [ ] The matrix is seen running in CI on its nightly schedule and by manual dispatch, failing on a broken spec and passing on a good one.
- [ ] Visual baselines are committed after an intentional review.
- [ ] Every failure from the first run is fixed or quarantined with an owner and a ticket.
- [ ] The strategy, the interim policy and the manifest match what runs. → Partial: they describe the workflow as Implemented-unverified; to be moved to "Running in CI" only after a run is seen.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Fixing browser-specific bugs found by the first run: each gets its own ticket.
- Staging release UAT on the TTW-068 temporary environment (TTW-053 residual).

## Design review

**Design (2026-11-07), branch `codex/ttw-176-run-browser-matrix-in-ci` from `main` 32f1ecb.**

Session constraint: the owner asked for a local commit only, nothing pushed. A `workflow_dispatch` can only start a workflow that exists on the default branch, and a `schedule` only fires there, so every acceptance criterion that needs a real CI run stays open until `main` is pushed. This change prepares everything that can be built and checked locally; the ticket stays Partial.

1. **Mobile Safari project.** `mobile-webkit-web` in `playwright.config.ts`: `devices['iPhone 13']` (WebKit, 390×664, touch, `isMobile`), same `testMatch` as the other web projects (`web/*.spec.ts`), base URL `WEB_URL`. Added to `test:e2e:matrix`. No visual project on WebKit: baselines stay limited to the two Chromium home shells (interim policy, "Visual regression policy").
2. **Workflow `.github/workflows/playwright-matrix.yml`**, a copy of `playwright-comprehensive.yml`'s services, env and setup steps so the matrix runs against the same stack:
   - triggers: `schedule` `0 3 * * *` (one hour after comprehensive at 02:00 UTC, so the two do not compete for runners) and `workflow_dispatch`;
   - dispatch input `update_snapshots` (boolean, default false): runs only `setup` + the two visual projects with `--update-snapshots=all` and uploads `tests/e2e/visual/**/*-snapshots/**` as an artefact. Nothing is committed by CI; a person reviews the images and commits them. This is how the Linux baselines are produced (Playwright names them `…-linux.png`, so macOS-generated images could never be used by CI anyway);
   - `concurrency: { group: workflow-ref, cancel-in-progress: false }`. Unlike comprehensive, triggers here do not supersede each other (a nightly and a manual run test the same commit), so cancelling would only throw away a result. A second trigger waits in the queue; GitHub keeps at most one pending run per group, so two runs never compete;
   - `playwright install --with-deps chromium firefox webkit`;
   - `--fail-on-flaky-tests`: CI keeps `retries: 1` (config), and a test that passes only on retry now fails the run instead of showing green (strategy, "Retries expose flakes");
   - job and step timeouts sized from the local run; HTML report and `test-results/` (traces, videos) uploaded on failure.
3. **Documents.** The strategy, the interim policy and `docs/12-testing-strategy.md` name the workflow and the new project with the status **Implemented-unverified**: the workflow exists but no CI run has been seen. Nothing claims the matrix runs (invariant). The manifest's 25 `"matrix"` rows already describe the intended tier and need no change until a run proves them.
4. **Local evidence.** A full `pnpm test:e2e:matrix` on macOS, to find Firefox / WebKit / mobile failures early. Visual projects are expected to fail locally (no baselines). macOS WebKit is not Linux WebKit, so this is an early signal, not the first CI run of acceptance criterion 5.

Alternatives rejected: generating baselines locally in the Playwright Docker image (needs the whole stack, Postgres, Redis and four servers, inside the container; the dispatch input is simpler and runs on the exact CI image); a job inside `playwright-comprehensive.yml` (it runs on every push, the matrix must not).

Risks: the matrix stays red until the baselines are committed (expected; first step after the push); Firefox/WebKit install adds a few minutes per run; `--fail-on-flaky-tests` may turn the first runs red on existing flakes, which is the point.

Not touched, to stay clear of TTW-085 running in parallel: `docs/11-development-setup.md`, anything under `apps/`.

**Independent design review (2026-11-07, separate reviewer agent, read-only): PASS**, no blocking finding. Minor points and how they were folded in:

1. A queued `update_snapshots` dispatch could be dropped by a later nightly in the same group → the snapshot run gets its own concurrency group (`…-snapshots`).
2. Call Playwright directly for the snapshot path, and check that `--fail-on-flaky-tests` really reaches Playwright through the pnpm script → done; checked with `--list` (see evidence).
3. Firefox does not support `isMobile`, so the tablet/mobile `describeViewportMatrix` blocks of the web `*.comprehensive.spec.ts` specs will probably fail under `firefox-web` → recorded below as an expected first-run failure for criterion 5, to be ticketed or quarantined after the first CI run, not fixed here.
4. Timeouts copied from comprehensive would be too short → job 75 min, matrix step 55 min, to be tuned from the first CI run.
5. Docs wording → rows say "workflow added, Implemented-unverified", the "Intentional capability differences" line is updated, nothing says "nightly" in the present tense.
6. The first nightly after the push is red until baselines are committed → push → dispatch with `update_snapshots` → review → commit sequence written in "Completion summary".

Local evidence (design point 4) could not be produced: this machine has no Docker and no PostgreSQL, and port 3001 is used by an unrelated local project, which a local Playwright run would silently reuse (`reuseExistingServer` outside CI). Installing a database was outside the agreed plan, so the first real run of the matrix will be the CI one.

## Implementation reviews

**Review 1 (2026-11-07, separate reviewer agent, read-only): PASS**, no blocking finding. It checked the workflow expressions under `schedule` and dispatch, that the baseline path cannot commit, the artefact glob, the failure upload, the timeouts, the new project, the unchanged smoke/comprehensive scripts, the "no running claim" invariant in every document, and the scope (nothing under `apps/`). Minor points:

1. Ticket said "committed locally" before the commit existed → true once this change is committed (it is the last step of this session).
2. `docs/11-development-setup.md:92` still lists the matrix as "Chromium + Firefox/WebKit web projects" → left alone on purpose (TTW-085 edits that file in parallel); added to remaining work.
3. The interim policy's "Full matrix" row now says "nightly once a CI run proves it", so it does not go stale.
4. This review recorded here.
5. The reviewer did not rerun the `--list` commands; they are rerunnable as written.
6. The baseline path no longer installs Firefox and WebKit (Chromium only).

## Verification evidence

Local, 2026-11-07, worktree on `codex/ttw-176-run-browser-matrix-in-ci` (Node 24.22.1, Playwright 1.62.1):

- `CI=1 pnpm test:e2e:matrix --list` → `Total: 319 tests in 35 files`; per project: setup 3, chromium-web 41, chromium-app 44, chromium-admin 41, chromium-journeys 20, firefox-web 41, webkit-web 41, mobile-chromium-web 41, **mobile-webkit-web 41**, chromium-a11y 4, chromium-visual 1, mobile-visual-web 1. This also proves `playwright.config.ts` loads (no TypeScript project covers that file).
- `CI=1 pnpm test:e2e:matrix --fail-on-flaky-tests --list` → accepted (`Total: 319 tests`), while `--bogus-flag-check` fails with `error: unknown option`: the flag reaches Playwright through the pnpm script.
- Smoke and comprehensive scripts are unchanged and name their projects explicitly, so they cannot pick up `mobile-webkit-web` (invariant 1).
- `pnpm workflows:validate` → `Workflow validation passed.`; `pnpm workflows:validate:test` → 6 pass, 0 fail.
- `pnpm docs:validate` → `Documentation validation passed.`; `pnpm playwright:validate` → `Playwright manifest validation passed.`
- `pnpm format:check` → `All matched files use Prettier code style!`
- `pnpm lint` → 6/6 tasks successful; `pnpm typecheck` → 6/6 tasks successful.
- Not run: the matrix itself (no Docker/PostgreSQL on this machine, port 3001 taken by another project; see design review). No CI run: nothing pushed, by the owner's instruction.

## Completion summary

**Done (local commit, not pushed):** `mobile-webkit-web` project (iPhone 13) added to `playwright.config.ts` and `test:e2e:matrix`; `.github/workflows/playwright-matrix.yml` (nightly 03:00 UTC + manual dispatch, `update_snapshots` input for Linux baselines, concurrency without cancellation, `--fail-on-flaky-tests`, report upload on failure); strategy, interim policy and `docs/12-testing-strategy.md` describe it as Implemented-unverified.

**Deviation from plan:** no local matrix run (environment, see design review). The visual-baseline step is a workflow input instead of a separate local generation.

**Remaining, in order (each needs the owner's go-ahead to push):**

1. Merge into `main` and push. Until step 3 is done, the nightly run is expected to be red on the two visual tests (no baselines).
2. `gh workflow run playwright-matrix.yml -f update_snapshots=true`, download the `playwright-visual-baselines` artefact, review the two images on purpose, commit them under `tests/e2e/visual/*-snapshots/`.
3. Dispatch the matrix: record the first full run. Expected first-run failure to check: Firefox does not support `isMobile`, so the tablet/mobile `describeViewportMatrix` blocks of the web `*.comprehensive.spec.ts` specs will probably fail under `firefox-web`. Every failure gets its own ticket or a quarantine with owner, ticket and expiry.
4. Prove failure detection: one dispatch on a deliberately broken spec (red), then the good one (green); watch one scheduled run.
5. Tune the job/step timeouts from the measured run; move the documents to "Running in CI"; tick the remaining criteria.
6. Once TTW-085 has landed, update `docs/11-development-setup.md:92` (the matrix line misses mobile WebKit, accessibility and visual projects).
