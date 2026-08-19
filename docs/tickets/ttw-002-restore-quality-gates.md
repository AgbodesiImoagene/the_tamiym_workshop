# TTW-002 — Restore truthful quality gates

**Epic:** 0 — Trustworthy delivery system  
**Status:** Not started  
**Risk:** Standard  
**Blocked by:** TTW-001  
**Blocks:** TTW-003, TTW-004, TTW-022, TTW-050

## Background

The repository's declared pull-request gates do not currently produce a trustworthy pass/fail signal. `pnpm lint` exits before checking the workspace because `@tamiym/ui` has no applicable TypeScript ESLint configuration; the API lint script also uses `--fix`, so a verification command may mutate source. `pnpm format:check` reports 195 files, mixing authored files with generated Prisma output. All 45 API unit suites and 380 tests pass, but coverage is below the configured global thresholds: 42.96% statements, 37.67% branches, 42.30% functions and 43.01% lines versus 55/50/55/55. CI therefore advertises gates that cannot pass on the reviewed baseline.

## Proposal

Make every quality command read-only, deterministic and runnable both locally and in CI. Give each authored workspace an explicit ESLint flat configuration, exclude generated/vendor/build artefacts through one documented policy, and format the remaining authored baseline once. Replace the aspirational-but-red coverage threshold with a committed debt ratchet: record the measured authored-code baseline, require non-decreasing global coverage, and require strong diff coverage for changed executable code. Keep critical-flow correctness requirements test-based rather than treating aggregate coverage as a waiver. Publish machine-readable lint, test and coverage artefacts on failure.

## Invariants

- Verification commands never rewrite source, generated output or configuration.
- Authored production code is not excluded merely to improve a metric; every exclusion has a documented category and owner.
- Global coverage floors can only stay level or increase, and changed executable lines meet the agreed diff-coverage floor.
- Passing aggregate coverage never substitutes for the failure, retry, authorization or concurrency tests required by a ticket.
- The same commands and configuration run locally and in CI.

## Implementation plan

1. Capture the pre-change command, toolchain and coverage evidence in this ticket; classify files as authored, generated, vendored, build output or fixtures.
2. Add an ESLint flat config for `packages/ui` and ensure all workspace lint tasks target their owned source files. Remove `--fix` from verification scripts and provide a separately named developer fix command.
3. Centralize ignore policy for generated Prisma sources, build output, reports and intentional fixtures across ESLint and Prettier without excluding authored application files.
4. Apply Prettier to the authored baseline in a dedicated mechanical change, then prove a second formatting pass is a no-op.
5. Add a coverage-ratchet script/config that compares current authored-code totals with a versioned baseline, rejects regressions, and enforces an approved diff-coverage floor. Preserve HTML, LCOV and machine-readable summaries as CI artefacts.
6. Split CI output into independently visible lint, format, unit and coverage checks; fail on missing reports, skipped workspace tasks or test commands that discover no tests unexpectedly.
7. Document how the baseline is raised, how a justified exclusion is reviewed and how generated files are regenerated rather than formatted by hand.

## Test and observability plan

- Unit/component: Add focused tests for coverage-baseline parsing/comparison and path classification if implemented as code rather than declarative tooling.
- Integration/e2e: Run `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm --filter api test:coverage`, `pnpm typecheck` and all production builds twice from a clean checkout.
- Failure, retry, and concurrency: Prove intentional lint, format, global-coverage and diff-coverage regressions each fail the correct isolated CI check; prove an empty/missing report fails closed.
- Logs, metrics, traces, and alerts: Upload concise machine-readable reports and coverage HTML on CI failure; record task duration and cache status so unexplained gate slowdowns are visible.

## References

- `packages/ui/package.json:8-11` — invokes `eslint .` without a package ESLint config.
- `eslint.config.js:1-43` — root fallback does not supply TypeScript file matching/parser support for the UI package.
- `apps/api/package.json:15` — the verification-named lint script includes `--fix`.
- `apps/api/package.json:89-96` — configured global coverage thresholds currently fail.
- `.github/workflows/ci.yml:25-57` — lint, format, unit and coverage are release-facing CI checks.
- `.prettierignore` — current formatting exclusion policy.
- `apps/api/src/generated/prisma/` — generated sources currently appear in formatting failures.

## Acceptance criteria

- [ ] Every workspace's lint task examines its authored TypeScript/JavaScript files and the root `pnpm lint` passes without modifying the tree.
- [ ] `pnpm format:check` passes for all authored files; generated/build/report exclusions are explicit and documented.
- [ ] Coverage CI passes against a committed baseline no lower than the recorded pre-change result and fails any aggregate regression.
- [ ] Changed executable code is subject to the approved diff-coverage floor, with critical paths still governed by ticket-specific tests.
- [ ] Deliberate lint, formatting, no-tests and coverage regressions have automated negative proof.
- [ ] Required quality gates pass twice from a clean checkout with exact evidence recorded below.
- [ ] Contracts, observability and contributor documentation are updated where applicable.

## Out of scope

- Repairing the API integration environment → TTW-003.
- Establishing browser acceptance tests → TTW-004.
- Remediating dependency advisories → TTW-022.
- Raising coverage to an arbitrary long-term target in one formatting/configuration ticket; subsequent feature tickets must raise the ratchet.

## Design review

Record reviewer, date, blast radius, duplication check, path/exclusion taxonomy, coverage and diff-coverage policy, negative-test plan, risks and verdict before implementation.

## Implementation reviews

Record each independent review iteration, findings, fixes, exact clean-tree evidence, dimension verdicts and overall verdict.

## Verification evidence

Pre-scope evidence on 2026-08-18:

- `pnpm lint` — failed in `@tamiym/ui` because all files matching `.` were ignored.
- `pnpm format:check` — failed and listed 195 files, including authored and generated Prisma sources.
- `pnpm exec jest --coverage --runInBand` from `apps/api` — 45/45 suites and 380/380 tests passed; the command failed coverage floors at 42.96% statements, 37.67% branches, 42.30% functions and 43.01% lines.

Record final commands, versions, results, report locations and the approved ratchet values here.

## Completion summary

Summarize the restored gates, exclusions, starting and final coverage floors, remaining debt, CI checks, review evidence and follow-up tickets.
