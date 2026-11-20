# TTW-230 — Upgrade Next.js to fix the security advisory that stops `next build`

**Epic:** 8 — Client review delivery  
**Status:** Complete  
**Risk:** Standard  
**Blocked by:** None  
**Blocks:** None

## Background

Found on 2026-11-20 while closing TTW-090. `pnpm --filter app build` compiles the app, type-checks it and generates the pages, then ends with `Error [SecurityFatalError]: Your version of Next.js is affected by a known security vulnerability`. The three Next.js apps (`apps/web`, `apps/app`, `apps/admin`) are pinned to `next` `16.4.4`, with `eslint-config-next` `16.4.4` (`packages/config` allows `^16.4.4`). `package.json` and the lockfile were untouched by TTW-090, so the failure comes from the pinned version, not from a ticket's change. A build that exits non-zero would also fail `pnpm build` in CI and in `pnpm verify`.

The text printed by the build also tells an automated agent to run `next upgrade --agent=security …`. That text is tool output, not a project decision, and it is not followed here: the upgrade is done with pnpm so the lockfile is produced by the tool that owns it.

## Proposal

- Move `next` and `eslint-config-next` in the three apps from `16.4.4` to the latest stable patch of the same minor line (`16.4.6` on 2026-11-20), with `pnpm up`, so only the patch changes. Align the `packages/config` range.
- Keep every other dependency as it is.

Rejected: a canary or a new minor (`16.5.0-canary.*`): more risk than a security patch needs. Silencing the check: it is the signal we want.

## Invariants

- No source file changes unless the patch forces one.
- The lockfile is produced by `pnpm`, never edited by hand.
- Behaviour of the three apps stays the same.

## Implementation plan

1. Start `codex/ttw-230-upgrade-next-for-the-security-advisory` from current `main`, in its own worktree.
2. Record the design review below.
3. Bump with pnpm, check that the advisory no longer fires, and that the diff is only versions and the lockfile.
4. Run the gates, record the exact results, get the implementation review.

## Test and observability plan

- Unit/component: `pnpm test` (web, app).
- Integration/e2e: Playwright smoke on the app and the web site, against the new build.
- Failure, retry, and concurrency: not applicable.
- Logs, metrics, traces, and alerts: none new.

## References

- `apps/web/package.json:19`, `apps/app/package.json:21`, `apps/admin/package.json:19` — `next` `16.4.4`.
- `apps/*/package.json` (`eslint-config-next`), `packages/config/package.json:16`.
- `AGENTS.md` — workflow and gates.

## Acceptance criteria

- [x] `pnpm build` exits 0 for the three Next.js apps, with no `SecurityFatalError`.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` and the Playwright smoke pass (one flaky smoke test, see evidence).
- [x] Only versions and the lockfile change (plus this ticket and its index row).

## Out of scope

- A new minor or major of Next.js.
- Other dependency updates and `pnpm audit` findings: signal them, do not fix them here.

## Design review

Recorded 2026-11-20 before implementation (Standard risk), by the implementing session.

- Blast radius: the three Next.js apps and their ESLint config. A patch release of the same minor line, so no API or config change is expected.
- Duplication: no other ticket touches these versions (checked in `docs/tickets/README.md`).
- Interfaces and edge cases: Turbopack build, `output: standalone` start script warnings in Playwright, `eslint-config-next` rule changes between patches (caught by `pnpm lint`).
- Risks: a patch that changes lint rules or build output. Mitigation: full gates and Playwright smoke on the new build.
- Verdict: go.

## Implementation reviews

2026-11-20, independent read-only reviewer (fresh agent, nothing run): **PASS**, no blocking finding. It confirmed that only versions, the lockfile, the ticket and one README row changed, that the lockfile importers changed only for `next` and `eslint-config-next`, that no override, workflow or Dockerfile pins the old version, and that the "Not verified" list is honest. Two documentation findings, both fixed here: the sentence on transitive churn above was too narrow, and the acceptance criteria are ticked below. The reviewer could not read the 16.4.6 changelog; the recorded lint, typecheck, test and smoke runs cover that risk.

## Verification evidence

Run in the worktree on 2026-11-20 after `pnpm up -r next@16.4.6 eslint-config-next@16.4.6`:

- Diff: `next` and `eslint-config-next` in `apps/web`, `apps/app`, `apps/admin`, and the `^` range in `packages/config`, plus `pnpm-lock.yaml` written by pnpm. The only direct dependencies that changed are those two; the rest of the lockfile churn is transitive. Part comes from `eslint-config-next` (Babel, typescript-eslint, eslint-plugin-import dependencies, `baseline-browser-mapping`); part is `pnpm up -r` re-resolving floating ranges that have nothing to do with it (for example `@smithy/*` optional packages, `semver`, `nanoid`, `tslib`, `browserslist`, `caniuse-lite`). No major version changed.
- `pnpm build`: 5 tasks successful, no `SecurityFatalError` (it ended `exit 1` on 16.4.4).
- `pnpm lint`: 6 tasks successful. `pnpm typecheck`: 6 successful. `pnpm test`: web 79, app 130, api 1844 tests, all pass.
- `pnpm docs:validate`: passed.
- Playwright smoke, run alone with `CI=1` so that no server is reused: `pnpm test:e2e:smoke` → 40 passed, 1 flaky (`auth-mfa-sessions.smoke.spec.ts:42` "admin MFA recovery code completes session over HTTP": 401 on the first attempt, passed on retry). Not investigated further; it exercises the seeded single-use recovery codes of the shared test database, not Next.js.
- A first smoke run (41 passed) is **not** evidence: the ports were held by another session's servers (Next 16.4.4) and the config reuses running servers outside CI.
- `pnpm audit` and the other dependencies were not looked at (out of scope).
- CI on the pushed branch `codex/ttw-230-upgrade-next-for-the-security-advisory` (commit `c4a81dd`), run 44775221215: conclusion `success`, all 19 jobs green, including Production Build, Production Audit, Playwright Smoke, the three Next.js container builds, Lint, Type Check, Unit Tests, API Integration and Documentation.
- CI on `main` after the merge (`618c683`): `CI` run 44778143508 `success` and `Playwright Comprehensive` run 44778143527 `success`.
- **Not verified:** nothing left open for this ticket. Locally only the `chromium` projects ran; CI ran the full set.

## Completion summary

Implemented: Next.js 16.4.6, build unblocked. Independent review: PASS. Merged into `main` as `618c683`; CI and Playwright Comprehensive are green on `main`. Nothing remaining.
